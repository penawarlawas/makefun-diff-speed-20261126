# Diff two texts faster

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/penawarlawas/makefun-diff-speed-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/penawarlawas/makefun-diff-speed-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for make.fun's `makefun-diff 1.0.0`, entered in
[make.fun's "Diff two texts faster, 27 November 2026" bounty](https://make.fun/bounty/diff-speed-01-run-20261126).

`solve.js` answers every case exactly the way `makefun-diff 1.0.0` does — same patch format, same
edit-script tie-break — and is much faster on large texts: it interns the lines of both texts to
integer ids so the Myers search compares integers instead of strings, keeps the whole greedy
Myers state in `Int32Array`s (no per-edit object allocation), replays the run counts straight
from the per-`d` trace, and builds the patch in one array join.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<dir> node main.ts
```

`main.ts` reads `/input/cases.json` (a JSON array of `{ id, input }`), answers every case with
`run(input)` from `solve.js`, and writes `/output/answers.json`.
