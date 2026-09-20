type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
type JsonObject = {
    [key: string]: JsonValue;
};
type QueueRecord = {
    position: number;
    pageId: string;
    name: string;
    entityType?: string | null;
    url?: string;
};
type ArtifactInspection = {
    ok: boolean;
    path: string;
    sha256?: string;
    errors: string[];
};
type PluginConfig = {
    stateRoot?: string;
    artifactRoot?: string;
};
type PathRoots = {
    stateRoot: string;
    artifactRoot: string;
};
type GatewayAction = {
    kind: "read_page" | "publish_notion" | "sync_monitor";
    script: string;
    args: string[];
    env: Record<string, string>;
};
export declare function resolvePathRoots(config?: PluginConfig, state?: JsonObject): PathRoots;
export declare function artifactPathFor(record: QueueRecord, roots?: PathRoots): string;
export declare function contextPathFor(record: QueueRecord, roots?: PathRoots): string;
export declare function receiptPathFor(record: QueueRecord, roots?: PathRoots): string;
export declare function outcomePathFor(record: QueueRecord, attempt: number, roots?: PathRoots): string;
export declare function inspectDossier(artifactPath: string, pageId: string, prospect?: string): ArtifactInspection;
export declare function pendingGatewayAction(flow: {
    currentStep?: string;
}, state: JsonObject, roots: PathRoots): GatewayAction | null;
declare const _default: import("openclaw/plugin-sdk/tool-plugin").DefinedToolPluginEntry;
export default _default;
