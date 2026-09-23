import { type NtcPathRoots as PathRoots, type NtcQueueRecord as QueueRecord } from "./ntc-adapter.js";
type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
type JsonObject = {
    [key: string]: JsonValue;
};
type PluginConfig = {
    stateRoot?: string;
    artifactRoot?: string;
    ownerSessionKey?: string;
};
type GatewayAction = {
    kind: "read_page" | "publish_notion" | "sync_monitor";
    script: string;
    args: string[];
    env: Record<string, string>;
};
export declare function migrateNtcControllerState(state: JsonObject): {
    state: JsonObject;
    changed: boolean;
};
export declare function bindManagedFlows<T, C>(managedFlows: {
    bindSession(params: {
        sessionKey: string;
    }): T;
    fromToolContext(context: C): T;
}, toolContext: C, config?: PluginConfig): T;
export declare function resolvePathRoots(config?: PluginConfig, state?: JsonObject): PathRoots;
export declare function artifactPathFor(record: QueueRecord, roots?: PathRoots): string;
export declare function contextPathFor(record: QueueRecord, roots?: PathRoots): string;
export declare function receiptPathFor(record: QueueRecord, roots?: PathRoots): string;
export declare function outcomePathFor(record: QueueRecord, attempt: number, roots?: PathRoots): string;
export { inspectDossier } from "./ntc-adapter.js";
export declare function selectedPageIdsForRun(state: JsonObject, entryLimit?: number): string[];
export declare function prepareInitialState(state: JsonObject, config: PluginConfig, itemLimit?: number, triggerSource?: "manual" | "scheduled"): JsonObject;
export declare function buildControllerWakeMessage(params: {
    flowId: string;
    cause: "child_completion" | "deadline";
    runId?: string;
}): string;
export declare function deadlineHasExpired(deadlineAtValue: JsonValue | undefined, nowMs?: number): boolean;
export declare function pendingGatewayAction(flow: {
    currentStep?: string;
}, state: JsonObject, roots: PathRoots): GatewayAction | null;
declare const _default: import("openclaw/plugin-sdk/tool-plugin").DefinedToolPluginEntry;
export default _default;
