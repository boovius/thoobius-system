## Summary
Salvage the small set of useful **pure derivation/projection helpers** from PR #77 by recreating them cleanly in `src/belt/` as bounded structural helpers for the newer emissions seam.

This should be a focused modeling/helpers issue, not a persistence or UI issue.

## Why this matters
The best salvageable part of PR #77 is not its database wiring or broad model-spine concept. It is the narrower idea that BELT can derive a few stable structural projections from authored/compiled scenario structure and use those projections as inputs to downstream emissions work.

That is useful now because the current emissions direction needs lightweight, deterministic structural helpers, but does **not** yet need extra DB tables or synchronized persisted projections.

Persistence should wait until there is a concrete downstream consumer that truly benefits from stored projections rather than deriving them on demand. Until then, extra tables and sync logic add coupling, drift risk, and maintenance surface without enough payoff.

## In scope
Recreate a bounded helper layer in `src/belt/` for structural derivation that supports emissions-facing work such as issues #83-#86.

Target capabilities:
- stable process identity helpers
- material input/output edge extraction
- terminal/product candidate derivation
- authored core-product hint reconciliation
- stale-hint detection/warning
- strong structural tests for the above behavior

## Out of scope
Explicitly defer all of the following from this issue:
- DB tables
- RPC sync
- backend persistence wiring
- trigger/migration work
- UI/editor changes
- broad process-authoring redesign

## Deliverables
### 1. Stable process identity helpers
Add helpers that produce stable, deterministic process identities from the current authored/compiled structure.

Goals:
- make downstream derivation less index-fragile
- support traceable emissions/activity mapping
- avoid binding the rest of the codebase to ad hoc loop-local identifiers

### 2. Material input/output edge extraction
Add pure helpers that extract material input/output edge structure from scenario/process data.

Goals:
- give the emissions seam a clean structural view of material flows
- keep extraction logic centralized and testable
- avoid scattering flow-walking logic across emissions code

### 3. Terminal/product candidate derivation
Add bounded derivation helpers for candidate terminal outputs / product-like outputs.

Notes:
- keep this deterministic and structurally grounded
- avoid overclaiming semantic certainty where the authored model is still incomplete
- prefer "candidate" framing when the derivation is heuristic

### 4. Authored core-product hint reconciliation
Where the authored model contains a core-product hint, reconcile that hint against structurally derived candidates.

Expected behavior:
- honor authored intent when it is compatible with structural reality
- detect when a previously authored hint no longer matches the current structure
- emit a stale-hint warning or equivalent surfaced signal rather than silently pretending the hint is still valid

### 5. Preserve the best structural tests conceptually
Preserve the strongest ideas from PR #77’s tests, but rewrite them to fit the new helper layer and current BELT direction.

In particular, keep tests around:
- stable identities
- extraction of material edges
- candidate terminal/product derivation
- authored hint reconciliation
- stale-hint warning behavior

## Design constraints
- Keep helpers pure and easy to call from the emissions seam.
- Put them in `src/belt/`, not in UI code and not behind persistence machinery.
- Prefer small composable helpers over a large "model spine" abstraction.
- Name things in terms of current BELT concepts and the newer emissions direction.
- Treat these helpers as projections/derivations, not canonical stored truth.

## Why persistence is deferred
Do not persist these projections yet.

Reasoning:
- there is not yet a concrete downstream consumer that requires stored structural projections
- deriving on demand is simpler while the shape is still evolving
- persistence would create synchronization obligations between authored state, compiled state, and projection tables
- that extra coupling is especially risky while the emissions seam and process authoring semantics are still settling

If a later consumer genuinely needs queryable persisted projections, we can add persistence then with a narrower and better-validated contract.

## Expected outcome
A compact structural helper layer that gives the emissions seam the derivation support it needs now, while avoiding the unnecessary database and sync baggage from PR #77.

## References
- PR #77
- Issue #72
- Issues #83-#86
