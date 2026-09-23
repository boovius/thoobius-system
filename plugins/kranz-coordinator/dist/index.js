import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { createDeadlineTag, createDispatchId, deadlineAt, freezeRunScope, normalizeItemLimit, } from "@thoobius/workflow-controller-core";
import { artifactPathFor as ntcArtifactPathFor, contextPathFor as ntcContextPathFor, inspectDossier, outcomePathFor as ntcOutcomePathFor, receiptPathFor as ntcReceiptPathFor, } from "./ntc-adapter.js";
import { createSessionTurnDeadlinePort, scheduleImmediateControllerWake } from "./openclaw-supervision.js";
const CONTROLLER_ID = "kranz/ntc-deep-research";
const MCCLINTOCK_AGENT_ID = "mcclintock-deep-opus";
const MAX_RESEARCH_ATTEMPTS = 2;
const CHILD_STALE_MS = 25 * 60 * 1000;
const WORKSPACE_ROOT = "/home/boovius/.openclaw/workspace";
const DEFAULT_STATE_ROOT = path.join(WORKSPACE_ROOT, ".ntc-state");
const WRITER_SCRIPT = "/home/boovius/.openclaw/workspace/scripts/ntc-write-deep-research.mjs";
const PAGE_READER_SCRIPT = "/home/boovius/.openclaw/workspace/scripts/ntc-page-read.mjs";
const MONITOR_SCRIPT = "/home/boovius/.openclaw/workspace/scripts/ntc-monitor-sync.mjs";
const KRANZ_OWNER_SESSION_KEY = "agent:kranz-coordinator:main";
const NTC_CONTROLLER_SESSION_KEY = "agent:ntc-controller:main";
const PluginConfigSchema = Type.Object({
    stateRoot: Type.Optional(Type.String({ description: "Shared NTC runtime-state root. Relative paths resolve from the shared workspace." })),
    artifactRoot: Type.Optional(Type.String({ description: "Durable research-artifact root. Defaults to <stateRoot>/artifacts." })),
    ownerSessionKey: Type.Optional(Type.Literal(KRANZ_OWNER_SESSION_KEY, { description: "Stable TaskFlow owner shared by Kranz main and scheduled callers." })),
    wakeSessionKey: Type.Optional(Type.Union([
        Type.Literal(KRANZ_OWNER_SESSION_KEY),
        Type.Literal(NTC_CONTROLLER_SESSION_KEY),
    ], { description: "Stable admitted controller session that receives completion and deadline wakes." })),
}, { additionalProperties: false });
const JsonText = Type.String({ description: "A JSON-encoded object used as the complete persisted TaskFlow state." });
const StartParameters = Type.Object({
    goal: Type.String(),
    stateJson: JsonText,
    currentStep: Type.Optional(Type.String()),
    itemLimit: Type.Optional(Type.Integer({ minimum: 1, description: "Number of next eligible records to freeze into this run scope." })),
    triggerSource: Type.Optional(Type.Union([Type.Literal("manual"), Type.Literal("scheduled")], { description: "Auditable start origin; both use the same controller path." })),
});
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
export function migrateNtcControllerState(state) {
    if (state.adapterId === "ntc-deep-research" && state.adapterVersion === 1) {
        return { state, changed: false };
    }
    return {
        state: {
            ...state,
            adapterId: "ntc-deep-research",
            adapterVersion: 1,
        },
        changed: true,
    };
}
function asObject(value) {
    return value && !Array.isArray(value) && typeof value === "object" ? value : {};
}
function result(details) {
    return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
}
export function bindManagedFlows(managedFlows, toolContext, config = {}) {
    const ownerSessionKey = config.ownerSessionKey?.trim();
    if (!ownerSessionKey)
        return managedFlows.fromToolContext(toolContext);
    if (ownerSessionKey !== KRANZ_OWNER_SESSION_KEY) {
        throw new Error(`Kranz ownerSessionKey must be exactly ${KRANZ_OWNER_SESSION_KEY}`);
    }
    return managedFlows.bindSession({ sessionKey: ownerSessionKey });
}
export function resolveControllerWakeTarget(config = {}) {
    const sessionKey = config.wakeSessionKey?.trim() || config.ownerSessionKey?.trim() || KRANZ_OWNER_SESSION_KEY;
    if (sessionKey !== KRANZ_OWNER_SESSION_KEY && sessionKey !== NTC_CONTROLLER_SESSION_KEY) {
        throw new Error(`Kranz wakeSessionKey must be ${KRANZ_OWNER_SESSION_KEY} or ${NTC_CONTROLLER_SESSION_KEY}`);
    }
    const [, agentId, lane, ...extra] = sessionKey.split(":");
    if (!agentId || lane !== "main" || extra.length > 0)
        throw new Error(`Invalid controller wake session key: ${sessionKey}`);
    return { sessionKey, agentId };
}
function resolveWorkspacePath(value, fallback) {
    const candidate = value || fallback;
    const resolved = path.resolve(path.isAbsolute(candidate) ? candidate : path.join(WORKSPACE_ROOT, candidate));
    const relative = path.relative(WORKSPACE_ROOT, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Kranz path must remain inside ${WORKSPACE_ROOT}: ${resolved}`);
    }
    return resolved;
}
export function resolvePathRoots(config = {}, state = {}) {
    const stateRootValue = typeof state.stateRoot === "string" ? state.stateRoot : config.stateRoot;
    const stateRoot = resolveWorkspacePath(stateRootValue, DEFAULT_STATE_ROOT);
    const artifactRootValue = typeof state.artifactRoot === "string" ? state.artifactRoot : config.artifactRoot;
    const artifactRoot = resolveWorkspacePath(artifactRootValue, path.join(stateRoot, "artifacts"));
    return { stateRoot, artifactRoot };
}
export function artifactPathFor(record, roots = resolvePathRoots()) {
    return ntcArtifactPathFor(record, roots);
}
export function contextPathFor(record, roots = resolvePathRoots()) {
    return ntcContextPathFor(record, roots);
}
export function receiptPathFor(record, roots = resolvePathRoots()) {
    return ntcReceiptPathFor(record, roots);
}
export function outcomePathFor(record, attempt, roots = resolvePathRoots()) {
    return ntcOutcomePathFor(record, attempt, roots);
}
export { inspectDossier } from "./ntc-adapter.js";
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
function handledIdsFrom(state) {
    const ids = new Set();
    for (const key of ["completedPageIds", "skippedPageIds"]) {
        for (const value of Array.isArray(state[key]) ? state[key] : [])
            if (typeof value === "string")
                ids.add(value);
    }
    for (const value of Array.isArray(state.blockedRecords) ? state.blockedRecords : []) {
        const pageId = asObject(value).pageId;
        if (typeof pageId === "string")
            ids.add(pageId);
    }
    return ids;
}
export function selectedPageIdsForRun(state, entryLimit) {
    normalizeItemLimit(entryLimit);
    const handled = handledIdsFrom(state);
    const index = Number(state.currentIndex ?? 0);
    if (!Number.isInteger(index) || index < 0)
        throw new Error("stateJson.currentIndex must be a non-negative integer");
    const available = queueFrom(state).slice(index).filter((record) => !handled.has(record.pageId));
    return available.slice(0, entryLimit ?? available.length).map((record) => record.pageId);
}
function createRunScope(state, entryLimit) {
    const queue = queueFrom(state);
    const index = Number(state.currentIndex ?? 0);
    if (!Number.isInteger(index) || index < 0)
        throw new Error("stateJson.currentIndex must be a non-negative integer");
    const frozen = freezeRunScope({
        records: queue.slice(index).map((record) => ({ id: record.pageId })),
        handledRecordIds: handledIdsFrom(state),
        itemLimit: entryLimit,
    });
    return {
        mode: frozen.mode,
        requestedEntries: frozen.requestedItems,
        selectedPageIds: frozen.selectedRecordIds,
        handledPageIds: frozen.handledRecordIds,
        remainingPageIds: frozen.remainingRecordIds,
        status: frozen.status,
        startedAt: frozen.startedAt,
        ...(frozen.completedAt ? { completedAt: frozen.completedAt } : {}),
    };
}
export function prepareInitialState(state, config, itemLimit, triggerSource = "manual") {
    const roots = resolvePathRoots(config, state);
    const runScope = createRunScope(state, itemLimit);
    const queue = queueFrom(state);
    const firstPageId = runScope.selectedPageIds[0];
    const selectedIndex = firstPageId ? queue.findIndex((record) => record.pageId === firstPageId) : Number(state.currentIndex ?? 0);
    const selected = selectedIndex >= 0 ? queue[selectedIndex] : undefined;
    return {
        ...state,
        ...roots,
        runScope,
        startRequest: {
            triggerSource,
            itemLimit: itemLimit ?? null,
            requestedAt: new Date().toISOString(),
        },
        ...(selected
            ? {
                currentIndex: selectedIndex,
                currentPageId: selected.pageId,
                currentProspect: selected.name,
                currentPosition: selected.position,
            }
            : {}),
    };
}
export function buildControllerWakeMessage(params) {
    const evidence = params.runId ? ` Child run: ${params.runId}.` : "";
    return [
        `[Deterministic workflow controller ${params.cause}]`,
        `Resume TaskFlow ${params.flowId}.${evidence}`,
        `First call kranz_flow_tick with {"flowId":"${params.flowId}","cause":"${params.cause}"}.`,
        "Use only the Kranz controller tools and the exact protected action they authorize.",
        "Advance until the flow is waiting again, the requested run scope is complete, or the flow is terminal.",
        "Do not select work outside the frozen run scope.",
    ].join(" ");
}
export function deadlineHasExpired(deadlineAtValue, nowMs = Date.now()) {
    if (typeof deadlineAtValue !== "string")
        return false;
    const parsed = Date.parse(deadlineAtValue);
    return Number.isFinite(parsed) && nowMs >= parsed;
}
function scopeAfterHandling(state, pageId) {
    const scope = asObject(state.runScope);
    const selectedPageIds = Array.isArray(scope.selectedPageIds) ? scope.selectedPageIds.filter((value) => typeof value === "string") : [];
    const handledPageIds = Array.isArray(scope.handledPageIds) ? scope.handledPageIds.filter((value) => typeof value === "string") : [];
    if (!handledPageIds.includes(pageId))
        handledPageIds.push(pageId);
    const remainingPageIds = selectedPageIds.filter((value) => !handledPageIds.includes(value));
    const complete = remainingPageIds.length === 0;
    return { mode: scope.mode === "limited" ? "limited" : "all_remaining", requestedEntries: typeof scope.requestedEntries === "number" ? scope.requestedEntries : null, selectedPageIds, handledPageIds, remainingPageIds, status: complete ? "complete" : "active", startedAt: typeof scope.startedAt === "string" ? scope.startedAt : new Date().toISOString(), ...(complete ? { completedAt: new Date().toISOString() } : {}) };
}
function nextQueueIndex(queue, state, currentIndex, scope, justHandledPageId) {
    if (scope.status === "active" && scope.remainingPageIds[0]) {
        const selectedIndex = queue.findIndex((record) => record.pageId === scope.remainingPageIds[0]);
        if (selectedIndex >= 0)
            return selectedIndex;
    }
    const handled = handledIdsFrom(state);
    handled.add(justHandledPageId);
    const nextIndex = queue.findIndex((record, index) => index > currentIndex && !handled.has(record.pageId));
    return nextIndex >= 0 ? nextIndex : queue.length;
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
function monitorAction(flowId, roots) {
    return { script: MONITOR_SCRIPT, args: [flowId, roots.stateRoot], env: { OPENCLAW_NOTION_PROFILE: "ntc", NTC_STATE_ROOT: roots.stateRoot } };
}
function actionRequired(flow, action, roots) {
    return { flowId: flow.flowId, revision: flow.revision, status: "action_required", currentStep: flow.currentStep, action, monitor: monitorAction(flow.flowId, roots) };
}
export function pendingGatewayAction(flow, state, roots) {
    const queue = queueFrom(state);
    const index = Number(state.currentIndex ?? 0);
    if (!Number.isInteger(index) || index < 0)
        throw new Error("stateJson.currentIndex must be a non-negative integer");
    const record = queue[index];
    if (!record)
        return null;
    const step = normalizeStep(flow.currentStep);
    if (step === Steps.SELECT_RECORD) {
        const contextPath = contextPathFor(record, roots);
        if (!readContext(contextPath, record.pageId).ok) {
            return { kind: "read_page", script: PAGE_READER_SCRIPT, args: [record.pageId, contextPath], env: { OPENCLAW_NOTION_PROFILE: "ntc", NTC_STATE_ROOT: roots.stateRoot } };
        }
        return null;
    }
    if (step === Steps.WRITE_NOTION) {
        const artifactPath = artifactPathFor(record, roots);
        const artifact = inspectDossier(artifactPath, record.pageId, record.name);
        if (!artifact.ok || !artifact.sha256)
            throw new Error(`Cannot publish invalid research artifact: ${artifact.errors.join(",")}`);
        const receiptPath = receiptPathFor(record, roots);
        if (readReceipt(receiptPath, record.pageId, artifact.sha256))
            return null;
        return { kind: "publish_notion", script: WRITER_SCRIPT, args: [record.pageId, artifactPath, receiptPath], env: { OPENCLAW_NOTION_PROFILE: "ntc", NTC_STATE_ROOT: roots.stateRoot } };
    }
    return null;
}
export default defineToolPlugin({
    id: "kranz-coordinator",
    name: "Kranz Coordinator",
    description: "Run and inspect the durable Kranz NTC research controller.",
    configSchema: PluginConfigSchema,
    tools: (tool) => [
        tool({
            name: "kranz_flow_start",
            description: "Create a durable Kranz NTC research TaskFlow through the shared manual-or-scheduled start path.",
            parameters: StartParameters,
            factory({ api, toolContext, config }) {
                const flows = bindManagedFlows(api.runtime.tasks.managedFlows, toolContext, config);
                return { name: "kranz_flow_start", label: "Start Kranz Flow", description: "Create a durable Kranz NTC research TaskFlow through the shared manual-or-scheduled start path.", parameters: StartParameters, executionMode: "sequential",
                    async execute(_id, params) {
                        const state = parseState(String(params.stateJson));
                        const itemLimit = params.itemLimit === undefined ? undefined : Number(params.itemLimit);
                        const triggerSource = params.triggerSource === "scheduled" ? "scheduled" : "manual";
                        const initialState = prepareInitialState(state, config, itemLimit, triggerSource);
                        return result(flows.createManaged({ controllerId: CONTROLLER_ID, goal: String(params.goal), status: "running", currentStep: normalizeStep(params.currentStep == null ? undefined : String(params.currentStep)), stateJson: initialState }));
                    } };
            },
        }),
        tool({
            name: "kranz_flow_link_task",
            description: "Link an already-launched McClintock child task to a Kranz TaskFlow.",
            parameters: Type.Object({ flowId: Type.String(), childSessionKey: Type.String(), runId: Type.String(), label: Type.String(), task: Type.String() }),
            factory({ api, toolContext, config }) {
                const flows = bindManagedFlows(api.runtime.tasks.managedFlows, toolContext, config);
                return { name: "kranz_flow_link_task", label: "Link McClintock Task", description: "Link an already-launched McClintock child task to a Kranz TaskFlow.", parameters: Type.Object({ flowId: Type.String(), childSessionKey: Type.String(), runId: Type.String(), label: Type.String(), task: Type.String() }), executionMode: "sequential",
                    async execute(_id, p) { return result(flows.runTask({ flowId: String(p.flowId), runtime: "subagent", agentId: MCCLINTOCK_AGENT_ID, childSessionKey: String(p.childSessionKey), runId: String(p.runId), label: String(p.label), task: String(p.task), status: "running", startedAt: Date.now(), lastEventAt: Date.now() })); } };
            },
        }),
        tool({
            name: "kranz_flow_checkpoint",
            description: "Persist a Kranz TaskFlow checkpoint with revision checking.",
            parameters: Type.Object({ flowId: Type.String(), expectedRevision: Type.Number(), disposition: Type.Union([Type.Literal("running"), Type.Literal("waiting"), Type.Literal("succeeded"), Type.Literal("failed")]), currentStep: Type.Optional(Type.String()), stateJson: JsonText, summary: Type.Optional(Type.String()) }),
            factory({ api, toolContext, config }) {
                const flows = bindManagedFlows(api.runtime.tasks.managedFlows, toolContext, config);
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
            name: "kranz_flow_set_run_scope",
            description: "Start a manual or scheduled run by freezing the next N eligible queue entries.",
            parameters: Type.Object({ flowId: Type.String(), expectedRevision: Type.Number(), itemLimit: Type.Optional(Type.Integer({ minimum: 1 })), entryLimit: Type.Optional(Type.Integer({ minimum: 1, description: "Deprecated alias for itemLimit." })), triggerSource: Type.Optional(Type.Union([Type.Literal("manual"), Type.Literal("scheduled")])) }),
            factory({ api, toolContext, config }) {
                const flows = bindManagedFlows(api.runtime.tasks.managedFlows, toolContext, config);
                return { name: "kranz_flow_set_run_scope", label: "Start Kranz Run", description: "Start a manual or scheduled run by freezing the next N eligible queue entries.", parameters: Type.Object({ flowId: Type.String(), expectedRevision: Type.Number(), itemLimit: Type.Optional(Type.Integer({ minimum: 1 })), entryLimit: Type.Optional(Type.Integer({ minimum: 1, description: "Deprecated alias for itemLimit." })), triggerSource: Type.Optional(Type.Union([Type.Literal("manual"), Type.Literal("scheduled")])) }), executionMode: "sequential",
                    async execute(_id, p) {
                        const flowId = String(p.flowId);
                        const expectedRevision = Number(p.expectedRevision);
                        const flow = flows.get(flowId);
                        if (!flow || flow.syncMode !== "managed")
                            return result({ found: false, flowId });
                        if (flow.controllerId !== CONTROLLER_ID)
                            throw new Error(`Flow ${flowId} is not owned by ${CONTROLLER_ID}`);
                        if (flow.revision !== expectedRevision)
                            return result({ status: "revision_conflict", flowId, expectedRevision, actualRevision: flow.revision });
                        if (normalizeStep(flow.currentStep) !== Steps.SELECT_RECORD || Object.keys(asObject(asObject(flow.stateJson).child)).length) {
                            return result({ status: "scope_change_not_safe", flowId, revision: flow.revision, currentStep: flow.currentStep });
                        }
                        const state = asObject(flow.stateJson);
                        if (p.itemLimit !== undefined && p.entryLimit !== undefined)
                            throw new Error("Provide itemLimit, not both itemLimit and entryLimit");
                        const entryLimitValue = p.itemLimit ?? p.entryLimit;
                        const entryLimit = entryLimitValue === undefined ? undefined : Number(entryLimitValue);
                        const triggerSource = p.triggerSource === "scheduled" ? "scheduled" : "manual";
                        const runScope = createRunScope(state, entryLimit);
                        if (!runScope.selectedPageIds.length)
                            return result({ status: "no_available_entries", flowId, revision: flow.revision, runScope });
                        const queue = queueFrom(state);
                        const selectedIndex = queue.findIndex((record) => record.pageId === runScope.selectedPageIds[0]);
                        const selectedRecord = queue[selectedIndex];
                        const scopedState = { ...state, runScope, startRequest: { triggerSource, itemLimit: entryLimit ?? null, requestedAt: new Date().toISOString() }, currentIndex: selectedIndex, currentPageId: selectedRecord.pageId, currentProspect: selectedRecord.name, currentPosition: selectedRecord.position };
                        const mutation = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.SELECT_RECORD, stateJson: scopedState });
                        return result({ status: mutation.applied ? "run_scope_set" : "revision_conflict", flowId, mutation, runScope });
                    } };
            },
        }),
        tool({
            name: "kranz_flow_tick",
            description: "Advance one Kranz flow idempotently until it waits or needs a protected Gateway action.",
            parameters: Type.Object({ flowId: Type.String(), cause: Type.Optional(Type.Union([Type.Literal("normal"), Type.Literal("child_completion"), Type.Literal("deadline")])) }),
            factory({ api, toolContext, config }) {
                const flows = bindManagedFlows(api.runtime.tasks.managedFlows, toolContext, config);
                return { name: "kranz_flow_tick", label: "Tick Kranz Flow", description: "Advance one Kranz flow idempotently until it waits or needs a protected Gateway action.", parameters: Type.Object({ flowId: Type.String(), cause: Type.Optional(Type.Union([Type.Literal("normal"), Type.Literal("child_completion"), Type.Literal("deadline")])) }), executionMode: "sequential",
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
                        const roots = resolvePathRoots(config, state);
                        const schemaMigration = migrateNtcControllerState(state);
                        if (schemaMigration.changed || state.stateRoot !== roots.stateRoot || state.artifactRoot !== roots.artifactRoot) {
                            const migration = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: normalizeStep(flow.currentStep), stateJson: { ...schemaMigration.state, ...roots } });
                            if (!migration.applied)
                                return result({ status: "revision_conflict", mutation: migration });
                            flow = migration.flow;
                            state = asObject(flow.stateJson);
                        }
                        let runScope = asObject(state.runScope);
                        if (runScope.status === "complete") {
                            return result({ flowId, revision: flow.revision, status: "run_scope_complete", currentStep: flow.currentStep, runScope });
                        }
                        if (runScope.status !== "active") {
                            const initializedScope = createRunScope(state);
                            if (!initializedScope.selectedPageIds.length)
                                return result({ found: true, status: "batch_complete", mutation: flows.finish({ flowId, expectedRevision: flow.revision, stateJson: { ...state, runScope: initializedScope, completedAt: new Date().toISOString() } }), monitor: monitorAction(flowId, roots) });
                            const scoped = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: normalizeStep(flow.currentStep), stateJson: { ...state, runScope: initializedScope } });
                            if (!scoped.applied)
                                return result({ status: "revision_conflict", mutation: scoped });
                            flow = scoped.flow;
                            state = asObject(flow.stateJson);
                            runScope = asObject(state.runScope);
                        }
                        const queue = queueFrom(state);
                        const index = Number(state.currentIndex ?? 0);
                        if (!Number.isInteger(index) || index < 0)
                            throw new Error("stateJson.currentIndex must be a non-negative integer");
                        const record = queue[index];
                        if (!record)
                            return result({ found: true, status: "batch_complete", mutation: flows.finish({ flowId, expectedRevision: flow.revision, stateJson: { ...state, completedAt: new Date().toISOString() } }), monitor: monitorAction(flowId, roots) });
                        state = withCurrent(state, record, index);
                        const artifactPath = artifactPathFor(record, roots), contextPath = contextPathFor(record, roots), receiptPath = receiptPathFor(record, roots);
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
                                    return result(actionRequired(flow, { kind: "read_page", pageId: record.pageId, prospect: record.name, outputPath: contextPath, script: PAGE_READER_SCRIPT, args: [record.pageId, contextPath], env: { OPENCLAW_NOTION_PROFILE: "ntc", NTC_STATE_ROOT: roots.stateRoot } }, roots));
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
                                const updatedScope = scopeAfterHandling(state, record.pageId);
                                const nextIndex = nextQueueIndex(queue, state, index, updatedScope, record.pageId), next = queue[nextIndex];
                                const nextState = { ...state, runScope: updatedScope, blockedRecords: blocked, currentIndex: nextIndex, child: null, artifact: null, ...(next ? { currentPageId: next.pageId, currentProspect: next.name, currentPosition: next.position } : {}) };
                                const mutation = next ? (updatedScope.status === "complete" ? flows.setWaiting({ flowId, expectedRevision: flow.revision, currentStep: Steps.SELECT_RECORD, stateJson: nextState, waitJson: { kind: "run_scope_complete", handledPageIds: updatedScope.handledPageIds } }) : flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.SELECT_RECORD, stateJson: nextState })) : flows.finish({ flowId, expectedRevision: flow.revision, stateJson: { ...nextState, completedAt: new Date().toISOString() } });
                                return result({ status: next && updatedScope.status === "complete" ? "run_scope_complete" : "record_blocked", pageId: record.pageId, mutation, runScope: updatedScope, monitor: monitorAction(flowId, roots) });
                            }
                            const dispatchId = createDispatchId({ namespace: "kranz", flowId, recordId: record.pageId, attempt });
                            const requestedSessionKey = `agent:${MCCLINTOCK_AGENT_ID}:kranz-${flowId}-${record.pageId}-${attempt}`;
                            const outcomePath = outcomePathFor(record, attempt, roots);
                            const startedAt = new Date();
                            const watchdogTag = createDeadlineTag({ flowId, recordId: record.pageId, attempt });
                            const watchdogAt = deadlineAt(startedAt, 20 * 60 * 1000);
                            const prompt = buildResearchPrompt(record, queue.length, contextPath, artifactPath);
                            const launched = await api.runtime.subagent.run({
                                sessionKey: requestedSessionKey,
                                message: prompt,
                                promptMode: "minimal",
                                deliver: false,
                                idempotencyKey: dispatchId,
                                cwd: WORKSPACE_ROOT,
                            });
                            const runId = launched.runId;
                            const childSessionKey = launched.sessionKey ?? requestedSessionKey;
                            const linked = flows.runTask({ flowId, runtime: "subagent", sourceId: dispatchId, childSessionKey, agentId: MCCLINTOCK_AGENT_ID, runId, label: `McClintock — ${record.name}`, task: prompt, status: "running", startedAt: startedAt.getTime(), lastEventAt: startedAt.getTime() });
                            if (!linked.created && !linked.found)
                                return result({ status: "link_failed", reason: linked.reason, flowId, runId });
                            flow = flows.get(flowId);
                            const waiting = flows.setWaiting({ flowId, expectedRevision: flow.revision, currentStep: Steps.WAIT_RESEARCH, stateJson: { ...state, child: { dispatchId, runId, childSessionKey, attempt, status: "running", startedAt: startedAt.toISOString(), outcomePath }, expectedArtifactPath: artifactPath, deadlineAt: watchdogAt, watchdogTag }, waitJson: { kind: "child_completion", childRunId: runId, childSessionKey, pageId: record.pageId, attempt, deadlineAt: watchdogAt, watchdogTag } });
                            if (!waiting.applied)
                                return result({ status: "revision_conflict", linked, mutation: waiting });
                            const wakeTarget = resolveControllerWakeTarget(config);
                            const childIdentity = { dispatchId, runId, childSessionKey, attempt };
                            const deadlines = createSessionTurnDeadlinePort({
                                scheduler: api.session.workflow,
                                sessionKey: wakeTarget.sessionKey,
                                agentId: wakeTarget.agentId,
                                messageForDeadline: () => buildControllerWakeMessage({ flowId, cause: "deadline", runId }),
                            });
                            await deadlines.schedule({ tag: watchdogTag, at: watchdogAt, flowId, child: childIdentity });
                            void (async () => {
                                let completionKind = "completion";
                                try {
                                    const outcome = await api.runtime.subagent.waitForRun({ runId, timeoutMs: 20 * 60 * 1000 });
                                    completionKind = outcome.status === "ok" ? "completion" : "failure";
                                    writeOutcome(outcomePath, outcome.status === "ok"
                                        ? { status: "succeeded", runId, endedAt: new Date().toISOString() }
                                        : { status: "failed", runId, endedAt: new Date().toISOString(), error: outcome.error ?? outcome.status });
                                }
                                catch (error) {
                                    completionKind = "failure";
                                    writeOutcome(outcomePath, { status: "failed", runId, endedAt: new Date().toISOString(), error: String(error) });
                                }
                                try {
                                    await deadlines.cancel(watchdogTag);
                                }
                                catch (error) {
                                    api.logger.warn(`Unable to cancel Kranz watchdog ${watchdogTag}: ${String(error)}`);
                                }
                                try {
                                    await scheduleImmediateControllerWake({
                                        scheduler: api.session.workflow,
                                        sessionKey: wakeTarget.sessionKey,
                                        agentId: wakeTarget.agentId,
                                        flowId,
                                        child: childIdentity,
                                        tag: `${watchdogTag}-${completionKind}`,
                                        message: buildControllerWakeMessage({ flowId, cause: "child_completion", runId }),
                                        label: `Kranz child ${completionKind} — ${record.name}`,
                                    });
                                }
                                catch (error) {
                                    api.logger.error(`Unable to schedule Kranz completion wake for ${runId}: ${String(error)}`);
                                }
                            })();
                            return result({ flowId, revision: waiting.flow.revision, status: "research_dispatched", currentStep: Steps.WAIT_RESEARCH, child: { runId, childSessionKey, attempt }, watchdog: { tag: watchdogTag, at: watchdogAt, scheduled: true }, monitor: monitorAction(flowId, roots) });
                        }
                        if (normalizeStep(flow.currentStep) === Steps.WAIT_RESEARCH) {
                            artifact = inspectDossier(artifactPath, record.pageId, record.name);
                            const child = asObject(state.child);
                            const attempt = Number(child.attempt ?? attemptsFor(state, record.pageId) + 1);
                            const runId = String(child.runId ?? "");
                            const outcomePath = String(child.outcomePath ?? outcomePathFor(record, attempt, roots));
                            const outcome = readOutcome(outcomePath, runId);
                            const startedAtMs = Date.parse(String(child.startedAt ?? ""));
                            const deadlineExpired = p.cause === "deadline" && deadlineHasExpired(state.deadlineAt);
                            const stale = deadlineExpired || (Number.isFinite(startedAtMs) && Date.now() - startedAtMs >= CHILD_STALE_MS);
                            if (!artifact.ok && (outcome || stale)) {
                                const failure = outcome?.status === "failed" ? outcome.error ?? "research_run_failed" : stale ? "research_run_stale" : `invalid_packet:${artifact.errors.join(",")}`;
                                const mutation = flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.DISPATCH_RESEARCH, stateJson: { ...state, retries: { ...asObject(state.retries), [record.pageId]: attempt }, child: { ...child, status: "failed", completedAt: outcome?.endedAt ?? new Date().toISOString(), error: failure, validationErrors: artifact.errors } } });
                                return result({ status: "research_retry_scheduled", pageId: record.pageId, attempt, reason: failure, mutation, monitor: monitorAction(flowId, roots) });
                            }
                            if (!artifact.ok)
                                return result({ flowId, revision: flow.revision, status: "waiting", currentStep: Steps.WAIT_RESEARCH, waitingFor: asObject(flow.waitJson), artifactErrors: artifact.errors, monitor: monitorAction(flowId, roots) });
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
                                return result({ status: "research_packet_invalid", pageId: record.pageId, attempt, errors: artifact.errors, mutation, monitor: monitorAction(flowId, roots) });
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
                                return result(actionRequired(flow, { kind: "publish_notion", pageId: record.pageId, prospect: record.name, artifactPath, artifactSha256: hash, receiptPath, script: WRITER_SCRIPT, args: [record.pageId, artifactPath, receiptPath], env: { OPENCLAW_NOTION_PROFILE: "ntc", NTC_STATE_ROOT: roots.stateRoot } }, roots));
                            const completed = Array.isArray(state.completedPageIds) ? [...state.completedPageIds] : [];
                            if (!completed.includes(record.pageId))
                                completed.push(record.pageId);
                            const updatedScope = scopeAfterHandling(state, record.pageId);
                            const nextIndex = nextQueueIndex(queue, state, index, updatedScope, record.pageId), next = queue[nextIndex];
                            const nextState = { ...state, runScope: updatedScope, completedPageIds: completed, currentIndex: nextIndex, child: null, artifact: { path: artifactPath, sha256: hash, packetComplete: true }, notionWrite: { pageId: record.pageId, artifactSha256: hash, verified: true, status: "Deep Research", verifiedAt: receipt.verifiedAt ?? new Date().toISOString() }, readBackVerification: receipt.readBack ?? { verified: true }, lastVerifiedAt: receipt.verifiedAt ?? new Date().toISOString(), lastCompletedRecord: { pageId: record.pageId, name: record.name, position: record.position }, ...(next ? { currentPageId: next.pageId, currentProspect: next.name, currentPosition: next.position } : {}) };
                            const mutation = next ? (updatedScope.status === "complete" ? flows.setWaiting({ flowId, expectedRevision: flow.revision, currentStep: Steps.SELECT_RECORD, stateJson: nextState, waitJson: { kind: "run_scope_complete", handledPageIds: updatedScope.handledPageIds } }) : flows.resume({ flowId, expectedRevision: flow.revision, status: "running", currentStep: Steps.SELECT_RECORD, stateJson: nextState })) : flows.finish({ flowId, expectedRevision: flow.revision, stateJson: { ...nextState, completedAt: new Date().toISOString() } });
                            return result({ status: next && updatedScope.status === "complete" ? "run_scope_complete" : next ? "record_complete" : "batch_complete", completed: { pageId: record.pageId, name: record.name }, next: next ?? null, mutation, runScope: updatedScope, monitor: monitorAction(flowId, roots) });
                        }
                        return result({ flowId, revision: flow.revision, status: "no_transition", currentStep: flow.currentStep, monitor: monitorAction(flowId, roots) });
                    } };
            },
        }),
        tool({
            name: "kranz_flow_execute_pending_action",
            description: "Execute only the protected NTC Notion action implied by the current flow revision.",
            parameters: Type.Object({ flowId: Type.String(), expectedRevision: Type.Number() }),
            factory({ api, toolContext, config }) {
                const flows = bindManagedFlows(api.runtime.tasks.managedFlows, toolContext, config);
                return { name: "kranz_flow_execute_pending_action", label: "Execute Kranz Notion Action", description: "Execute only the protected NTC Notion action implied by the current flow revision.", parameters: Type.Object({ flowId: Type.String(), expectedRevision: Type.Number() }), executionMode: "sequential",
                    async execute(_id, p) {
                        const flowId = String(p.flowId);
                        const expectedRevision = Number(p.expectedRevision);
                        const flow = flows.get(flowId);
                        if (!flow || flow.syncMode !== "managed")
                            return result({ found: false, flowId });
                        if (flow.controllerId !== CONTROLLER_ID)
                            throw new Error(`Flow ${flowId} is not owned by ${CONTROLLER_ID}`);
                        if (flow.revision !== expectedRevision)
                            return result({ status: "revision_conflict", flowId, expectedRevision, actualRevision: flow.revision });
                        const state = asObject(flow.stateJson);
                        const roots = resolvePathRoots(config, state);
                        const action = pendingGatewayAction(flow, state, roots);
                        const queue = queueFrom(state);
                        const record = queue[Number(state.currentIndex ?? 0)];
                        if (!record)
                            return result({ status: "no_pending_action", flowId, revision: flow.revision, currentStep: flow.currentStep });
                        if (action)
                            return result({ status: "action_authorized", flowId, revision: flow.revision, currentStep: flow.currentStep, action });
                        if (normalizeStep(flow.currentStep) === Steps.SELECT_RECORD) {
                            const context = readContext(contextPathFor(record, roots), record.pageId);
                            if (context.ok)
                                return result({ status: "action_complete", action: "read_page", flowId, revision: flow.revision, pageId: record.pageId, outputPath: contextPathFor(record, roots), readAt: context.readAt ?? null });
                        }
                        if (normalizeStep(flow.currentStep) === Steps.WRITE_NOTION) {
                            const artifact = inspectDossier(artifactPathFor(record, roots), record.pageId, record.name);
                            const receipt = artifact.sha256 ? readReceipt(receiptPathFor(record, roots), record.pageId, artifact.sha256) : null;
                            if (receipt)
                                return result({ status: "action_complete", action: "publish_notion", flowId, revision: flow.revision, pageId: record.pageId, receiptPath: receiptPathFor(record, roots), verifiedAt: receipt.verifiedAt ?? null });
                        }
                        return result({ status: "no_pending_action", flowId, revision: flow.revision, currentStep: flow.currentStep });
                    } };
            },
        }),
        tool({
            name: "kranz_flow_sync_monitor",
            description: "Sync the human-readable Notion monitor for one exact flow revision through the protected Gateway.",
            parameters: Type.Object({ flowId: Type.String(), expectedRevision: Type.Number() }),
            factory({ api, toolContext, config }) {
                const flows = bindManagedFlows(api.runtime.tasks.managedFlows, toolContext, config);
                return { name: "kranz_flow_sync_monitor", label: "Sync Kranz Monitor", description: "Sync the human-readable Notion monitor for one exact flow revision through the protected Gateway.", parameters: Type.Object({ flowId: Type.String(), expectedRevision: Type.Number() }), executionMode: "sequential",
                    async execute(_id, p) {
                        const flowId = String(p.flowId);
                        const expectedRevision = Number(p.expectedRevision);
                        const flow = flows.get(flowId);
                        if (!flow || flow.syncMode !== "managed")
                            return result({ found: false, flowId });
                        if (flow.controllerId !== CONTROLLER_ID)
                            throw new Error(`Flow ${flowId} is not owned by ${CONTROLLER_ID}`);
                        if (flow.revision !== expectedRevision)
                            return result({ status: "revision_conflict", flowId, expectedRevision, actualRevision: flow.revision });
                        const roots = resolvePathRoots(config, asObject(flow.stateJson));
                        const monitorPath = path.join(roots.stateRoot, "monitor", "notion-monitor.json");
                        if (existsSync(monitorPath)) {
                            const monitor = JSON.parse(readFileSync(monitorPath, "utf8"));
                            if (monitor.flowId === flowId && monitor.syncedRevision === flow.revision) {
                                return result({ status: "monitor_synced", flowId, revision: flow.revision, monitorPath, url: monitor.url ?? null, syncedAt: monitor.syncedAt ?? null });
                            }
                        }
                        const base = monitorAction(flowId, roots);
                        const action = { kind: "sync_monitor", script: base.script, args: base.args, env: base.env };
                        return result({ status: "action_authorized", flowId, revision: flow.revision, action });
                    } };
            },
        }),
        tool({
            name: "kranz_flow_status", description: "Inspect a Kranz TaskFlow and its linked-task summary.", parameters: Type.Object({ flowId: Type.Optional(Type.String()) }),
            factory({ api, toolContext, config }) { const flows = bindManagedFlows(api.runtime.tasks.managedFlows, toolContext, config); return { name: "kranz_flow_status", label: "Inspect Kranz Flow", description: "Inspect the named or latest Kranz TaskFlow and linked-task summary.", parameters: Type.Object({ flowId: Type.Optional(Type.String()) }), async execute(_id, p) { const flow = p.flowId ? flows.get(String(p.flowId)) : flows.findLatest(); return result(flow ? { found: true, flow, taskSummary: flows.getTaskSummary(flow.flowId) } : { found: false }); } }; },
        }),
    ],
});
