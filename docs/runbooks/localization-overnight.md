# Supervised remaining-language campaign

The checked-in campaign covers **17 remaining locales, French first**, across
React, native desktop/Crostini, extension metadata, Android and iOS. The frozen
English inventory is 510 resources per locale (255 + 21 + 3 + 180 + 51), or
8,670 translations before corrections. English/German remain available.
Website, store listings/screenshots and legacy Chrome App copy are separate.

[`localization-campaign.py`](../../scripts/localization-campaign.py) prepares,
verifies and inspects the queue; **it never launches workers**. A supervising
agent executes the runbook, judges language/product failures, and records
completed locales. Setup does not start an unattended campaign. Give the
generated handoff to an agent when the overnight execution is requested.
The bounded implementation record is [Tactical 023](../tactical/023-remaining-language-supervisor.md).

## Prepare and hand off

```bash
source ~/.profile
source android/scripts/android-env.sh
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
python3 scripts/localization-campaign.py plan --check-env
python3 scripts/localization-campaign.py verify --check-env
python3 scripts/localization-campaign.py status
python3 scripts/localization-campaign.py handoff
```

The default state is ignored `.local/localization-overnight/`; use the same
`--work-dir` on every command if selecting another directory. The generated
`supervisor.md` names the plan and this runbook. Source records, comments,
shared definitions, worker/qualification implementation, profiles and exact
argv arrays are frozen. Apple target imports can change shared `.xcstrings`
files without falsely invalidating frozen English. Altered commands or inputs
reject resume. Never shell-evaluate JSON; execute inspected argv arrays with
`subprocess.run(argv, cwd=repo, check=True)`.

Use the existing local ChatGPT CLI login with **gpt-6.1-sol, high reasoning,
normal speed, workspace-write and no prompts** (`acceptEdits` in the runner).
This deliberately retains this project's permission policy. Do not substitute
Fast, another model, API keys, another account/provider, a work pool or remote
workers when quota is unavailable. The maintained runner checks actual session
evidence and requires distinct translator/reviewer sessions.

Keep **at most two model workers total**, one surface runner/importer at a
time, batch size 80, three jobs per worker and 30-minute worker timeout. Native
qualification, emulator use and catalog mutations are serialized. The
supervisor stops within **10 hours** even if the queue is incomplete; all
17 locales may require multiple nights. Require 10 GiB free before starting;
check disk between batches/platforms and stop below 4 GiB. A runner already in
flight must be stopped and joined before the supervisor exits. Change no
global sleep/power settings; an interrupted host is a resumable stop.

## Execute one locale

1. Inspect Git status, campaign status and existing runner `state.json` files.
   Preserve unrelated work and completed locales. Verify the plan before every
   locale/platform. A live previous owner prevents replacement: inspect its
   PID/process group, then resume only after it exits. Never unlink persistent
   kernel lock files or force-reset the tree.
2. Read the locale's manifest register, System-language probes and quantity
   categories. Author `localization/terminology/<tag>.json` using the existing
   terminology schema and all eleven shared concepts. Its register starts with
   the exact profile guidance; append the product rules from the German schema
   in English, with the target's own preferred terms and consistent formality.
   Review it in a distinct local session, preserving exact candidate/review
   files, hashes and actual session identities under the locale's ignored
   directory. Do not copy German pronouns/preferred terms or JSTorrent review
   attestations. Review every resulting message against this shared guidance.
3. Add only that locale's Android entry to `localization/android/locales.json`,
   with its manifest `androidQualifier` and `androidQuantities`. It points to
   `android/app/src/main/res/values-<qualifier>/strings.xml`. No target XML is
   required before export. Do not yet add the locale to `supportedLocales`.
   iOS imports share files, so never run two Apple importers concurrently.
4. Execute the locale's five `jobs[].export` arrays once, then its five
   `jobs[].run` arrays in order. Keep their exact directories and settings.
   Do not overwrite an active export or candidate/review output. The worker
   commands import only independently reviewed, hash-checked responses; exact
   previous results are reused on resume. Do not manually stamp metadata as
   current or invent a reviewer to unblock an import.
