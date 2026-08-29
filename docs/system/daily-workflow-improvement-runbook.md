# Daily Workflow Improvement Runbook

## Problem this solves

The current 1:00 PM workflow-improvement automation is behaving like a **user-facing message sender** instead of an **internal work-order runner**.

That means Josh sees the raw prompt text instead of only seeing the completed-result summary after Thoobius has actually done the work.

## Diagnostic breakdown

### 1. Scheduler layer
The timed job is firing.

### 2. Execution layer
The prompt is being injected successfully enough to create a turn.

### 3. Delivery layer
The current setup is delivering the **instruction prompt itself** to Josh, rather than treating it as an internal instruction and only delivering the finished outcome.

### 4. Visible output layer
Result: Josh receives the raw work-order text, which is not the intended experience.

## Correct target behavior

At 1:00 PM Pacific, the system should:

1. run an internal Thoobius turn with the workflow-improvement instruction
2. complete one concrete workflow-improvement task
3. optionally log the work internally (for example in Notion)
4. deliver **only** the finished-result summary to Josh

## Recommended architecture

### Preferred model
Use an **isolated cron/agent turn** as the worker and keep user-facing delivery separate from the raw prompt.

Desired behavior:
- prompt is internal
- work happens in the isolated run
- output delivered to Josh is only the final summary

### Avoid
Do not use a plain messaging script whose whole job is to send the prompt text to Josh's Telegram chat.

That script pattern is what causes the current leak.

## Practical implementation options

### Option A, best
Use OpenClaw cron with an isolated `agentTurn` and explicit delivery of the result summary only.

This is the cleanest long-term pattern if the cron runtime is healthy.

### Option B, acceptable fallback
Use a local scheduler script that triggers an internal OpenClaw task/session, captures the result, then separately sends only the final summary.

This is better than directly sending the raw prompt by Telegram.

## Notion logging recommendation

Use a dedicated Notion database like:
- `Daily Workflow Improvements`

Suggested properties:
- `Name` (title)
- `Date`
- `Area` (select, e.g. BELT / OpenClaw / Job Search / Relationship Support / System / Docs)
- `What changed` (rich text)
- `Why it helps` (rich text)
- `Suggested next step` (rich text)
- `Repo / Location` (url or rich text)
- `Delivered to Josh?` (checkbox)

## Logging pattern

Each daily run should create one row after the work is complete.

The delivered Telegram summary can mirror the same three-part structure:
- what changed
- why it helps
- suggested next step

That gives:
- a user-facing daily summary
- a durable Notion history of improvements

## Recommended next steps

1. inspect the existing 1:00 PM automation source and replace any direct `message send` behavior
2. move the work order into an internal isolated run path
3. add a Notion `Daily Workflow Improvements` database
4. make the cron write one row per day after successful completion

## Notes

If the OpenClaw cron path is used, verify:
- the run is isolated
- delivery mode sends only the post-work result
- no separate script is also sending the raw prompt to Telegram

If both a cron job and a shell script exist, remove duplication so only one scheduler path is active.
