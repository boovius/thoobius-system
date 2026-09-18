# Kranz Coordinator

OpenClaw tools for persisted NTC deep-research coordination. The plugin owns the deterministic serial controller state, launches one isolated McClintock research run at a time, validates durable artifacts, and stops at the protected Gateway boundary for Notion reads/writes. It never receives the NTC Notion credential and never performs outreach.

## Tools

- `kranz_flow_start`
- `kranz_flow_link_task`
- `kranz_flow_checkpoint`
- `kranz_flow_tick`
- `kranz_flow_status`

`kranz_flow_tick` is restart-safe and idempotent. It checkpoints and links a McClintock run before dispatching it in the background, then returns immediately. Later ticks observe the durable dossier and child-outcome file, validate the packet, and recover from failed or stale runs without advancing the queue.

A five-minute OpenClaw cron job invokes Kranz. When the tick reaches a protected Notion boundary it returns an explicit Gateway action; the scheduled Kranz turn executes that action and ticks again. TaskFlow remains the machine source of truth and the Notion monitor is only a human-readable projection.

The deterministic headless scheduler payload lives in `cron-tick.js`. It allowlists the three NTC Gateway scripts, stops after one record completes, and only emits owner notifications for five-record milestones, blockers, and final completion.

The controller uses the documented uppercase phases (`SELECT_RECORD`, `DISPATCH_RESEARCH`, `WAIT_RESEARCH`, `VALIDATE_PACKET`, and `WRITE_NOTION`) while accepting the earlier lowercase checkpoint names for in-place migration of the active production flow.

Simple OpenClaw tool plugin.

## Build

```bash
npm install
npm run plugin:build
npm run plugin:validate
npm test
```
