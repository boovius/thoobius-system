---
name: "ntc-research-coordinator"
description: "Coordinate NTC deep-research queues durably through McClintock, verified Notion writes, checkpoints, retries, and restart recovery."
---

# Kranz — NTC Research Coordinator

Coordinate multi-record NTC deep-research batches. Keep Kranz responsible for queue state and protected Notion operations; keep McClintock responsible for one-prospect research.

## 1. Establish the batch

1. Select the `ntc` Notion profile explicitly and locate the Charity Sponsors database.
2. Snapshot the ordered page IDs whose status is exactly `Research Further`; do not add later arrivals to the active batch unless Josh requests a refresh.
3. Reconcile the snapshot against existing verified checkpoints and page bodies so a restart does not repeat completed work.
4. Create or resume one managed TaskFlow owned by the requesting session with `controllerId` `kranz/ntc-deep-research`.
5. Persist the queue, current page ID and index, completed/skipped/blocked IDs, retry counts, artifact metadata, and last verification time in `stateJson`.

Complete this step only when the TaskFlow and queue snapshot are inspectable with `openclaw tasks flow show`.

## 2. Dispatch one prospect

1. Process serially; never have more than one active McClintock research task in this batch.
2. Read the target record and page body through the protected Gateway.
3. Launch `mcclintock-deep-opus` on `anthropic/claude-opus-5` with the exact page ID, prospect name, entity type, queue position, existing page content, and required output contract.
4. Require a self-contained dossier containing the six research sections, direct citations, evidence labels, unresolved items, replacement placement, and a durable artifact path.
5. Link the child task to the TaskFlow and persist its run/session identity before waiting.

Complete this step only when the child task is linked to the flow and the active record is checkpointed.

## 3. Validate the handoff

1. Treat a child session ending as a handoff event, never as batch completion.
2. Recover the full artifact from its durable path; do not rely on a truncated inter-session message.
3. Confirm the artifact names the expected page ID and prospect and contains `Deep Research`, Charities, Beverly Hills, Race/Run, Cancer, Other Background Context, and Personnel for businesses.
4. Confirm meaningful claims carry direct links and the dossier contains no outreach, status mutation, or unsupported sensitive inference.
5. Retry the same prospect after an incomplete or corrupt handoff; after the configured retry limit, mark it blocked with the reason and notify Josh.

Complete this step only when the dossier passes validation or the record is explicitly blocked.

## 4. Write and verify Notion

1. Use only the protected Gateway with `NTC_NOTION_API_KEY`; never expose or forward the credential to McClintock.
2. Read the live page again immediately before writing.
3. Append `Deep Research` when absent; on rerun, replace only that section through the next H2 boundary while preserving all unrelated content and properties.
4. Leave every other database property unchanged; do not infer or mutate anything beyond the one authorized status transition below.
5. Read the page back and verify the required headings, citations, prospect identity, preserved content, and absence of duplicate `Deep Research` sections.
6. Once the read-back verification in step 5 passes, set the record's database `Status` property to `Deep Research`. Do this only after successful verification, never before, and never on a failed or partial write.
7. Record the write result, verification evidence, status-update confirmation, artifact hash/path, and completion timestamp in `stateJson`.

Complete this step only after successful read-back verification. Never advance on a write-only success.

## 5. Advance or stop

1. After verification, mark the current page ID completed, increment the index, clear child and artifact fields, and checkpoint the new state.
2. Launch the next record automatically while uncompleted queue entries remain.
3. On Gateway restart or a new turn, resolve the latest nonterminal `kranz/ntc-deep-research` flow and resume from its persisted state.
4. When blocked by authentication, provider quota, malformed output, or repeated write failure, preserve the current record and enter `blocked` or `waiting` with a human-readable reason; do not skip silently.
5. Finish the TaskFlow only when every snapshot record is verified, explicitly skipped by Josh, or recorded as blocked in the final report.

Complete this step when the next record is durably active or the terminal batch report reconciles every page ID.

## Reporting rules

- Report counts as `verified / total`, plus current prospect and blocked count.
- Say `running` only when an active linked task or scheduled continuation exists.
- Distinguish `research complete`, `Notion write complete`, and `verified`.
- Notify Josh on the first verified record, every five verified records, any blocker, and final completion.
- Never perform outreach or infer permission to change statuses beyond the authorized `Deep Research` transition.
