"""Backend-independent translation jobs, prompts and output validation."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from localization_common import atomic_write
ROOT = Path(__file__).resolve().parents[1]
MAX_JSON = 16 * 1024 * 1024

def read_json(path):
    if path.stat().st_size > MAX_JSON:
        raise ValueError(f"JSON exceeds {MAX_JSON} bytes: {path}")
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON key: {key}")
            result[key] = value
        return result
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique)


def fingerprint(path):
    return hashlib.sha256(json.dumps(read_json(path), sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n")



def snapshot_jobs(directory, platform, locale):
    jobs = []
    seen = set()
    for path in sorted(directory.glob("*.json")):
        data = read_json(path)
        if data.get("platform") != platform or data.get("locale") != locale or data.get("schemaVersion") != 1:
            raise ValueError(f"job does not match requested platform/locale: {path}")
        snapshot_guidance(data, locale)
        resources = data.get("resources")
        if not isinstance(resources, dict) or not 1 <= len(resources) <= 100:
            raise ValueError(f"job must contain 1–100 messages: {path}")
        if seen.intersection(resources):
            raise ValueError("exported jobs contain overlapping resource IDs")
        seen.update(resources)
        jobs.append({"path": str(path.resolve()), "hash": fingerprint(path), "count": len(resources)})
    if not jobs or len(jobs) > 1000:
        raise ValueError("expected 1–1000 exported job files")
    return jobs


def snapshot_guidance(data, locale):
    """Use the register bound to the exported job, never a language default."""
    terms = data.get("terminology")
    if not isinstance(terms, dict) or terms.get("schemaVersion") != 1 or terms.get("locale") != locale:
        raise ValueError("job needs terminology for its target locale; configure guidance and re-export")
    register = terms.get("register")
    if not isinstance(register, str) or not register.strip() or len(register) > 8192:
        raise ValueError("job needs nonempty locale-specific register guidance (maximum 8192 characters)")
    return register


def check_snapshot(jobs):
    for job in jobs:
        if fingerprint(Path(job["path"])) != job["hash"]:
            raise ValueError(f"exported job changed; use a new work directory: {job['path']}")


def validate(platform, locale, job, response):
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/localization.py"), "validate-response", platform, locale,
         "--job", job["path"], "--response", str(response)],
        cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )


def validate_jobs(platform, locale, jobs):
    for job in jobs:
        subprocess.run(
            [sys.executable, str(ROOT / "scripts/localization.py"), "validate-job", platform, locale,
             "--job", job["path"]],
            cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )


def worker_prompt(phase, platform, locale, jobs, outputs, candidates):
    guidance = {snapshot_guidance(read_json(Path(job["path"])), locale) for job in jobs}
    if len(guidance) != 1:
        raise ValueError("translation batches have inconsistent locale register guidance; re-export together")
    register = next(iter(guidance))
    paths = [{"job": j["path"], "output": str(o)} for j, o in zip(jobs, outputs)]
    if phase == "review":
        for entry, candidate in zip(paths, candidates):
            entry["candidate"] = str(candidate)
    return f"""Complete the authorized {locale} {platform} localization {phase} job.
Only write the exact output files below and create their parent directories.
Do not edit product source, catalogs, metadata, tooling or documentation. Do not
commit, create branches/worktrees, inspect devices, run builds, launch subagents,
send messages or run import. Work autonomously to completed files, then give a
brief final summary; do not ask for permission or leave a proposed plan.

Read every exported resource, context, terminology and suggestions. Suggestions
are reference only; confirm actual meaning and grammar. Target locale: {locale}.
Follow this locale's register and wording guidance from the exported snapshot:
{register}
Preserve privacy and network-exposure consequences, foreground-only iOS serving,
and the difference between the launcher/controller and the actual HTTP server.
Keep 200 OK, 200 OK Web Server, Web Server for Chrome, paths, URLs, shell commands, protocol identifiers and port examples unchanged. Use shared terminology naturally with grammatical
inflection. Never copy strings from another project.

Write raw JSON text, not XML/Android-escaped strings. Each response is exactly:
{{"schemaVersion":1,"platform":"{platform}","locale":"{locale}","resources":{{ID:
{{"sourceHash":COPY,"terminologyHash":COPY,"kind":COPY,"translation":TEXT}}}}}}.
Return every requested resource and no extra IDs; copy hashes and kind exactly.
TEXT is a raw string; Android plurals instead use an object with every required
quantity key and its raw translated string.
For Android plurals, include the count formatting argument in any category that
can match multiple numbers in the target language, even if the English branch
omits it. For example, Portuguese one includes 0 and 1; Russian and Ukrainian
one include 1 and 21. A count-free singular phrase is ambiguous there.
Keep all named/positional arguments, ICU argument types, tags and select keys.
Use target-language plural branches; preserve =number special cases, nesting,
apostrophe escaping and # meaning. Native named placeholders retain their names.
Use complete sentences rather than language-specific assembled fragments.

{"You are the independent reviewer. Review EVERY candidate against English, context and terminology, correct errors in a separate output, and retain correct translations. Do not claim native-speaker approval." if phase == "review" else "Translate EVERY source resource; use prior reviewed translations only after checking context and argument roles."}

Validate every file with the nonmutating command:
python3 scripts/localization.py validate-response {platform} {locale} --job INPUT --response OUTPUT
Fix errors before finishing. Do not run import. Files are the deliverable; do
not paste full JSON into chat. Tasks:
{json.dumps(paths, ensure_ascii=False)}
"""



def check_worker_outputs(worker):
    for path in worker["outputs"]:
        if fingerprint(Path(path)) != worker.get("outputHashes", {}).get(path):
            raise ValueError("completed translation output changed before independent review")
