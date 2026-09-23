export type ArtifactFingerprint = {
    algorithm: "sha256";
    hex: string;
    bytes: number;
};
export type ControllerRecordRef = {
    id: string;
};
export type FrozenRunScope = {
    mode: "limited" | "all_remaining";
    requestedItems: number | null;
    selectedRecordIds: string[];
    handledRecordIds: string[];
    remainingRecordIds: string[];
    status: "active" | "complete";
    startedAt: string;
    completedAt?: string;
};
export type ChildIdentity = {
    dispatchId: string;
    runId: string;
    childSessionKey: string;
    attempt: number;
};
export type ChildCompletionEvent = {
    runId: string;
    childSessionKey: string;
};
export type ControllerState<RecordRef> = {
    adapterId: string;
    adapterVersion: number;
    selectedRecord: RecordRef | null;
    phase: "selecting" | "dispatching" | "waiting" | "validating" | "committing" | "verifying" | "blocked" | "complete";
    attempt: number;
    dispatchId?: string;
    runId?: string;
    childSessionKey?: string;
    artifactRef?: string;
    artifactHash?: string;
    deadlineAt?: string;
    commitPlanHash?: string;
    receiptRef?: string;
    lastError?: StructuredFailure;
};
export type StructuredFailure = {
    code: string;
    message: string;
    retryable: boolean;
};
export interface RecordSource<RecordRef> {
    selectNext(context: SelectionContext): Promise<RecordRef | null>;
}
export interface DispatchPlanner<RecordRef, DispatchRequest> {
    plan(record: RecordRef, attempt: number): Promise<DispatchRequest>;
}
export interface ArtifactValidator<RecordRef, Artifact> {
    validate(record: RecordRef, artifact: Artifact): Promise<ValidationResult>;
}
export interface CommitPlanner<RecordRef, Artifact, CommitPlan> {
    plan(record: RecordRef, artifact: Artifact): Promise<CommitPlan>;
}
export interface CommitVerifier<RecordRef, Receipt> {
    verify(record: RecordRef, receipt: Receipt): Promise<VerificationResult>;
}
export interface ProgressProjector<FlowState> {
    project(state: FlowState): Promise<void>;
}
export interface TaskFlowPort {
    get(flowId: string): unknown;
}
export interface ChildTaskPort {
    dispatch(request: unknown): Promise<ChildIdentity>;
}
export interface DeadlinePort {
    schedule(request: DeadlineRequest): Promise<void>;
    cancel(tag: string): Promise<void>;
}
export interface ArtifactStorePort {
    read(ref: string): Promise<Uint8Array>;
}
export interface ProtectedExecutorPort {
    execute(plan: unknown): Promise<unknown>;
}
export interface ClockPort {
    now(): Date;
}
export interface ControllerEventPort {
    emit(event: unknown): Promise<void>;
}
export interface ControllerPorts {
    flows: TaskFlowPort;
    tasks: ChildTaskPort;
    deadlines: DeadlinePort;
    artifacts: ArtifactStorePort;
    protectedExecutor: ProtectedExecutorPort;
    clock: ClockPort;
    events: ControllerEventPort;
}
export type SelectionContext = {
    flowId: string;
    revision: number;
};
export type ValidationResult = {
    ok: boolean;
    errors: string[];
};
export type VerificationResult = {
    ok: boolean;
    errors: string[];
};
export type DeadlineRequest = {
    tag: string;
    at: string;
    flowId: string;
    child: ChildIdentity;
};
export declare function fingerprintArtifact(content: string | Uint8Array): ArtifactFingerprint;
export declare function normalizeItemLimit(value: number | undefined): number | undefined;
export declare function freezeRunScope(params: {
    records: readonly ControllerRecordRef[];
    handledRecordIds?: ReadonlySet<string>;
    itemLimit?: number;
    now?: Date;
}): FrozenRunScope;
export declare function createDispatchId(params: {
    namespace: string;
    flowId: string;
    recordId: string;
    attempt: number;
}): string;
export declare function completionMatchesChild(child: Pick<ChildIdentity, "runId" | "childSessionKey">, event: ChildCompletionEvent): boolean;
export declare function createDeadlineTag(params: {
    flowId: string;
    recordId: string;
    attempt: number;
}): string;
export declare function deadlineAt(startedAt: Date, timeoutMs: number): string;
