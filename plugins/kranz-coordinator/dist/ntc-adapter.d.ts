export type NtcQueueRecord = {
    position: number;
    pageId: string;
    name: string;
    entityType?: string | null;
    url?: string;
};
export type NtcPathRoots = {
    stateRoot: string;
    artifactRoot: string;
};
export type NtcArtifactInspection = {
    ok: boolean;
    path: string;
    sha256?: string;
    errors: string[];
};
export declare function artifactPathFor(record: NtcQueueRecord, roots: NtcPathRoots): string;
export declare function contextPathFor(record: NtcQueueRecord, roots: NtcPathRoots): string;
export declare function receiptPathFor(record: NtcQueueRecord, roots: NtcPathRoots): string;
export declare function outcomePathFor(record: NtcQueueRecord, attempt: number, roots: NtcPathRoots): string;
export declare function inspectDossier(artifactPath: string, pageId: string, prospect?: string): NtcArtifactInspection;
