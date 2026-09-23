import crypto from "node:crypto";
export function fingerprintArtifact(content) {
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    return {
        algorithm: "sha256",
        hex: crypto.createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.byteLength,
    };
}
export function normalizeItemLimit(value) {
    if (value === undefined)
        return undefined;
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error("itemLimit must be a positive integer");
    }
    return value;
}
export function freezeRunScope(params) {
    const itemLimit = normalizeItemLimit(params.itemLimit);
    const handled = params.handledRecordIds ?? new Set();
    const selectedRecordIds = params.records
        .filter((record) => !handled.has(record.id))
        .slice(0, itemLimit ?? params.records.length)
        .map((record) => record.id);
    const startedAt = (params.now ?? new Date()).toISOString();
    const complete = selectedRecordIds.length === 0;
    return {
        mode: itemLimit === undefined ? "all_remaining" : "limited",
        requestedItems: itemLimit ?? null,
        selectedRecordIds,
        handledRecordIds: [],
        remainingRecordIds: [...selectedRecordIds],
        status: complete ? "complete" : "active",
        startedAt,
        ...(complete ? { completedAt: startedAt } : {}),
    };
}
export function createDispatchId(params) {
    if (!params.namespace.trim())
        throw new Error("dispatch namespace is required");
    if (!params.flowId.trim())
        throw new Error("flowId is required");
    if (!params.recordId.trim())
        throw new Error("recordId is required");
    if (!Number.isSafeInteger(params.attempt) || params.attempt < 1) {
        throw new Error("attempt must be a positive integer");
    }
    return `${params.namespace}:${params.flowId}:${params.recordId}:attempt:${params.attempt}`;
}
export function completionMatchesChild(child, event) {
    return child.runId === event.runId && child.childSessionKey === event.childSessionKey;
}
export function createDeadlineTag(params) {
    const digest = fingerprintArtifact(`${params.flowId}\n${params.recordId}\n${params.attempt}`).hex.slice(0, 20);
    return `workflow-deadline-${digest}`;
}
export function deadlineAt(startedAt, timeoutMs) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
        throw new Error("timeoutMs must be a positive integer");
    }
    return new Date(startedAt.getTime() + timeoutMs).toISOString();
}
