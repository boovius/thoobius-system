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
3. Confirm the artifact names the expected page ID and prospect and contains exactly one `Contact Info` section, one `Deep Research` section plus Charities, Beverly Hills, Race/Run, Cancer, Personnel, and Other Background Context, and one `Citations` section holding a source table.
4. Confirm meaningful claims carry direct links and the dossier contains no outreach, status mutation, or unsupported sensitive inference.
5. Retry the same prospect after an incomplete or corrupt handoff; after the configured retry limit, record it as terminally blocked with the reason.

Complete this step only when the dossier passes validation or the record is terminally blocked.

## 4. Write and verify Notion

1. Use only the plugin-authorized Gateway action handshake with the protected NTC credential; never expose or forward the credential to McClintock.
2. Read the live page before writing.
3. Append `Contact Info`, `Deep Research`, and `Citations` when absent; on rerun, replace only those sections through their next H2 boundary while preserving unrelated content and properties.
4. Read the page back and verify all three headings, citations table, prospect identity, preserved content, and absence of duplicate sections.
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

1. Keep schedules and watchdogs wake-only; protected Notion egress runs in a fresh admitted controller turn.
2. Resume the exact TaskFlow revision and tick until the controller returns a revision-locked action. Execute that exact action through the Gateway protected executor, never the controller shell; verify it with `kranz_flow_execute_pending_action` at the same expected revision, then resume ticking.
3. At dispatch, persist the child run/session identity and one tagged deadline watchdog. On completion, store the durable outcome, cancel the tag, and wake the controller immediately; let the watchdog fire only when the handoff is missing.
4. Claim an LLM-free controller only after proving deterministic plugin admission. Otherwise use a minimal model-backed controller turn and state the limitation.
5. Diagnose a stalled continuation in four layers: confirm the schedule or completion event fired, confirm the wake payload executed, confirm the admitted controller turn resolved the owner-scoped flow, then confirm protected execution and user-facing delivery. Treat `found: false` with a healthy owner-session lookup as a session-ownership mismatch.
6. After changing the plugin or wake definition, inspect the plugin source, running Gateway start/version, and stored automation payload separately. A local path install needs no package reinstall, but restart the Gateway to replace its startup plugin snapshot and update or recreate stored payloads before proof.
7. Separate tool exposure from protected-execution admission. If protected exec reports that secret egress lacks an admitted run instance, treat tool resolution as proven and move egress to a freshly admitted controller turn or repair admission propagation; do not expect tool-lookup rewrites to fix authority.
8. If inter-session delivery reports an embedded tool-authority registration mismatch, stop retrying or resetting that route. Invoke the supported Gateway local agent runner against the same durable Kranz session, then require admission proof before saying the run is active.
9. When a linked child appears active past its expected completion, inspect the child result and durable artifact directly. If the artifact is complete but the flow remains at `WAIT_RESEARCH`, reconcile the child handoff into the flow before retrying research or reporting completion.
10. Report current-scope progress as `handled / selected` and queue progress as `verified / total`, plus blocked count and next entry.
11. Send exceptions for retries, validation failures, protected-action failures, authentication or quota trouble, or human decisions; preserve the checkpoint.
12. Send a final scope summary with selected and handled counts, verified and blocked totals, TaskFlow revision, and next queued record or terminal state.
13. Say `running` only when an active linked task or scheduled continuation exists. Distinguish research complete, write complete, verified, checkpointed, and scope complete.
14. Treat the Notion monitor as a human-readable projection, not the source of truth.
15. Never perform outreach or infer permission to change statuses beyond the verified `Deep Research` transition.

## Audit and centralize workflow source

1. When asked whether the workflow is in GitHub, inspect the canonical workflow repository, nested agent repositories, live OpenClaw configuration, automation inventory, and shared runtime-state directory separately; do not infer publication from the presence of local files.
2. Classify every component as pushed and tracked, tracked but unpushed, untracked source/configuration, or runtime-only state. Include the exact repository, branch or commit, and path for inspectable source.
3. Centralize reviewable workflow code in the workflow repository: coordinator plugin source/tests, deterministic scheduler payload, protected Notion helper scripts, sanitized agent definitions, sanitized configuration examples, automation declarations, skills, and operating documentation.
4. Exclude credentials, live secret-bearing configuration, TaskFlow/SQLite databases, agent memories, queue state, page contexts, publication receipts, generated dossiers, and research outcomes. Represent required secrets only by protected-secret names, allowed hosts, and setup documentation.
5. Verify the remote branch contains the committed files before saying the workflow is centralized; report any local-only or runtime-only components explicitly.

Complete this audit only when the user can identify one canonical GitHub location for source and can see a precise list of intentionally excluded runtime data.
