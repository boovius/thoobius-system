---
name: "ntc-research-coordinator"
description: "Coordinate scoped NTC deep-research queue runs."
---

# Kranz — NTC Research Coordinator

Coordinate multi-record NTC deep-research runs. Keep Kranz responsible for run scope, queue state, protected Notion operations, and verification; keep McClintock responsible for one-prospect research.

## 1. Establish the queue and run scope

1. Select the `ntc` Notion profile explicitly and locate the Charity Sponsors database.
2. Snapshot the ordered page IDs whose status is exactly `Research Further`; do not add later arrivals unless Josh requests a refresh.
3. Reconcile the snapshot against verified checkpoints so a restart does not repeat completed work.
4. Create or resume one managed TaskFlow with `controllerId` `kranz/ntc-deep-research`.
5. Persist the queue, current index, completed/skipped/blocked IDs, retry counts, artifact metadata, and last verification time in `stateJson`.
6. Interpret a supplied positive entry count as the next N available snapshot records. When no count is supplied, select every remaining available record. Available excludes completed, explicitly skipped, and terminally blocked page IDs.
7. Call `kranz_flow_set_run_scope` with the exact flow revision and the supplied `entryLimit`, or omit `entryLimit` for all remaining entries.
8. Persist the exact selected page IDs before dispatch. Never default an omitted count to one and never silently extend a numbered run.

Complete this step only when the TaskFlow, frozen queue snapshot, and selected run scope are inspectable.

## 2. Dispatch one prospect

1. Process serially with at most one active McClintock task.
2. Read the selected record and page body through the plugin-authorized protected Gateway action.
3. Launch `mcclintock-deep-opus` through the supported plugin subagent runtime with the exact page ID, prospect name, entity type, queue position, existing page context path, shared artifact path, deterministic session key, and idempotency key.
4. Link the accepted child run to the TaskFlow and persist its run/session identity before waiting.
5. Require a self-contained dossier containing the six research sections, direct citations, evidence labels, unresolved items, replacement placement, and the exact durable artifact path.

Complete this step only when the child task is linked and the active record is checkpointed.

## 3. Validate the handoff

1. Treat child completion as a handoff event, never as run completion.
2. Recover the full artifact from its shared durable path; do not rely on a truncated inter-session message.
3. Confirm the artifact names the expected page ID and prospect and contains exactly one `Deep Research` section plus Charities, Beverly Hills, Race/Run, Cancer, Personnel, and Other Background Context.
4. Confirm meaningful claims carry direct links and the dossier contains no outreach, status mutation, or unsupported sensitive inference.
5. Retry the same prospect after an incomplete or corrupt handoff; after the configured retry limit, record it as terminally blocked with the reason.

Complete this step only when the dossier passes validation or the record is terminally blocked.

## 4. Write and verify Notion

1. Use only the plugin-authorized Gateway action handshake with the protected NTC credential; never expose or forward the credential to McClintock.
2. Read the live page before writing.
3. Append `Deep Research` when absent; on rerun, replace only that section through the next H2 boundary while preserving unrelated content and properties.
4. Read the page back and verify headings, citations, prospect identity, preserved content, and absence of duplicate `Deep Research` sections.
5. After read-back passes, set `Status` to `Deep Research`; never change it after a failed or partial write.
6. Persist the receipt, verification evidence, status confirmation, artifact hash/path, and completion timestamp.

Complete this step only after successful read-back verification and checkpointing.

## 5. Advance or stop

1. After verification, mark the page completed, increment the index, clear transient child fields, and checkpoint. A terminally blocked page also consumes one selected slot.
2. Continue automatically only while selected page IDs remain.
3. When the persisted selection is exhausted, enter `run_scope_complete`, preserve the next available queue entry, and stop. A later explicit request creates a fresh run scope.
4. On restart, resume the latest nonterminal flow and its existing run scope without widening it.
5. Preserve the current record and enter `blocked` or `waiting` on authentication, quota, malformed output, or repeated write failure; never skip silently.
6. Finish the TaskFlow only when every snapshot record is verified, explicitly skipped, or terminally blocked.

Complete this step when the next selected record is active, the requested scope is complete, or the full queue is terminal.

## Detached execution and reporting

1. Run in Kranz's durable session and release the main conversation after admission; register completion watching or an equivalent continuation first.
2. Report current-scope progress as `handled / selected` and queue progress as `verified / total`, plus blocked count and next entry.
3. Send exceptions for retries, validation failures, protected-action failures, authentication or quota trouble, or human decisions; preserve the checkpoint.
4. Send a final scope summary with selected and handled counts, verified and blocked totals, TaskFlow revision, and next queued record or terminal state.
5. Say `running` only when an active linked task or scheduled continuation exists. Distinguish research complete, write complete, verified, checkpointed, and scope complete.
6. Treat the Notion monitor as a human-readable projection, not the source of truth.
7. Never perform outreach or infer permission to change statuses beyond the verified `Deep Research` transition.
