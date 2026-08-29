# Daily Workflow Improvement - Option A Next Steps

Goal: replace the old 1:00 PM shell-script prompt sender with a true internal OpenClaw isolated run that performs one workflow-improvement task and only delivers the finished summary.

## Already done

- Disabled the existing system crontab entry that sent the raw prompt directly to Josh's Telegram chat.
- Replaced the legacy shell script body with a disabled stub explaining why it was turned off.

## Desired architecture

At 1:00 PM Pacific:

1. scheduler triggers an isolated OpenClaw run
2. run receives the internal workflow-improvement instruction
3. Thoobius completes one workflow-improvement task
4. result is logged to Notion in a `Daily Workflow Improvements` database
5. only the finished-result summary is delivered to Josh

## Recommended implementation pieces

### 1. OpenClaw cron job
Create an isolated `agentTurn` cron job instead of using system `crontab` + `message send`.

### 2. Internal prompt
Use the existing workflow-improvement instruction as the cron payload message, but keep it fully internal to the run.

### 3. Delivery
Use result delivery only after work completes, rather than sending the raw prompt to Telegram.

### 4. Notion logging
Add a `Daily Workflow Improvements` Notion database with fields such as:
- Name
- Date
- Area
- What changed
- Why it helps
- Suggested next step
- Repo / Location
- Delivered to Josh?

## Implementation caution

Do not assume the old `.openclaw/cron/jobs.json` file is authoritative. On this host, the active scheduler surface is the OpenClaw Gateway cron system.

Verified useful job shape:
- `sessionTarget: "isolated"`
- `payload.kind: "agentTurn"`
- `delivery.mode: "announce"`
- `delivery.channel: "telegram"`
- `delivery.to: "1178408935"`

See `docs/system/daily-workflow-improvement-cron-spec.md` for the ready-to-use recurring job template and rollout checklist.

## Recommended next action

Create the recurring isolated OpenClaw cron job from the new spec, then build the Notion logging database as the next layer.
