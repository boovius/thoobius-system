# Kranz Coordinator

OpenClaw tools for persisted NTC deep-research coordination. The plugin owns the deterministic serial controller state, launches one isolated McClintock research run at a time through the supported plugin subagent runtime, validates durable artifacts, and authorizes only flow-derived Notion actions for Gateway-hosted execution. It never receives the plaintext NTC Notion credential and never performs outreach.

Version 0.8 begins the migration from the Kranz persona shell to the reusable `@thoobius/workflow-controller-core`. The generic package owns artifact fingerprints, bounded run scopes, dispatch identities, child-completion correlation, deadline identities, and controller port contracts. NTC dossier validation and Notion policy remain in the domain adapter.

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

Before a requested run, call `kranz_flow_set_run_scope` with the exact flow revision. Supplying `itemLimit` selects the next N still-available page IDs in snapshot order; omitting it selects all remaining available IDs. `entryLimit` remains as a deprecated compatibility alias. The same tool accepts `triggerSource: "manual" | "scheduled"`; both paths freeze the identical durable run scope. Verified and terminally blocked records consume one selected slot, and the flow pauses at `run_scope_complete` when that exact selection is exhausted.

`kranz_flow_execute_pending_action` accepts only a flow id and its exact revision. It derives and authorizes the current page read or verified publication from TaskFlow state, then verifies the resulting context or publication receipt after the protected Gateway executor runs the fixed script. `kranz_flow_sync_monitor` applies the same authorize/verify handshake to the human-readable Notion monitor. Neither tool accepts an arbitrary page, script, output path, or Notion operation from the model.

`ownerSessionKey` binds both interactive Kranz calls and ephemeral scheduled calls to the same durable TaskFlow owner. The plugin accepts only the dedicated `agent:kranz-coordinator:main` owner, so callers cannot redirect it into arbitrary session namespaces. TaskFlow revision checks remain the concurrency guard when two callers race.

The event-driven path replaces recurring four-minute supervision. Dispatch creates one 20-minute session-turn watchdog tagged to the exact flow, record, and attempt. Normal child completion writes the durable outcome, cancels that watchdog, and schedules an immediate continuation in the stable controller session. If the completion handoff is lost, the watchdog wakes that same session once for reconciliation.

Until OpenClaw's scheduled-script admission bug is fixed, scheduled starts and watchdogs are wake-only. Protected Notion execution must occur from the separately admitted stable controller turn. This temporary workaround still invokes a minimal controller model turn; it does not pass credentials through the model, plugin, child, or Automation payload.

`cron-tick.js` is retained only for rollback during migration. It must not remain the normal polling path after the event-driven flow is proved end to end.

The controller uses the documented uppercase phases (`SELECT_RECORD`, `DISPATCH_RESEARCH`, `WAIT_RESEARCH`, `VALIDATE_PACKET`, and `WRITE_NOTION`) while accepting the earlier lowercase checkpoint names for in-place migration of the active production flow.

Simple OpenClaw tool plugin.

## Build

```bash
npm install
npm run plugin:build
npm run plugin:validate
npm test
```
