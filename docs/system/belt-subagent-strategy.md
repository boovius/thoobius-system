# BELT Subagent Strategy

## Purpose

Define a practical subagent strategy for BELT work so repeated implementation, review, architecture, and product loops accumulate context cleanly instead of being re-briefed from scratch each time.

This document covers:
- agent roles
- model allocation strategy
- persistence strategy
- multi-worktree implementation pattern
- coordination rules

## Current BELT Agent Roster

### Tank
- Role: primary software engineer
- Best for:
  - bounded implementation tasks
  - PR follow-ups
  - targeted fixes
  - stacked branch work
- Avoid using for:
  - final architecture arbitration when scope is still fuzzy
  - final product judgment

### Luther
- Role: secondary software engineer
- Best for:
  - parallel bounded implementation tasks
  - separate issue slices in their own worktree
  - follow-on coding work that should not block Tank
- Avoid using for:
  - final product framing
  - architecture ownership

### Kaylee
- Role: system design / architecture / review lead
- Best for:
  - reviewing implementation PRs
  - checking semantic alignment with intended product/model direction
  - identifying architectural drift
  - merge-readiness review
  - system design tradeoff thinking
- Avoid using for:
  - heavy implementation as default
  - business framing as primary lane

### Martha
- Role: business / product / issue-shaping lead
- Best for:
  - issue creation and refinement
  - roadmap and decomposition
  - product framing
  - parent/child issue structure
  - translating ideas into coherent work items
- Avoid using for:
  - heavy implementation
  - final code-level review

## Persistence Strategy

These BELT agents should ideally be persistent and BELT-scoped.

Why persistence helps:
- recurring PR stack knowledge
- repo-specific context
- product/modeling history
- less re-briefing overhead
- more coherent follow-up work across days

Important caution:
- keep persistent agents scoped to BELT only
- avoid stuffing unrelated domains into their sessions
- prefer bounded tasks inside a stable domain over one giant everything-agent

### Required memory protocol

Until OpenClaw has first-class named subagent profiles with automatic memory, the coordinator should treat this as a required delegation checklist:

1. Name the intended persona explicitly in the brief, even if the runtime assigns an unrelated worker nickname.
2. Tell the worker to load the BELT subagent strategy plus that persona's recent monitor/work-log context before doing task work.
3. Include role-specific guidance from this roster in the task brief: Tank builds, Luther builds separable slices, Kaylee reviews architecture/system coherence, Martha shapes product/issues.
4. Require the worker to report checks, risks, branch/PR/issue URLs, and anything learned that should persist.
5. After completion or blockage, write back the result to the BELT monitor/work log and update local memory when the lesson affects future delegations.

Recommended eventual shape:
- one lightweight role file per persona
- one durable memory/work-log source per persona
- automatic role-file loading by subagent label
- a completion hook that prompts for persona memory write-back

## Model Allocation Strategy

Different subagents can use different underlying models.

That is useful, but should be kept reasonably simple.

### Recommended first-pass strategy

#### Tank
- Use a coding-strong model
- Default recommendation: same family/model as the main coding workflow unless a stronger repo-coding option is proven better

#### Luther
- Use the same coding-strong model as Tank
- Rationale: implementation consistency matters more than novelty

#### Kaylee
- Use a reasoning/review/architecture-strong model
- Prefer a model that is good at synthesis, critique, and tradeoff analysis

#### Martha
- Use a planning/writing/product-strong model
- Prefer a model that is strong at issue framing, structure, summarization, and decomposition

### Simplicity rule
Start with:
- Tank + Luther on the same model
- Kaylee + Martha on the same model, or keep them on the main default if no better option is available

Only increase model diversity when it materially improves output quality.

## Current Known Session Model

Main session currently reports:
- `openai-codex/gpt-5.4`

That can serve as the default baseline unless per-agent overrides are intentionally introduced.

## Multi-Worktree Implementation Pattern

If multiple coding agents work on BELT in parallel, they should not share one checked-out working directory.

### Why
One checkout cannot safely support multiple concurrent coding agents without branch churn and file collisions.

### Preferred solution
Use separate git worktrees.

Example structure:
- coordinator repo: `/home/boovius/software-development/belt`
- Tank worktree: `/home/boovius/software-development/belt-tank`
- Luther worktree: `/home/boovius/software-development/belt-luther`

Each worktree gets:
- one branch
- one bounded task
- one coding agent

### Benefits
- safe parallel branch work
- no checkout stomping
- lower disk duplication than full clones
- easier coordination against one remote

## Coordination Pattern

### Coordinator
The main session should remain the coordinator.

Coordinator responsibilities:
- assign bounded tasks
- decide which agent gets what
- decide merge order
- ask Kaylee for review at key checkpoints
- ask Martha for issue/product framing where needed

### Coding agents
Tank and Luther should each take:
- one branch
- one worktree
- one bounded task at a time

### Review path
- coding agent finishes work
- Kaylee reviews
- coordinator decides whether to patch, merge, or re-scope

### Product / issue path
- ambiguous or larger idea appears
- Martha turns it into a clear issue, refinement, or roadmap note
- then coding agent implements

## Merge Sequencing Rule

Parallel coding is good.
Parallel merging is not.

Recommended pattern:
1. each implementation agent pushes their own branch
2. Kaylee reviews for architecture/system consistency
3. coordinator chooses merge order
4. merge one at a time
5. rebase remaining branches as needed

## Good Task Shapes for Parallel Agents

Good examples:
- Tank: ProcessInput requirements structure
- Luther: assumptions/provenance UI
- Kaylee: review both for consistency with process/assumption architecture
- Martha: define follow-up issue set based on implementation learnings

Bad examples:
- Tank and Luther both deeply editing the same wizard files for the same slice at the same time
- tiny tasks that do not justify branch/worktree overhead
- vague, unbounded work where no one owns merge sequencing

## Active Worktree Setup

Current default BELT parallel coding setup:
- coordinator repo: `/home/boovius/software-development/belt`
- Tank worktree: `/home/boovius/software-development/belt-tank`
  - branch: `feat/model-spine-tables`
- Luther worktree: `/home/boovius/software-development/belt-luther`
  - branch: `feat/emissions-adapter-seam`

Rule:
- one agent = one worktree = one branch = one bounded task
- do not put Tank and Luther on the same branch
- prefer opening separate PRs from each worktree, then merge one at a time

## Recommended Next Step

1. keep BELT-scoped roles stable for:
   - Tank
   - Luther
   - Kaylee
   - Martha
2. keep model assignments simple at first
3. use separate Tank/Luther worktrees for parallel coding by default
4. use Kaylee for review/architecture checkpoints and Martha for product/issue framing

## Default Operating Principle

- Tank builds
- Luther builds in parallel when tasks are separable
- Kaylee reviews and guards system coherence
- Martha shapes the work and product framing
- main session coordinates all of it
