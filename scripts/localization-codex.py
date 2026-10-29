#!/usr/bin/env python3
"""Translate and independently review frozen jobs with local ChatGPT Codex CLI."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid

if os.name == "posix":
    import fcntl

import localization_workers as shared
ROOT = shared.ROOT
MAX_LOG = 64 * 1024 * 1024


def command(settings, last_message):
    argv = [settings["executable"], "exec", "--ignore-user-config", "--model", settings["model"],
            "-c", 'model_provider="openai"', "-c", 'forced_login_method="chatgpt"',
            "-c", f'model_reasoning_effort="{settings["effort"]}"',
            "-c", 'service_tier="default"', "--json", "--color", "never", "-o", str(last_message)]
    if settings["permissionMode"] == "bypassPermissions":
        argv.append("--dangerously-bypass-approvals-and-sandbox")
    else:
        argv.extend(["--sandbox", "workspace-write", "-c", 'approval_policy="never"'])
    return argv + ["-"]


def alive(pid):
    if os.name != "posix":
        raise ValueError("process liveness checks require POSIX")
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def lock_owner(path):
    """The kernel releases ownership on exit; never unlink a live lock inode."""
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
    handle = os.fdopen(descriptor, "r+")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        handle.seek(0)
        handle.truncate()
        handle.write(str(os.getpid()))
        handle.flush()
        return handle
    except BlockingIOError as error:
        handle.close()
        raise ValueError("another runner owns this platform/locale; stop that owner first") from error
    except BaseException:
        handle.close()
        raise


def stop(process):
    # The CLI can exit before a child, and a child can ignore SIGTERM. Finish
    # the whole owned group even when the direct child's wait already returned.
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        process.wait(timeout=5)
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait(timeout=5)


def events(path):
    if path.stat().st_size > MAX_LOG:
        raise ValueError("worker evidence log exceeds 64 MiB")
    with path.open(encoding="utf-8") as source:
        for line in source:
            if len(line) > shared.MAX_JSON:
                raise ValueError("worker evidence record exceeds 16 MiB")
            yield json.loads(line)


def evidence(log, settings):
    records = list(events(log))
    identifiers = [e["thread_id"] for e in records if e.get("type") == "thread.started"]
    if len(identifiers) != 1 or not any(e.get("type") == "turn.completed" for e in records) or any(e.get("type") in ("turn.failed", "error") for e in records):
        raise ValueError("worker did not complete exactly one identifiable Codex session")
    identifier = str(uuid.UUID(identifiers[0]))
    matches = list((Path(settings["codexHome"]) / "sessions").glob(f"*/*/*/*{identifier}*.jsonl"))
    if len(matches) != 1:
        raise ValueError("worker rollout evidence is missing or ambiguous")
    contexts = [e["payload"] for e in events(matches[0]) if e.get("type") == "turn_context"]
    if not contexts:
        raise ValueError("worker rollout has no launch evidence")
    expected_sandbox = "danger-full-access" if settings["permissionMode"] == "bypassPermissions" else "workspace-write"
    for context in contexts:
        if context.get("model") != settings["model"] or context.get("effort") != settings["effort"]:
            raise ValueError("worker model/effort evidence differs from request")
        if context.get("service_tier") not in (None, "default"):
            raise ValueError("worker used a non-normal service tier")
        if context.get("approval_policy") != "never" or context.get("sandbox_policy", {}).get("type") != expected_sandbox:
            raise ValueError("worker permission evidence differs from request")
    return {"sessionId": identifier, "actualModel": settings["model"], "effort": settings["effort"],
            "serviceTier": "normal", "permissionMode": settings["permissionMode"]}


def verify_completed(worker):
    shared.check_snapshot(worker["jobs"])
    shared.check_worker_outputs(worker)
    for candidate, expected in worker.get("candidates", {}).items():
        if shared.fingerprint(Path(candidate)) != expected:
            raise ValueError("review candidate changed after independent review")


def import_all(state, groups, worker_for):
    settings = state["settings"]
    shared.validate_jobs(settings["platform"], settings["locale"], state["jobs"])
    for index in range(len(groups)):
        verify_completed(worker_for("translate", index))
        verify_completed(worker_for("review", index))
    for index, group in enumerate(groups):
        translator, reviewer = worker_for("translate", index), worker_for("review", index)
        if translator["sessionId"] == reviewer["sessionId"]:
            raise ValueError("translation and review must use separate sessions")
        for job, output in zip(group, reviewer["outputs"]):
            subprocess.run([sys.executable, str(ROOT / "scripts/localization.py"), "import", settings["platform"], settings["locale"],
                            "--job", job["path"], "--response", output, "--translator", translator["actualModel"] + "/" + translator["sessionId"],
                            "--reviewer", reviewer["actualModel"] + "/" + reviewer["sessionId"], "--idempotent"], cwd=ROOT, check=True)
            if job["hash"] not in state["imported"]:
                state["imported"].append(job["hash"])


def run(args):
    work = args.work_dir.resolve()
    if not work.is_relative_to(ROOT.resolve() / ".local"):
        raise ValueError("task state must be under the repository's ignored .local directory")
    work.mkdir(parents=True, exist_ok=True)
    state_path = work / "state.json"
    if args.command == "status":
        state = shared.read_json(state_path)
        print(json.dumps({"workers": [{k: w.get(k) for k in ("phase", "index", "status", "sessionId")} for w in state["workers"]], "imported": len(state["imported"])}))
        return
    if os.name != "posix":
        raise ValueError("local Codex worker ownership currently requires macOS/Linux process groups")
    executable = shutil.which(args.codex)
    if executable is None:
        raise ValueError("Codex CLI is not installed")
    login = subprocess.run([executable, "login", "status"], text=True, capture_output=True, check=True)
    if "Logged in using ChatGPT" not in login.stdout + login.stderr:
        raise ValueError("local runner requires an existing ChatGPT login, not API credentials")
    settings = {"platform": args.platform, "locale": args.locale, "model": args.model, "effort": args.effort,
                "serviceTier": "normal", "permissionMode": args.permission_mode, "jobsPerWorker": args.jobs_per_worker,
                "executable": executable, "codexHome": str(Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).resolve())}
    jobs = shared.snapshot_jobs(args.jobs.resolve(), args.platform, args.locale)
    state = shared.read_json(state_path) if state_path.exists() else {"schemaVersion": 1, "settings": settings, "jobs": jobs, "workers": [], "imported": []}
    if state.get("settings") != settings or state.get("jobs") != jobs:
        raise ValueError("resume settings/source jobs changed; use a new work directory")
    lock = ROOT / ".local/localization-codex-locks" / f"{args.platform}-{args.locale}.lock"
    lock.parent.mkdir(parents=True, exist_ok=True)
    ownership = lock_owner(lock)
    active = {}
    def worker_for(phase, index):
        return next((w for w in reversed(state["workers"]) if w["phase"] == phase and w["index"] == index and w["status"] in ("running", "complete")), None)
    groups = [jobs[i:i + args.jobs_per_worker] for i in range(0, len(jobs), args.jobs_per_worker)]
    try:
        for worker in state["workers"]:
            if worker["status"] == "running":
                if alive(worker["pid"]):
                    raise ValueError("a prior worker is still alive; stop its owner before resuming")
                worker["status"] = "interrupted"
            if worker["status"] == "complete":
                verify_completed(worker)
        shared.validate_jobs(args.platform, args.locale, jobs)
        while True:
            shared.check_snapshot(jobs)
            for key, (process, handles, worker) in list(active.items()):
                if any(Path(worker[k]).stat().st_size > MAX_LOG for k in ("log", "stderr")):
                    raise ValueError("worker output exceeds 64 MiB")
                if time.time() - worker["startedAt"] > args.timeout_seconds:
                    raise TimeoutError("local Codex worker exceeded its bounded duration")
                if process.poll() is None:
                    continue
                process.wait()
                stop(process)
                for handle in handles:
                    handle.close()
                if process.returncode != 0:
                    raise RuntimeError(f"{worker['phase']} worker failed; inspect {worker['stderr']}")
                for job, output in zip(worker["jobs"], worker["outputs"]):
                    shared.validate(args.platform, args.locale, job, Path(output))
                worker.update(evidence(Path(worker["log"]), settings))
                worker.update(status="complete", completedAt=time.time(), outputHashes={p: shared.fingerprint(Path(p)) for p in worker["outputs"]})
                verify_completed(worker)
                del active[key]
                shared.save(state_path, state)
                print(f"Completed {worker['phase']} group {worker['index'] + 1}: {worker['sessionId']}", flush=True)
            for phase in ("review", "translate"):
                for index, group in enumerate(groups):
                    if len(active) >= args.concurrency or worker_for(phase, index):
                        continue
                    translator = worker_for("translate", index)
                    if phase == "review" and (translator is None or translator["status"] != "complete"):
                        continue
                    if phase == "review":
                        verify_completed(translator)
                    candidates = list(map(Path, translator["outputs"])) if phase == "review" else []
                    directory = Path(tempfile.mkdtemp(prefix=f"{phase}-{index + 1}-", dir=work))
                    outputs = [directory / Path(j["path"]).name for j in group]
                    log, error = directory / "events.jsonl", directory / "stderr.log"
                    prompt = shared.worker_prompt(phase, args.platform, args.locale, group, outputs, candidates)
                    (directory / "prompt.txt").write_text(prompt, encoding="utf-8")
                    candidate_hashes = {str(p): shared.fingerprint(p) for p in candidates}
                    worker = {"phase": phase, "index": index, "jobs": group, "outputs": list(map(str, outputs)),
                              "candidates": candidate_hashes, "log": str(log), "stderr": str(error),
                              "startedAt": time.time(), "status": "running"}
                    handles = [log.open("wb"), error.open("wb")]
                    try:
                        process = subprocess.Popen(command(settings, directory / "last-message.txt"), cwd=ROOT, stdin=subprocess.PIPE, stdout=handles[0], stderr=handles[1], start_new_session=True)
                    except BaseException:
                        for handle in handles:
                            handle.close()
                        raise
                    worker["pid"] = process.pid
                    active[(phase, index)] = process, handles, worker
                    state["workers"].append(worker)
                    shared.save(state_path, state)
                    process.stdin.write(prompt.encode("utf-8"))
                    process.stdin.close()
                    print(f"Started {phase} group {index + 1} ({sum(j['count'] for j in group)} resources)", flush=True)
            if all((worker_for("review", index) or {}).get("status") == "complete" for index in range(len(groups))):
                break
            time.sleep(args.poll_seconds)
        if args.import_reviewed:
            import_all(state, groups, worker_for)
        shared.save(state_path, state)
        print(f"All {len(jobs)} jobs independently reviewed; {len(state['imported'])} imported.", flush=True)
    finally:
        for process, handles, worker in active.values():
            stop(process)
            for handle in handles:
                handle.close()
            worker["status"] = "cancelled"
        if active:
            shared.save(state_path, state)
        ownership.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["run", "status"])
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--platform", choices=["web", "desktop", "android", "extension", "ios"])
    parser.add_argument("--locale")
    parser.add_argument("--jobs", type=Path)
    parser.add_argument("--model")
    parser.add_argument("--effort", choices=["low", "medium", "high", "xhigh", "max"], default="high")
    parser.add_argument("--service-tier", choices=["normal"], default="normal")
    parser.add_argument("--permission-mode", choices=["acceptEdits", "bypassPermissions"], default="acceptEdits")
    parser.add_argument("--concurrency", type=int, choices=range(1, 4), default=2)
    parser.add_argument("--jobs-per-worker", type=int, choices=range(1, 5), default=3)
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    parser.add_argument("--poll-seconds", type=float, default=2)
    parser.add_argument("--codex", default="codex")
    parser.add_argument("--import-reviewed", action="store_true")
    args = parser.parse_args(argv)
    if args.command == "run" and (not args.platform or not args.locale or not args.jobs or not args.model):
        parser.error("run requires --platform, --locale, --jobs and an explicit --model")
    if not 30 <= args.timeout_seconds <= 7200 or not 0.1 <= args.poll_seconds <= 30:
        parser.error("duration/poll interval exceeds bounded limits")
    def interrupted(_signal, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    try:
        run(args)
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError, TimeoutError, KeyboardInterrupt) as error:
        print(f"localization-codex: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
