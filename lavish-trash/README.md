# Lavish Trash gate-regression evidence

Tested local commit: `5c5d1a1` (on top of the original Trash repair `e3dcb4d`).
Installed baseline: `230419851e9adb850ce117852a3d324eafe171f3`.
Only synthetic files and temporary review sessions were mutated.

## Verified behaviors

- G4: Clear and card unselect remove the pending bulk confirmation; no Trash
  request is submitted, and both source files and the still-open session remain.
- G3: the actual supported review-end succeeds, then a real permission failure
  in the temporary Trash directory produces HTTP 409. The ended card and its
  error remain visible under Live. Restoring permissions and retrying moves it.
- Existing cancellation, local refusal, single completion, mixed bulk
  confirmation and bulk completion continue to pass.
- All visible elements were checked in nine states at 1920 and 390: no overflow.
- The builder directly inspected all 18 final screenshots.

## Repository checks

26 tests pass, zero failures; production build passes; lint exits 0 with one
inherited warning. Typecheck retains 30 inherited errors, as on the prior repair.
The independent gate has not yet been rerun against this new commit.

## Files

Each viewport has library, confirmation, refusal, live-move-failure, done,
cleared-selection, unselected-confirmation, bulk-confirmation and bulk-done PNGs.
The two named click-through videos contain the complete revised scenarios.
`results.json` contains the per-state overflow results; logs attach the checks.

## Publication

This immutable evidence packet is preserved only in `asperty567/lavish-library`,
never upstream. It proves the local repaired source; the source-branch push and
PR baseline alignment are separate publishing steps and must be verified before
claiming the PR contains this commit.
