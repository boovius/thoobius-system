# Daily Workflow Improvement - OpenClaw Cron Spec

Purpose: make Option A implementable without rediscovering the cron shape or delivery behavior.

## Verified scheduler facts on this host

From `cron list`:

- OpenClaw cron jobs are managed through the cron tool / Gateway scheduler, not the old `.openclaw/cron/jobs.json` file.
- An isolated worker uses:
  - `sessionTarget: "isolated"`
  - `payload.kind: "agentTurn"`
- User-facing delivery can be attached directly on the job with:
  - `delivery.mode: "announce"`
  - `delivery.channel: "telegram"`
  - `delivery.to: "1178408935"`
- One-shot tests were created with `deleteAfterRun: true`.

## Recommended production shape

Use one recurring isolated cron job at 1:00 PM Pacific that:

1. runs the workflow-improvement instruction internally
2. completes one real task
3. delivers only the final summary to Josh
4. optionally writes the result to Notion once the database exists

## Recommended cron job template

```json
{
  "name": "Thoobius daily workflow improvement",
  "schedule": {
    "kind": "cron",
    "expr": "0 13 * * *",
    "tz": "America/Los_Angeles"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "Daily workflow-improvement work order for Thoobius:\n\nDo one concrete workflow-improvement task for Josh right now, then send back ONLY the finished-result update.\n\nRequirements:\n- Improve an existing workflow, not random novelty.\n- Prefer high-leverage improvements: docs, automations, cleanup, templates, repo workflows, job-search workflows, trip-planning systems, or useful organization.\n- Actually complete something before reporting.\n- Keep external/public actions off-limits unless explicitly approved.\n- Be pleasantly surprising, but prioritize usefulness over cleverness.\n- If there is already an obvious unfinished improvement from recent work, you may continue it.\n- Do NOT echo or restate this prompt.\n- Do NOT reply with setup/process narration.\n- Reply only with the completed-result summary in this format:\n\n—————————————\nSummary / TL;DR\n1. what you changed\n2. why it helps\n3. suggested next step\n\nRecommendation\nOne short recommendation line.",
    "timeoutSeconds": 900
  },
  "delivery": {
    "mode": "announce",
    "channel": "telegram",
    "to": "1178408935"
  },
  "enabled": true
}
```

## Important design rule

Do not use a separate shell script or direct Telegram send step for the prompt itself.

The prompt belongs inside the isolated `agentTurn` payload. Delivery belongs on the finished run output only.

## Safe rollout checklist

1. Confirm there is no remaining active legacy sender for the same 1:00 PM slot.
2. Create the recurring cron job with the template above.
3. Run one manual test before relying on the schedule.
4. Verify Josh receives only the summary, not the raw work order.
5. After Notion logging exists, extend the prompt or workflow to write one row per successful run.

## Known follow-up work

- Create the `Daily Workflow Improvements` Notion database.
- Decide whether Notion logging should happen inside the isolated run or via a second internal automation.
- Add a lightweight audit step for failed or duplicate runs.

## Troubleshooting notes

If behavior looks wrong, inspect the system in layers:

1. scheduler layer, did the job fire?
2. execution layer, did the isolated `agentTurn` run?
3. delivery layer, was `delivery.mode` configured?
4. visible output layer, did Josh get only the summary?

If Josh sees the raw prompt text, the system is still acting like a message sender instead of an internal worker.
