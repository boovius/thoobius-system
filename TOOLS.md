# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Docs Context

- Primary user-maintained reference docs live in `/home/boovius/docs`
- If memory is missing or thin, search `/home/boovius/docs` for relevant project/context notes before asking Josh to restate things
- Important subdirectories already in use include `/home/boovius/docs/travel` and `/home/boovius/docs/system`
- For Notion database/schema work, see `/home/boovius/.openclaw/workspace/docs/system/notion-workflow.md`

## BELT Subagent Monitor

- Use Notion as the canonical BELT subagent monitor/log:
  - Page: https://www.notion.so/BELT-SubAgent-Monitor-And-Log-370d409583d18140a94de2261f4e0965
  - Monitor data source: `585898d2-9727-4f4d-9483-bd33fb1c3cc7` (`BELT Subagent Monitor`)
  - Work log data source: `bc10d12d-dbb1-4c86-a5da-1eb7000aaf28` (`BELT Subagent Work Log`)
- When delegating BELT subagent work, update the monitor row immediately: subagent, status, current work, PR/issue URL, delegation time, key concerns.
- When a subagent finishes, update the monitor row and add a work-log entry with summary, checks, PR/issue links, outstanding work, and completion time.
- The old local file `/home/boovius/.openclaw/workspace/docs/belt-task-monitor.md` is non-canonical scratch only unless Josh explicitly asks for a file copy.

## Sub-Agent Workflow Notes

- Use sub-agents mainly for heavier work: implementation, repo research, structured drafting, and multi-step technical investigation
- When delegating to a named persona such as Tank, Luther, Kaylee, or Martha, always include an explicit startup instruction to load that persona's role/context/memory first, then write back useful learnings or task results when finished.
- Avoid using sub-agents for tiny gating questions, quick yes/no clarity checks, or conceptual nudges that can be resolved directly in the main session
- If a sub-agent stalls or fails to report back cleanly after a reasonable interval, stop waiting passively and either:
  - take over directly for small tasks, or
  - respawn once with a tighter brief for larger tasks
- Treat one-shot sub-agent reporting as imperfect; prefer direct handling for small coordination steps
- Good pattern: main session handles orchestration and small decisions, sub-agents handle heavier bounded work

## Diagnostics Communication Notes

- When diagnosing black-box systems for Josh, explicitly say which layer is being checked so the reasoning is legible
- Preferred diagnostic layers:
  1. scheduler layer — did the timed/scheduled job fire?
  2. execution layer — did the task/system event/agent turn actually run?
  3. delivery layer — was user-facing delivery explicitly requested?
  4. visible output layer — did a real message actually reach Josh?
- Use this layered explanation style for timers, cron jobs, reminders, agent report-backs, and similar automation/debugging work

## Browser / agent-browser Notes

- `agent-browser` works in this workspace, but Linux host launches can fail with Chrome sandbox errors like `No usable sandbox!`
- When that happens, retry with launch args like:
  - `agent-browser --session <name> --args '--no-sandbox' open <url>`
- Important wrinkle: if the agent-browser daemon is already running, it may print `--args ignored: daemon already running`. In that case:
  - the existing session may still be usable
  - use `agent-browser close` first if you truly need a fresh browser process with new args
- Useful pattern for JS-heavy pages:
  1. `agent-browser --session <name> open <url>`
  2. `agent-browser --session <name> wait --load networkidle`
  3. `agent-browser --session <name> snapshot -i --json`
- The accessibility snapshot is often enough to extract rendered event/job details even when plain fetch only shows the page shell

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
