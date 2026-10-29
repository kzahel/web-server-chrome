import argparse
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("codex_translation", Path(__file__).with_name("localization-codex.py"))
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class CodexTranslationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.settings = {"executable": "codex", "model": "gpt-6.1-sol", "effort": "high",
                         "permissionMode": "bypassPermissions", "codexHome": str(self.root / "codex")}
        self.identifier = "10000000-0000-4000-8000-000000000001"
        self.log = self.root / "events.jsonl"
        self.log.write_text(json.dumps({"type": "thread.started", "thread_id": self.identifier}) + '\n' + json.dumps({"type": "turn.completed"}) + '\n')
        self.rollout = self.root / "codex/sessions/2026/10/28" / (self.identifier + ".jsonl")
        self.rollout.parent.mkdir(parents=True)
        self.context = {"model": "gpt-6.1-sol", "effort": "high", "service_tier": None,
                        "approval_policy": "never", "sandbox_policy": {"type": "danger-full-access"}}
        self.write_context()

    def write_context(self):
        self.rollout.write_text(json.dumps({"type": "turn_context", "payload": self.context}) + '\n')

    def test_exact_local_chatgpt_model_high_normal_and_explicit_permissions(self):
        argv = runner.command(self.settings, self.root / "last.txt")
        self.assertIn("--ignore-user-config", argv)
        self.assertIn("gpt-6.1-sol", argv)
        self.assertIn('forced_login_method="chatgpt"', argv)
        self.assertIn('model_reasoning_effort="high"', argv)
        self.assertIn('service_tier="default"', argv)
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", argv)
        self.assertEqual("-", argv[-1])
        settings = {**self.settings, "permissionMode": "acceptEdits"}
        argv = runner.command(settings, self.root / "last.txt")
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", argv)
        self.assertIn("workspace-write", argv)

    def test_accepts_actual_normal_evidence_and_rejects_changed_settings(self):
        evidence = runner.evidence(self.log, self.settings)
        self.assertEqual(self.identifier, evidence["sessionId"])
        self.assertEqual("normal", evidence["serviceTier"])
        for key, value in [("model", "wrong"), ("effort", "low"), ("service_tier", "priority"),
                           ("approval_policy", "on-request"), ("sandbox_policy", {"type": "read-only"})]:
            original = self.context[key]
            self.context[key] = value
            self.write_context()
            with self.subTest(key=key), self.assertRaises(ValueError):
                runner.evidence(self.log, self.settings)
            self.context[key] = original
        self.write_context()

    def test_requires_completed_identifiable_session_and_rollout(self):
        self.log.write_text(json.dumps({"type": "thread.started", "thread_id": self.identifier}) + '\n')
        with self.assertRaises(ValueError):
            runner.evidence(self.log, self.settings)
        self.log.write_text(json.dumps({"type": "thread.started", "thread_id": self.identifier}) + '\n' + json.dumps({"type": "turn.completed"}) + '\n' + json.dumps({"type": "error"}) + '\n')
        with self.assertRaises(ValueError):
            runner.evidence(self.log, self.settings)

    def test_completed_work_rejects_mutated_review_candidates_and_outputs(self):
        job, output, candidate = self.root / "job.json", self.root / "review.json", self.root / "translation.json"
        for path in [job, output, candidate]:
            runner.shared.save(path, {"value": "original"})
        worker = {"jobs": [{"path": str(job), "hash": runner.shared.fingerprint(job)}], "outputs": [str(output)],
                  "outputHashes": {str(output): runner.shared.fingerprint(output)}, "candidates": {str(candidate): runner.shared.fingerprint(candidate)}}
        runner.verify_completed(worker)
        runner.shared.save(candidate, {"value": "changed"})
        with self.assertRaises(ValueError):
            runner.verify_completed(worker)
        worker["candidates"] = {}
        runner.shared.save(output, {"value": "changed"})
        with self.assertRaises(ValueError):
            runner.verify_completed(worker)

    @unittest.skipIf(os.name == "nt", "POSIX process-group assertion")
    def test_cancellation_terminates_and_joins_owned_worker(self):
        process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"], start_new_session=True)
        self.addCleanup(lambda: process.poll() is None and runner.stop(process))
        runner.stop(process)
        self.assertIsNotNone(process.returncode)
        self.assertFalse(runner.alive(process.pid))

    @unittest.skipIf(os.name != "posix", "POSIX process-group assertion")
    def test_cancellation_kills_descendant_even_after_group_leader_exits(self):
        ready = self.root / "child-ready"
        child = "import signal,time,sys; from pathlib import Path; signal.signal(signal.SIGTERM,signal.SIG_IGN); Path(sys.argv[1]).touch(); time.sleep(60)"
        parent = ("import subprocess,sys,time; from pathlib import Path; "
                  f"p=subprocess.Popen([sys.executable,'-c',{child!r},{str(ready)!r}],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); "
                  f"\nwhile not Path({str(ready)!r}).exists(): time.sleep(0.01)\nprint(p.pid,flush=True)")
        process = subprocess.Popen([sys.executable, "-c", parent], start_new_session=True, stdout=subprocess.PIPE, text=True)
        try:
            output, _ = process.communicate(timeout=5)
            child_pid = int(output.strip())
            self.assertTrue(runner.alive(child_pid))
            runner.stop(process)
            # Orphaned zombies may await the OS reaper; no descendant may keep
            # running or writing after cancellation has returned.
            status = subprocess.run(["ps", "-p", str(child_pid), "-o", "stat="], text=True, capture_output=True).stdout.strip()
            self.assertTrue(not status or status.startswith("Z"), status)
        finally:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=5)

    @unittest.skipIf(os.name != "posix", "kernel advisory lock")
    def test_kernel_lock_excludes_second_owner_and_recovers_after_close(self):
        lock = self.root / "owner.lock"
        lock.write_text("stale diagnostic pid")
        first = runner.lock_owner(lock)
        try:
            inode = lock.stat().st_ino
            with self.assertRaisesRegex(ValueError, "another runner owns"):
                runner.lock_owner(lock)
            self.assertEqual(inode, lock.stat().st_ino)
        finally:
            first.close()
        with runner.lock_owner(lock):
            self.assertEqual(inode, lock.stat().st_ino)

    @unittest.skipIf(os.name == "nt", "fake executable uses a POSIX shebang")
    def test_real_process_scheduler_reviews_and_resumes_without_new_workers(self):
        jobs = self.root / "jobs"
        jobs.mkdir()
        for index in range(2):
            runner.shared.save(jobs / f"web-fr-{index}.json", {"schemaVersion": 1, "platform": "web", "locale": "fr",
                "terminology": {"schemaVersion": 1, "locale": "fr", "register": "Use vous."},
                "resources": {f"resource-{index}": {"kind": "icu", "sourceHash": "source", "terminologyHash": "terms"}}})
        executable = self.root / "fake-codex"
        executable.write_text("#!" + sys.executable + "\n" + r'''
import json,os,sys,uuid
from pathlib import Path
if sys.argv[1:]==['login','status']:
 print('Logged in using ChatGPT');sys.exit(0)
prompt=sys.stdin.read(); tasks=json.loads(prompt.rsplit('Tasks:\n',1)[1])
identifier=str(uuid.uuid4())
root=Path(os.environ['CODEX_HOME']);root.mkdir(exist_ok=True)
with (root/'launches').open('a') as log:log.write(identifier+'\n')
for task in tasks:
 job=json.loads(Path(task['job']).read_text())
 rows={k:{**{f:v[f] for f in ['kind','sourceHash','terminologyHash']},'translation':'Bonjour'} for k,v in job['resources'].items()}
 Path(task['output']).write_text(json.dumps({'schemaVersion':1,'platform':'web','locale':'fr','resources':rows}))
rollout=root/'sessions/2026/10/28'/(identifier+'.jsonl');rollout.parent.mkdir(parents=True,exist_ok=True)
rollout.write_text(json.dumps({'type':'turn_context','payload':{'model':'gpt-6.1-sol','effort':'high','service_tier':None,'approval_policy':'never','sandbox_policy':{'type':'danger-full-access'}}})+'\n')
print(json.dumps({'type':'thread.started','thread_id':identifier}))
print(json.dumps({'type':'turn.completed'}))
''')
        executable.chmod(0o755)
        args = argparse.Namespace(command="run", work_dir=self.root / ".local/work", codex=str(executable), platform="web", locale="fr",
            model="gpt-6.1-sol", effort="high", permission_mode="bypassPermissions", jobs=jobs, jobs_per_worker=1,
            concurrency=2, timeout_seconds=30, poll_seconds=0.1, import_reviewed=False)
        def validate(platform, locale, job, response):
            self.assertEqual(set(runner.shared.read_json(Path(job['path']))['resources']), set(runner.shared.read_json(response)['resources']))
        with patch.object(runner, "ROOT", self.root), patch.dict(os.environ, {"CODEX_HOME": self.settings['codexHome']}), \
             patch.object(runner.shared, "validate_jobs"), patch.object(runner.shared, "validate", side_effect=validate):
            original_popen = subprocess.Popen
            def fail_launch(argv, *positional, **kwargs):
                if argv[1] == "exec":
                    raise OSError("injected worker launch failure")
                return original_popen(argv, *positional, **kwargs)
            with patch.object(runner.subprocess, "Popen", side_effect=fail_launch), self.assertRaisesRegex(OSError, "injected"):
                runner.run(args)
            runner.run(args)
            state = runner.shared.read_json(args.work_dir / 'state.json')
            self.assertEqual(4, len(state['workers']))
            self.assertTrue(all(w['status']=='complete' for w in state['workers']))
            self.assertEqual(4, len({w['sessionId'] for w in state['workers']}))
            runner.run(args)
            self.assertEqual(4, len((Path(self.settings['codexHome'])/'launches').read_text().splitlines()))
            runner.shared.save(Path(state['workers'][-1]['outputs'][0]), {'mutated':'review'})
            with self.assertRaises(ValueError):
                runner.run(args)
            with runner.lock_owner(self.root/'.local/localization-codex-locks/web-fr.lock'):
                pass

    def test_import_rechecks_all_outputs_and_separate_review_before_writing(self):
        workers = {("translate", 0): {"sessionId": "translator", "actualModel": "sol", "outputs": ["t"]},
                   ("review", 0): {"sessionId": "reviewer", "actualModel": "sol", "outputs": ["r"]}}
        job = {"hash": "job", "path": "job.json"}
        state = {"settings": {"platform": "web", "locale": "fr"}, "jobs": [job], "imported": []}
        with patch.object(runner.shared, "validate_jobs"), patch.object(runner, "verify_completed") as verify, patch.object(runner.subprocess, "run") as importer:
            runner.import_all(state, [[job]], lambda phase, index: workers[phase, index])
            self.assertEqual(2, verify.call_count)
            self.assertIn("--idempotent", importer.call_args.args[0])
            self.assertIn("sol/translator", importer.call_args.args[0])
            self.assertIn("sol/reviewer", importer.call_args.args[0])
            self.assertEqual(["job"], state["imported"])
            workers["review", 0]["sessionId"] = "translator"
            with self.assertRaises(ValueError):
                runner.import_all(state, [[job]], lambda phase, index: workers[phase, index])
            self.assertEqual(1, importer.call_count)


if __name__ == "__main__":
    unittest.main()
