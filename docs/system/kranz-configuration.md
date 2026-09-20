# Kranz configuration and runtime files

## Source-controlled files

- `config/openclaw.kranz.example.json` — sanitized OpenClaw configuration excerpt for Kranz, McClintock, and the coordinator plugin.
- `plugins/kranz-coordinator/openclaw.plugin.json` — plugin manifest and configuration schema.
- `plugins/kranz-coordinator/package.json` — plugin package metadata and build/test commands.
- `plugins/kranz-coordinator/tsconfig.json` — TypeScript compiler settings.
- `plugins/kranz-coordinator/vitest.config.ts` — targeted test configuration.
- `plugins/kranz-coordinator/src/index.ts` — controller implementation and path precedence.
- `plugins/kranz-coordinator/cron-tick.js` — deterministic scheduled controller payload using only scoped plugin methods.
- `scripts/lib/ntc-paths.mjs` — shared path validation for Gateway scripts.
- `scripts/migrate-ntc-state-root.mjs` — copy-and-verify migration from legacy agent-owned directories.
- `scripts/ntc-page-read.mjs` — protected Notion page reader.
- `scripts/ntc-write-deep-research.mjs` — protected, verified Notion publisher.
- `scripts/ntc-monitor-sync.mjs` — human-readable monitor projection.

## Private live configuration

The live OpenClaw configuration is:

```text
/home/boovius/.openclaw/openclaw.json
```

It contains credentials and channel configuration and must never be committed. Inspect only the safe Kranz-related subset:

```bash
jq '{
  kranz: .agents.entries["kranz-coordinator"],
  mcclintock: .agents.entries["mcclintock-deep-opus"],
  plugin: .plugins.entries["kranz-coordinator"],
  pluginPaths: .plugins.load.paths
}' /home/boovius/.openclaw/openclaw.json
```

## Runtime state

The shared default is:

```text
/home/boovius/.openclaw/workspace/.ntc-state
```

Its contents are runtime data and are ignored by Git:

```text
.ntc-state/
  page-context/
  artifacts/
  research-outcomes/
  publication-receipts/
  monitor/
```

Legacy data remains under the two agent workspaces during the migration safety window. The migration copies and verifies files; it never deletes or overwrites conflicting content.

## Path precedence

For each managed flow:

1. `stateJson.stateRoot` and `stateJson.artifactRoot`, supplied when the coordinator creates the flow.
2. `plugins.entries.kranz-coordinator.config.stateRoot` and `artifactRoot`.
3. Shared defaults: `<workspace>/.ntc-state` and `<stateRoot>/artifacts`.

The selected absolute paths are persisted in TaskFlow state. Paths outside the shared workspace are rejected.

## Dispatch and Notion authority

- Kranz is configured with `subagents.allowAgents: ["mcclintock-deep-opus"]`; no other child agent is allowed.
- Production dispatch uses the plugin SDK's supported subagent runtime with a deterministic McClintock session key and idempotency key. The retired embedded runner is not used.
- `kranz_flow_execute_pending_action(flowId, expectedRevision)` derives and revision-locks the only permitted page read or publication from TaskFlow state, then verifies its context or receipt. It does not accept arbitrary page ids, scripts, paths, properties, or Notion operations.
- `kranz_flow_sync_monitor(flowId, expectedRevision)` applies the same authorize/verify handshake to only the known NTC monitor projection.
- The deterministic scheduler passes only plugin-authorized actions to Gateway-hosted exec, where `NTC_NOTION_API_KEY` remains an opaque egress sentinel restricted to `api.notion.com`.

## Inspection commands

Inspect the active durable flow:

```bash
openclaw tasks flow show 84e4b348-57e5-4729-b171-e6f98a891dc9 --json
```

Inspect runtime files without printing their contents:

```bash
find /home/boovius/.openclaw/workspace/.ntc-state -type f -printf '%P %s bytes\n' | sort
```

Run the idempotent migration:

```bash
node scripts/migrate-ntc-state-root.mjs
```
