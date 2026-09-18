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
export declare function artifactPathFor(record: QueueRecord): string;
export declare function contextPathFor(record: QueueRecord): string;
export declare function receiptPathFor(record: QueueRecord): string;
export declare function outcomePathFor(record: QueueRecord, attempt: number): string;
export declare function inspectDossier(artifactPath: string, pageId: string, prospect?: string): ArtifactInspection;
declare const _default: import("openclaw/plugin-sdk/tool-plugin").DefinedToolPluginEntry;
export default _default;