5. Run `scripts/localization.py check SURFACE TAG` for each surface. Resolve
   every missing, stale, conflicting, invalid, unreviewed or terminology issue
   through fresh checked jobs. Changing shared terminology invalidates affected
   jobs; deliberately reconcile those jobs and reviews instead of overwriting
   their frozen inputs. The source records and public protocol remain fixed.
6. Stage the complete locale in all five `supportedLocales` lists, preserve
   existing entries, and remove its preview registrations. Run
   `python3 scripts/localization.py generate`. This is local candidate staging,
   not publication. Ordinary assets must include the candidate before product
   qualification can count it; pseudo/preview builds do not qualify it.
7. Execute the locale's `qualify` argv on macOS after installing the owned
   Android API 28/35 Google APIs system images for the host architecture and
   the project's Playwright Chromium. The command runs catalog/generation,
   type/unit, built browser, extension browser/package, Rust/Crostini/native
   menu, Android source plus both disposable emulator runs, and iOS simulator
   UI/Release-hygiene gates. System probes include script/region Chinese and
   Brazilian Portuguese cases. The browser uses its bundled test browser;
   never borrow a primary browser identity or arbitrary physical device.
8. Record only after every check passes:

   ```bash
   python3 scripts/localization-campaign.py record --locale fr
   python3 scripts/localization-campaign.py status
   ```

   The record requires all five ordinary registrations, complete review
   ledgers, exact Android configuration and a current full qualification
   receipt. Receipts bind English/context, catalogs, review ledgers and harness
   hashes and record both Android APIs. Merely adding a language to a picker
   never completes the queue. Changed inputs make old records stale.
9. Add sanitized results and limitations to Tactical 023, then commit the
   qualified locale with `Topic: localization`. Push coherent completed cohorts
   only within the session's existing push authorization. Keep actual review
   ledgers in Git; raw prompts, session logs and native screenshots stay ignored.
   Continue with the first unqualified locale. Repeat aggregate ordinary build
   and deterministic checks at cohort boundaries and before handoff.

## Failure, interruption and compatibility

On quota/auth failure, source/implementation drift, low disk, worker timeout or
host interruption, preserve frozen jobs, outputs, locks and checkpoints. Stop
and join only owned worker groups; do not reroute or retry indefinitely.
Write `checkpoint.md` in the campaign directory with the current locale/surface,
last successful command, exact failure, live-owner status, pending paths and
next safe argv. This file is an operational note, never qualification evidence.

A product failure removes only the current candidate from ordinary shipping
lists until corrected. Regenerate the last coherent registry, retain its
catalog/review outputs, and document the failure. Do not delete unrelated files,
global caches, AVDs or user data. Restore the current candidate before retrying
its qualification. Missing macOS/iOS tooling is a recorded gap, not a pass.

Resume with `verify --check-env` and `status`, inspect active ownership, then
run the same remaining argv arrays. A different plan is never silently accepted;
when English/context or implementation changes, explicitly reconcile active
jobs and affected shipping translations or create a new campaign directory.
Review the exact diff before regenerating a plan. Do not copy completion files
from an old plan: re-record only current qualification.

This campaign has **no publishing authority**: no store uploads, version/tag
changes, signing, website/updater promotion or rollout changes. Local catalog
qualification does not claim store delivery, signed installation, physical
device, battery/boot endurance or full Windows/Linux/macOS acceptance. Each
released component continues to bundle its own offline catalogs and update
independently. Locale selection stays presentation-only; preserve unknown
future preferences, English fallback, folder grants, settings and existing
native messaging/controller/HTTP compatibility. No ordered rollout is needed.

At completion or timeout, report qualified/remaining/failed locales, commits,
what is running, and the exact resume command. Release any acquired testbed
claims as soon as UI use ends. Scheduling another night is an explicit operator
action; the scripts neither schedule themselves nor publish their outputs.
