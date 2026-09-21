# Kranz Coordinator

OpenClaw tools for persisted NTC deep-research coordination. The plugin owns the deterministic serial controller state, launches one isolated McClintock research run at a time through the supported plugin subagent runtime, validates durable artifacts, and executes only flow-derived Notion actions through Gateway-hosted exec. It never receives the plaintext NTC Notion credential and never performs outreach.

## Paths

Runtime files default to the shared workflow directory `/home/boovius/.openclaw/workspace/.ntc-state`. The plugin config may override `stateRoot`; a flow may also persist its own `stateRoot`, which takes precedence and remains stable for that flow. `artifactRoot` follows the same precedence and defaults to `<stateRoot>/artifacts`. Paths are resolved inside the shared workspace and paths that escape it are rejected.

```json
{
  "plugins": {
    "entries": {
      "kranz-coordinator": {
        "enabled": true,
        "config": {
          "stateRoot": "/home/boovius/.openclaw/workspace/.ntc-state",
          "ownerSessionKey": "agent:kranz-coordinator:main"
        }
      }
    }
  }
}
```

## Tools

- `kranz_flow_start`
- `kranz_flow_link_task`
- `kranz_flow_checkpoint`
- `kranz_flow_set_run_scope`
- `kranz_flow_tick`
- `kranz_flow_execute_pending_action`
- `kranz_flow_sync_monitor`
- `kranz_flow_status`

`kranz_flow_tick` is restart-safe and idempotent. It dispatches McClintock with a deterministic session and idempotency key, links the accepted run, checkpoints the flow, and returns immediately. Later ticks observe the durable dossier and child-outcome file, validate the packet, and recover from failed or stale runs without advancing the queue.

Before a requested run, call `kranz_flow_set_run_scope` with the exact flow revision. Supplying `entryLimit` selects the next N still-available page IDs in snapshot order; omitting it selects all remaining available IDs. The selection is persisted. Verified and terminally blocked records consume one selected slot, and the flow pauses at `run_scope_complete` when that exact selection is exhausted.

`kranz_flow_execute_pending_action` accepts only a flow id and its exact revision. It derives and authorizes the current page read or verified publication from TaskFlow state, then verifies the resulting context or publication receipt after the protected Gateway executor runs the fixed script. `kranz_flow_sync_monitor` applies the same authorize/verify handshake to the human-readable Notion monitor. Neither tool accepts an arbitrary page, script, output path, or Notion operation from the model.

`ownerSessionKey` binds both interactive Kranz calls and ephemeral scheduled calls to the same durable TaskFlow owner. The plugin accepts only the dedicated `agent:kranz-coordinator:main` owner, so callers cannot redirect it into arbitrary session namespaces. TaskFlow revision checks remain the concurrency guard when two callers race.

A four-minute OpenClaw automation invokes Kranz. When the tick reaches a protected Notion boundary it calls the narrow plugin action tool and ticks again. TaskFlow remains the machine source of truth and the Notion monitor is only a human-readable projection.

The deterministic headless scheduler payload lives in `cron-tick.js`. It executes only revision-locked actions returned by Kranz plugin methods through the protected Gateway executor, stays quiet while research is pending, and removes its own uniquely named automation when the requested scope or full batch completes. It only emits owner notifications for five-record milestones, blockers, and final completion.

The controller uses the documented uppercase phases (`SELECT_RECORD`, `DISPATCH_RESEARCH`, `WAIT_RESEARCH`, `VALIDATE_PACKET`, and `WRITE_NOTION`) while accepting the earlier lowercase checkpoint names for in-place migration of the active production flow.

Simple OpenClaw tool plugin.

## Build

```bash
npm install
npm run plugin:build
npm run plugin:validate
npm test
```
