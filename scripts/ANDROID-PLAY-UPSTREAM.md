# Android Play publisher upstream

Adapted from JSTorrent (`kzahel/jstorrent`) working checkout based at
`5e3af4fdaac41200173ca18fea13a049d7903d08`, 2026-10-29.

Sources: `scripts/android-play.py`, `scripts/test_android_play.py`,
`clients/android/play-rollout.json`, and `.github/workflows/android-play-*.yml`.
The version/changelog parsers are adapted from `scripts/release-android.py`.

Local differences: package identity, existing `app-release.aab` asset name,
Android CI workflow, native repository paths, and exact-source main CI. No
JSTorrent compatibility-ledger exception is accepted here. Upstream defaults
for vitals and rollout dwell times are retained; missing/low-volume data holds
the rollout rather than relaxing the gate.

MIT License

Copyright (c) 2026 Kyle Graehl

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
