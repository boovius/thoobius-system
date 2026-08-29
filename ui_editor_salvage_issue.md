## Summary
Salvage the worthwhile UI/editor direction from PR #77 by recreating it cleanly on top of the current BELT authoring and emissions direction, without carrying forward the stale backend/model-spine persistence work from that PR.

This issue is specifically about the **editor-facing process authoring slice**: making process definition clearer, more structured, and better aligned with downstream emissions, unit economics, and TEA.

## Why this matters
BELT needs a cleaner process-definition experience before we pile on more derived logic or persistence. If we improve the editor in the right order, we get better-authored process data, which in turn improves:
- emissions derivation quality
- unit economics fidelity
- TEA readiness
- future scenario validation and diagnostics

The goal here is not to revive PR #77 wholesale. It is to preserve the useful UI/product thinking while rebuilding it against the newer canonical direction, especially issue #72 and the current emissions seam work (#83-#86).

## In scope
Recreate the valuable UI/editor ideas from PR #77 in a clean, staged way:
- clearer process editing structure
- better handling of process inputs/outputs
- author-visible source attribution for inputs
- bounded transport-leg editing
- future-friendly hooks for output behavior
- later visual/layout polish

## Out of scope
Do **not** use this issue to revive or reintroduce:
- model-spine database tables
- RPC sync or backend persistence wiring from PR #77
- stale compiled-shape assumptions that drift away from `authoring_doc`
- broad editor rewrites unrelated to the salvage priorities below

## Recommended sequencing
### 1. Foundation: decompose `ProcessPanel` first
Break `ProcessPanel` into smaller editor components before adding more behavior.

Why first:
- the current surface is too dense to safely extend
- smaller editor pieces will make later input/output semantics less brittle
- this gives us a better place to attach emissions/economic metadata intentionally instead of accreting UI conditionals

### 2. Foundation: make capital and labor first-class process inputs
Rebuild process editing so capital and labor are treated as first-class authored inputs, alongside other process inputs, rather than side metadata or afterthoughts.

Why foundational:
- emissions and TEA both depend on a process model that is broader than material-only edges
- process cost structure is not legible enough if labor/capital are not explicit authoring concepts
- this keeps the UI aligned with the intended process ontology instead of overfitting to the older backend slice

### 3. Foundation: add input source attribution and flow indexing
Add authored source attribution for inputs and explicit flow indexing / stable ordering where needed.

Why foundational:
- users need to tell BELT where an input comes from
- emissions derivation will need cleaner provenance and traceability
- stable flow references make later derived logic and validation less fragile

### 4. Narrow next pass: transport-leg controls
Add transport-leg controls in a deliberately narrow first pass.

Suggested boundary:
- basic transport leg authoring for relevant flows
- enough structure to support later emissions estimation
- avoid broad logistics/system redesign in this issue

Why not first:
- transport depends on cleaner process/input semantics
- it should sit on top of the improved authoring structure, not drive it

### 5. Later: output cascade behavior
Only implement output cascade behavior after flow semantics are better defined.

Why defer:
- output cascade behavior is easy to get wrong if process/output semantics are still fuzzy
- we should not harden editor behavior that encodes premature assumptions about flow propagation

### 6. Nice-to-have later: connector visuals and layout/base-label polish
After the foundational editing work lands, revisit:
- connector visuals
- layout polish
- base-label polish

Why later:
- these are valuable, but not the current bottleneck
- polish should follow the semantic/editor structure, not substitute for it

## Foundational vs nice-to-have
### Foundational
- `ProcessPanel` decomposition
- capital and labor as first-class process inputs
- input source attribution
- flow indexing / stable flow references
- narrow transport-leg controls

These items directly improve process definition quality and create better inputs for emissions, unit economics, and TEA.

### Nice-to-have / later
- output cascade behavior
- connector visuals
- layout polish
- base-label polish

These should follow once the underlying process and flow semantics are stronger.

## Expected outcome
A cleaner process editor that:
- better reflects authored process reality
- supports richer emissions and economics derivation later
- avoids repeating PR #77’s backend coupling mistakes
- gives us a better substrate for scenario authoring evolution

## Implementation notes
- Prefer authoring-model-driven UI changes over compiled-runtime-shape shortcuts.
- Keep this work consistent with issue #72 and the EmissionsData V1 direction.
- If this needs follow-up tickets during implementation, split them after `ProcessPanel` decomposition clarifies the seams.

## References
- PR #77
- Issue #72
- Issues #83-#86
