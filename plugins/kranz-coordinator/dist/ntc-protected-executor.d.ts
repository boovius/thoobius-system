declare const SCRIPT_BY_KIND: {
    readonly read_page: string;
    readonly publish_notion: string;
    readonly sync_monitor: string;
};
export type NtcProtectedActionKind = keyof typeof SCRIPT_BY_KIND;
export type NtcProtectedAction = {
    kind: NtcProtectedActionKind;
    script: string;
    args: string[];
    env: Record<string, string>;
    artifactSha256?: string;
};
export type NtcExecutorReceipt = {
    status: "succeeded" | "failed";
    actionId: string;
    flowId: string;
    revision: number;
    kind: NtcProtectedActionKind;
    completedAt: string;
    exitCode: number;
    error?: string;
};
type ActionRoots = {
    stateRoot: string;
    artifactRoot: string;
};
type ActionRunner = (params: {
    script: string;
    args: string[];
    env: NodeJS.ProcessEnv;
}) => {
    status: number | null;
    error?: Error;
    stderr?: string;
};
export declare function issueNtcExecutionGrant(params: {
    flowId: string;
    revision: number;
    action: NtcProtectedAction;
    roots: ActionRoots;
    now?: Date;
    ttlMs?: number;
}): {
    actionId: string;
    command: string;
    expiresAt: string;
};
export declare function executeNtcExecutionGrant(params: {
    actionId: string;
    now?: Date;
    runner?: ActionRunner;
}): NtcExecutorReceipt;
export {};
