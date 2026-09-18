import crypto, { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
const CONTROLLER_ID = "kranz/ntc-deep-research";
const MCCLINTOCK_AGENT_ID = "mcclintock-deep-opus";
const MAX_RESEARCH_ATTEMPTS = 2;
const CHILD_STALE_MS = 25 * 60 * 1000;
const STATE_ROOT = "/home/boovius/.openclaw/workspace/agents/kranz-coordinator/.ntc-state";
const ARTIFACT_ROOT = "/home/boovius/.openclaw/workspace/agents/mcclintock-deep-opus/artifacts";
const WRITER_SCRIPT = "/home/boovius/.openclaw/workspace/scripts/ntc-write-deep-research.mjs";
const PAGE_READER_SCRIPT = "/home/boovius/.openclaw/workspace/scripts/ntc-page-read.mjs";
const MONITOR_SCRIPT = "/home/boovius/.openclaw/workspace/scripts/ntc-monitor-sync.mjs";
const JsonText = Type.String({ description: "A JSON-encoded object used as the complete persisted TaskFlow state." });
const Steps = {
    SELECT_RECORD: "SELECT_RECORD",
    DISPATCH_RESEARCH: "DISPATCH_RESEARCH",
    WAIT_RESEARCH: "WAIT_RESEARCH",
    VALIDATE_PACKET: "VALIDATE_PACKET",
    WRITE_NOTION: "WRITE_NOTION",
    ADVANCE: "ADVANCE",
};
function normalizeStep(step) {
    const legacy = {
        read_next_record: Steps.SELECT_RECORD,
        dispatch_research: Steps.DISPATCH_RESEARCH,
        wait_research: Steps.WAIT_RESEARCH,
        write_notion: Steps.WRITE_NOTION,
    };
    return legacy[step ?? ""] ?? step ?? Steps.SELECT_RECORD;
}
function parseState(value) {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
        throw new Error("stateJson must encode a JSON object");
    return parsed;
}
function asObject(value) {
    return value && !Array.isArray(value) && typeof value === "object" ? value : {};
}
function result(details) {
    return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
}
function slug(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
export function artifactPathFor(record) {
    return path.join(ARTIFACT_ROOT, `${record.pageId}-${slug(record.name)}.md`);
}
export function contextPathFor(record) {
    return path.join(STATE_ROOT, "page-context", `${record.pageId}.json`);
}
export function receiptPathFor(record) {
    return path.join(STATE_ROOT, "publication-receipts", `${record.pageId}.json`);
}
export function outcomePathFor(record, attempt) {
    return path.join(STATE_ROOT, "research-outcomes", `${record.pageId}-attempt-${attempt}.json`);
}
export function inspectDossier(artifactPath, pageId, prospect) {
    if (!existsSync(artifactPath))
        return { ok: false, path: artifactPath, errors: ["artifact_missing"] };
    const markdown = readFileSync(artifactPath, "utf8");
    const errors = [];
    if (!markdown.includes(pageId))
        errors.push("page_id_mismatch");
    if (prospect && !markdown.toLowerCase().includes(prospect.toLowerCase()))
        errors.push("prospect_mismatch");
    if (!markdown.includes(artifactPath))
        errors.push("artifact_path_mismatch");
    if ((markdown.match(/^## Deep Research$/gm) ?? []).length !== 1)
        errors.push("deep_research_heading_count");
    const requiredHeadings = ["Charities", "Beverly Hills", "Race/Run", "Cancer", "Personnel", "Other Background Context"];
    const headingPositions = requiredHeadings.map((heading) => markdown.indexOf(`### ${heading}`));
    for (const heading of requiredHeadings) {
        if (!markdown.includes(`### ${heading}`))
            errors.push(`missing_heading:${heading}`);
    }
    if (headingPositions.every((position) => position >= 0) && headingPositions.some((position, index) => index > 0 && position <= headingPositions[index - 1])) {
        errors.push("heading_order");
    }
    const deepResearch = markdown.slice(markdown.indexOf("## Deep Research"), markdown.indexOf("## Notion Replacement Contract") >= 0 ? markdown.indexOf("## Notion Replacement Contract") : undefined);
    if (!/https?:\/\//.test(deepResearch))
        errors.push("citations_missing");
    if (!/Unresolved|No public evidence found|Contradictions|unknown/i.test(markdown))
        errors.push("unresolved_items_missing");
    if (!/^## Notion Replacement Contract$/m.test(markdown))
        errors.push("replacement_contract_missing");
    if (!/^PACKET_COMPLETE\s*$/m.test(markdown))
        errors.push("packet_incomplete");
    return { ok: errors.length === 0, path: artifactPath, sha256: crypto.createHash("sha256").update(markdown).digest("hex"), errors };
}
function readOutcome(outcomePath, runId) {
    if (!existsSync(outcomePath))
        return null;
    try {
        const outcome = JSON.parse(readFileSync(outcomePath, "utf8"));
        return outcome.runId === runId && (outcome.status === "succeeded" || outcome.status === "failed") ? outcome : null;
    }
    catch {
        return null;
    }
}
function writeOutcome(outcomePath, outcome) {
    mkdirSync(path.dirname(outcomePath), { recursive: true });
    writeFileSync(outcomePath, `${JSON.stringify(outcome, null, 2)}\n`, { mode: 0o600 });
}
function readContext(contextPath, pageId) {
    if (!existsSync(contextPath))
        return { ok: false };
    try {
        const parsed = JSON.parse(readFileSync(contextPath, "utf8"));
        return { ok: parsed.pageId === pageId, readAt: parsed.readAt };
    }
    catch {
        return { ok: false };
    }
}
function readReceipt(receiptPath, pageId, artifactHash) {
    if (!existsSync(receiptPath))
        return null;
    try {
        const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
        if (receipt.pageId !== pageId || receipt.artifactHash !== artifactHash)
            return null;
        if (receipt.verified !== true || receipt.status !== "Deep Research")
            return null;
        return receipt;
    }
    catch {
        return null;
    }
}
function queueFrom(state) {
    if (!Array.isArray(state.queueSnapshot))
        throw new Error("stateJson.queueSnapshot must be an array");
    return state.queueSnapshot.map((item, index) => {
        const row = asObject(item);
        const pageId = String(row.pageId ?? "");
        if (!/^[0-9a-f-]{32,36}$/i.test(pageId))
            throw new Error(`Invalid queue page ID at index ${index}`);
        return { position: Number(row.position ?? index + 1), pageId, name: String(row.name ?? `Record ${index + 1}`), entityType: row.entityType == null ? null : String(row.entityType), url: row.url == null ? undefined : String(row.url) };
    });
}
function attemptsFor(state, pageId) {
    const value = Number(asObject(state.retries)[pageId] ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}
function withCurrent(state, record, index) {
    return { ...state, currentIndex: index, currentPageId: record.pageId, currentProspect: record.name, currentPosition: record.position };
}
function buildResearchPrompt(record, queueCount, contextPath, artifactPath) {
    return `Conduct one complete NTC deep-research investigation for this exact record. Research only: no outreach, no Notion write, no status change, no Gateway execution, and no credential handling.

Record: ${record.name}
Page ID: ${record.pageId}
Queue position: ${record.position} of ${queueCount}
Entity type: ${record.entityType ?? "Determine from the record"}
Authoritative existing-page context: ${contextPath}

Investigate Charities, Beverly Hills, Race/Run, Cancer, Personnel, and Other Background Context. Prefer primary sources and reputable reporting; cross-check material claims; label conclusions exactly Verified, Supported inference, Unresolved, or No public evidence found. Never speculate about private medical or family details and never use people-finder data.

Write the authoritative self-contained Markdown dossier to exactly:
${artifactPath}

The file must include the exact page ID, prospect, entity type, queue position, research timestamp, and artifact path; exactly one ## Deep Research heading; all six required ### headings in the order above; direct citations and evidence labels; contradictions/unknowns; a concise recommended next action; a ## Notion Replacement Contract that preserves unrelated content and replaces only the existing Deep Research section; and a final line containing PACKET_COMPLETE. The file, not chat, is the durable handoff.`;
}
function monitorAction(flowId) {
    return { script: MONITOR_SCRIPT, args: [flowId], env: { OPENCLAW_NOTION_PROFILE: "ntc" } };
}
function actionRequired(flow, action) {
    return { flowId: flow.flowId, revision: flow.revision, status: "action_required", currentStep: flow.currentStep, action, monitor: monitorAction(flow.flowId) };
}
export default defineToolPlugin({
    id: "kranz-coordinator",
    name: "Kranz Coordinator",
    description: "Run and inspect the durable Kranz NTC research controller.",
    tools: (tool) => [
        tool({
            name: "kranz_flow_start",
            description: "Create a durable Kranz NTC research TaskFlow for the current owner session.",
            parameters: Type.Object({ goal: Type.String(), stateJson: JsonText, currentStep: Type.Optional(Type.String()) }),
            factory({ api, toolContext }) {
                const flows = api.runtime.tasks.managedFlows.fromToolContext(toolContext);
                return { name: "kranz_flow_start", label: "Start Kranz Flow", description: "Create a durable Kranz NTC research TaskFlow for the current owner session.", parameters: Type.Object({ goal: Type.String(), stateJson: JsonText, currentStep: Type.Optional(Type.String()) }), executionMode: "sequential",
                    async execute(_id, params) { return result(flows.createManaged({ controllerId: CONTROLLER_ID, goal: String(params.goal), status: "running", currentStep: normalizeStep(params.currentStep == null ? undefined : String(params.currentStep)), stateJson: parseState(String(params.stateJson)) })); } };
            },
        }),
        tool({
            name: "kranz_flow_link_task",
            description: "Link an already-launched McClintock child task to a Kranz TaskFlow.",
            parameters: Type.Object({ flowId: Type.String(), childSessionKey: Type.String(), runId: Type.String(), label: Type.String(), task: Type.String() }),
            factory({ api, toolContext }) {
                const flows = api.runtime.tasks.managedFlows.fromToolContext(toolContext);
                return { name: "kranz_flow_link_task", label: "Link McClintock Task", description: "Link an already-launched McClintock child task to a Kranz TaskFlow.", parameters: Type.Object({ flowId: Type.String(), childSessionKey: Type.String(), runId: Type.String(), label: Type.String(), task: Type.String() }), executionMode: "sequential",
                    async execute(_id, p) { return result(flows.runTask({ flowId: String(p.flowId), runtime: "subagent", agentId: MCCLINTOCK_AGENT_ID, childSessionKey: String(p.childSessionKey), runId: String(p.runId), label: String(p.label), task: String(p.task), status: "running", startedAt: Date.now(), lastEventAt: Date.now() })); } };
            },
        }),
        tool({
            name: "kranz_flow_checkpoint",
            description: "Persist a Kranz TaskFlow checkpoint with revision checking.",
            parameters: Type.Object({ flowId: Type.String(), expectedRevision: Type.Number(), disposition: Type.Union([Type.Literal("running"), Type.Literal("waiting"), Type.Literal("succeeded"), Type.Literal("failed")]), currentStep: Type.Optional(Type.String()), stateJson: JsonText, summary: Type.Optional(Type.String()) }),
            factory({ api, toolContext }) {
                const flows = api.runtime.tasks.managedFlows.fromToolContext(toolContext);
                return { name: "kranz_flow_checkpoint", label: "Checkpoint Kranz Flow", description: "Persist a Kranz TaskFlow checkpoint with optimistic revision checking.", parameters: Type.Object({ flowId: Type.String(), expectedRevision: Type.Number(), disposition: Type.Union([Type.Literal("running"), Type.Literal("waiting"), Type.Literal("succeeded"), Type.Literal("failed")]), currentStep: Type.Optional(Type.String()), stateJson: JsonText, summary: Type.Optional(Type.String()) }), executionMode: "sequential",
                    async execute(_id, p) {
                        const base = { flowId: String(p.flowId), expectedRevision: Number(p.expectedRevision), stateJson: parseState(String(p.stateJson)), currentStep: p.currentStep == null ? undefined : String(p.currentStep) };
                        if (p.disposition === "running")
                            return result(flows.resume({ ...base, status: "running" }));
                        if (p.disposition === "waiting")
                            return result(flows.setWaiting({ ...base, waitJson: { kind: "child_or_continuation" }, blockedSummary: p.summary == null ? undefined : String(p.summary) }));
                        if (p.disposition === "succeeded")
                            return result(flows.finish(base));
                        return result(flows.fail({ ...base, blockedSummary: p.summary == null ? undefined : String(p.summary) }));
                    } };
            },
        }),
        tool({
            name: "kranz_flow_tick",
            description: "Advance one Kranz flow idempotently until it waits or needs a protected Gateway action.",
            parameters: Type.Object({ flowId: Type.String() }),
            factory({ api, toolContext }) {
                const flows = api.runtime.tasks.managedFlows.fromToolContext(toolContext);
                return { name: "kranz_flow_tick", label: "Tick Kranz Flow", description: "Advance one Kranz flow idempotently until it waits or needs a protected Gateway action.", parameters: Type.Object({ flowId: Type.String() }), executionMode: "sequential",
                    async execute(_id, p) {
                        const flowId = String(p.flowId);
                        let flow = flows.get(flowId);
                        if (!flow || flow.syncMode !== "managed")
                            return result({ found: false, flowId });
                        if (flow.controllerId !== CONTROLLER_ID)
                            throw new Error(`Flow ${flowId} is not owned by ${CONTROLLER_ID}`);
                        if (["succeeded", "failed", "cancelled", "lost", "blocked"].includes(flow.status)) {
                            return result({ found: true, flowId, status: "terminal", flowStatus: flow.status, revision: flow.revision });
                        }
                        const step = normalizeStep(flow.currentStep);
                        let state = asObject(flow.stateJson);
                        const queue = queueFrom(state);
                        const index = Number(state.currentIndex ?? 0);
                        if (!Number.isInteger(index) || index < 0)
                            throw new Error("stateJson.currentIndex must be a non-negative integer");
                        const record = queue[index];
                        if (!record)
                            return result({ found: true, status: "batch_complete", mutation: flows.finish({ flowId, expectedRevision: flow.revision, stateJson: { ...state, completedAt: new Date().toISOString() } }), monitor: monitorAction(flowId) });
                        state = withCurrent(state, record, index);
                        const artifactPath = artifactPathFor(record), contextPath = contextPathFor(record), receiptPath = receiptPathFor(record);
                        let artifact = inspectDossier(artifactPath, record.pageId, record.name);
                        if (step === Steps.SELECT_RECORD) {
                            if (artifact.ok) {
                                const m = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.VALIDATE_PACKET, stateJson: { ...state, artifact: { path: artifact.path, sha256: artifact.sha256, packetComplete: true } } });
                                if (!m.applied)
                                    return result({ status: "revision_conflict", mutation: m });
                                flow = m.flow;
                                state = asObject(flow.stateJson);
                            }
                            else {
                                const context = readContext(contextPath, record.pageId);
                                if (!context.ok)
                                    return result(actionRequired(flow, { kind: "read_page", pageId: record.pageId, prospect: record.name, outputPath: contextPath, script: PAGE_READER_SCRIPT, args: [record.pageId, contextPath], env: { OPENCLAW_NOTION_PROFILE: "ntc" } }));
                                const m = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.DISPATCH_RESEARCH, stateJson: { ...state, pageContext: { path: contextPath, readAt: context.readAt ?? "unknown" } } });
                                if (!m.applied)
                                    return result({ status: "revision_conflict", mutation: m });
                                flow = m.flow;
                                state = asObject(flow.stateJson);
                            }
                        }
                        if (normalizeStep(flow.currentStep) === Steps.DISPATCH_RESEARCH) {
                            const priorFailures = attemptsFor(state, record.pageId), attempt = priorFailures + 1;
                            if (attempt > MAX_RESEARCH_ATTEMPTS) {
                                const blocked = Array.isArray(state.blockedRecords) ? [...state.blockedRecords] : [];
                                blocked.push({ pageId: record.pageId, name: record.name, reason: "research_retry_limit_exhausted", attempts: priorFailures });
                                const nextIndex = index + 1, next = queue[nextIndex];
                                const nextState = { ...state, blockedRecords: blocked, currentIndex: nextIndex, child: null, artifact: null, ...(next ? { currentPageId: next.pageId, currentProspect: next.name, currentPosition: next.position } : {}) };
                                const mutation = next ? flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.SELECT_RECORD, stateJson: nextState }) : flows.finish({ flowId, expectedRevision: flow.revision, stateJson: { ...nextState, completedAt: new Date().toISOString() } });
                                return result({ status: "record_blocked", pageId: record.pageId, mutation, monitor: monitorAction(flowId) });
                            }
                            const runId = `kranz:${flowId}:${record.pageId}:attempt:${attempt}`;
                            const childSessionKey = `agent:${MCCLINTOCK_AGENT_ID}:kranz-${flowId}-${record.pageId}-${attempt}`;
                            const outcomePath = outcomePathFor(record, attempt);
                            const prompt = buildResearchPrompt(record, queue.length, contextPath, artifactPath);
                            const linked = flows.runTask({ flowId, runtime: "subagent", sourceId: runId, childSessionKey, agentId: MCCLINTOCK_AGENT_ID, runId, label: `McClintock — ${record.name}`, task: prompt, status: "running", startedAt: Date.now(), lastEventAt: Date.now() });
                            if (!linked.created && !linked.found)
                                return result({ status: "link_failed", reason: linked.reason, flowId, runId });
                            flow = flows.get(flowId);
                            const waiting = flows.setWaiting({ flowId, expectedRevision: flow.revision, currentStep: Steps.WAIT_RESEARCH, stateJson: { ...state, child: { runId, childSessionKey, attempt, status: "running", startedAt: new Date().toISOString(), outcomePath }, expectedArtifactPath: artifactPath }, waitJson: { kind: "child_completion", childRunId: runId, childSessionKey, pageId: record.pageId, attempt } });
                            if (!waiting.applied)
                                return result({ status: "revision_conflict", linked, mutation: waiting });
                            // Runtime exposes a deeply-readonly snapshot; the embedded runner's
                            // public type accepts the equivalent mutable config shape.
                            const cfg = structuredClone(api.runtime.config.current());
                            const workspaceDir = api.runtime.agent.resolveAgentWorkspaceDir(cfg, MCCLINTOCK_AGENT_ID);
                            const agentDir = api.runtime.agent.resolveAgentDir(cfg, MCCLINTOCK_AGENT_ID);
                            void api.runtime.agent.runEmbeddedAgent({ sessionId: randomUUID(), sessionKey: childSessionKey, sessionPersistence: "durable", agentId: MCCLINTOCK_AGENT_ID, workspaceDir, bootstrapWorkspaceDir: workspaceDir, isCanonicalWorkspace: true, agentDir, config: cfg, prompt, timeoutMs: 20 * 60 * 1000, runTimeoutOverrideMs: 20 * 60 * 1000, runId, trigger: "manual", spawnedBy: toolContext.sessionKey, sandboxAgentId: MCCLINTOCK_AGENT_ID, disableMessageTool: true, requireExplicitMessageTarget: true })
                                .then(() => writeOutcome(outcomePath, { status: "succeeded", runId, endedAt: new Date().toISOString() }))
                                .catch((error) => writeOutcome(outcomePath, { status: "failed", runId, endedAt: new Date().toISOString(), error: String(error) }));
                            return result({ flowId, revision: waiting.flow.revision, status: "research_dispatched", currentStep: Steps.WAIT_RESEARCH, child: { runId, childSessionKey, attempt }, monitor: monitorAction(flowId) });
                        }
                        if (normalizeStep(flow.currentStep) === Steps.WAIT_RESEARCH) {
                            artifact = inspectDossier(artifactPath, record.pageId, record.name);
                            const child = asObject(state.child);
                            const attempt = Number(child.attempt ?? attemptsFor(state, record.pageId) + 1);
                            const runId = String(child.runId ?? "");
                            const outcomePath = String(child.outcomePath ?? outcomePathFor(record, attempt));
                            const outcome = readOutcome(outcomePath, runId);
                            const startedAtMs = Date.parse(String(child.startedAt ?? ""));
                            const stale = Number.isFinite(startedAtMs) && Date.now() - startedAtMs >= CHILD_STALE_MS;
                            if (!artifact.ok && (outcome || stale)) {
                                const failure = outcome?.status === "failed" ? outcome.error ?? "research_run_failed" : stale ? "research_run_stale" : `invalid_packet:${artifact.errors.join(",")}`;
                                const mutation = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.DISPATCH_RESEARCH, stateJson: { ...state, retries: { ...asObject(state.retries), [record.pageId]: attempt }, child: { ...child, status: "failed", completedAt: outcome?.endedAt ?? new Date().toISOString(), error: failure, validationErrors: artifact.errors } } });
                                return result({ status: "research_retry_scheduled", pageId: record.pageId, attempt, reason: failure, mutation, monitor: monitorAction(flowId) });
                            }
                            if (!artifact.ok)
                                return result({ flowId, revision: flow.revision, status: "waiting", currentStep: Steps.WAIT_RESEARCH, waitingFor: asObject(flow.waitJson), artifactErrors: artifact.errors, monitor: monitorAction(flowId) });
                            const m = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.VALIDATE_PACKET, stateJson: { ...state, child: { ...child, status: "succeeded", completedAt: outcome?.endedAt ?? new Date().toISOString() }, artifact: { path: artifact.path, sha256: artifact.sha256, packetComplete: true } } });
                            if (!m.applied)
                                return result({ status: "revision_conflict", mutation: m });
                            flow = m.flow;
                            state = asObject(flow.stateJson);
                        }
                        if (normalizeStep(flow.currentStep) === Steps.VALIDATE_PACKET) {
                            artifact = inspectDossier(artifactPath, record.pageId, record.name);
                            if (!artifact.ok) {
                                const attempt = Number(asObject(state.child).attempt ?? attemptsFor(state, record.pageId) + 1);
                                const mutation = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.DISPATCH_RESEARCH, stateJson: { ...state, retries: { ...asObject(state.retries), [record.pageId]: attempt }, child: { ...asObject(state.child), status: "failed", validationErrors: artifact.errors } } });
                                return result({ status: "research_packet_invalid", pageId: record.pageId, attempt, errors: artifact.errors, mutation, monitor: monitorAction(flowId) });
                            }
                            const m = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.WRITE_NOTION, stateJson: { ...state, artifact: { path: artifact.path, sha256: artifact.sha256, packetComplete: true, validatedAt: new Date().toISOString() } } });
                            if (!m.applied)
                                return result({ status: "revision_conflict", mutation: m });
                            flow = m.flow;
                            state = asObject(flow.stateJson);
                        }
                        if (normalizeStep(flow.currentStep) === Steps.WRITE_NOTION) {
                            const hash = String(asObject(state.artifact).sha256 ?? artifact.sha256 ?? "");
                            const receipt = readReceipt(receiptPath, record.pageId, hash);
                            if (!receipt)
                                return result(actionRequired(flow, { kind: "publish_notion", pageId: record.pageId, prospect: record.name, artifactPath, artifactSha256: hash, receiptPath, script: WRITER_SCRIPT, args: [record.pageId, artifactPath, receiptPath], env: { OPENCLAW_NOTION_PROFILE: "ntc" } }));
                            const completed = Array.isArray(state.completedPageIds) ? [...state.completedPageIds] : [];
                            if (!completed.includes(record.pageId))
                                completed.push(record.pageId);
                            const nextIndex = index + 1, next = queue[nextIndex];
                            const nextState = { ...state, completedPageIds: completed, currentIndex: nextIndex, child: null, artifact: { path: artifactPath, sha256: hash, packetComplete: true }, notionWrite: { pageId: record.pageId, artifactSha256: hash, verified: true, status: "Deep Research", verifiedAt: receipt.verifiedAt ?? new Date().toISOString() }, readBackVerification: receipt.readBack ?? { verified: true }, lastVerifiedAt: receipt.verifiedAt ?? new Date().toISOString(), lastCompletedRecord: { pageId: record.pageId, name: record.name, position: record.position }, ...(next ? { currentPageId: next.pageId, currentProspect: next.name, currentPosition: next.position } : {}) };
                            const mutation = next ? flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.SELECT_RECORD, stateJson: nextState }) : flows.finish({ flowId, expectedRevision: flow.revision, stateJson: { ...nextState, completedAt: new Date().toISOString() } });
                            return result({ status: next ? "record_complete" : "batch_complete", completed: { pageId: record.pageId, name: record.name }, next: next ?? null, mutation, monitor: monitorAction(flowId) });
                        }
                        return result({ flowId, revision: flow.revision, status: "no_transition", currentStep: flow.currentStep, monitor: monitorAction(flowId) });
                    } };
            },
        }),
        tool({
            name: "kranz_flow_status", description: "Inspect a Kranz TaskFlow and its linked-task summary.", parameters: Type.Object({ flowId: Type.Optional(Type.String()) }),
            factory({ api, toolContext }) { const flows = api.runtime.tasks.managedFlows.fromToolContext(toolContext); return { name: "kranz_flow_status", label: "Inspect Kranz Flow", description: "Inspect the named or latest Kranz TaskFlow and linked-task summary.", parameters: Type.Object({ flowId: Type.Optional(Type.String()) }), async execute(_id, p) { const flow = p.flowId ? flows.get(String(p.flowId)) : flows.findLatest(); return result(flow ? { found: true, flow, taskSummary: flows.getTaskSummary(flow.flowId) } : { found: false }); } }; },
        }),
    ],
});
