import crypto from "node:crypto";

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
  phase:
    | "selecting"
    | "dispatching"
    | "waiting"
    | "validating"
    | "committing"
    | "verifying"
    | "blocked"
    | "complete";
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

export function fingerprintArtifact(content: string | Uint8Array): ArtifactFingerprint {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
  return {
    algorithm: "sha256",
    hex: crypto.createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  };
}

export function normalizeItemLimit(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("itemLimit must be a positive integer");
  }
  return value;
}

export function freezeRunScope(params: {
  records: readonly ControllerRecordRef[];
  handledRecordIds?: ReadonlySet<string>;
  itemLimit?: number;
  now?: Date;
}): FrozenRunScope {
  const itemLimit = normalizeItemLimit(params.itemLimit);
  const handled = params.handledRecordIds ?? new Set<string>();
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

export function createDispatchId(params: {
  namespace: string;
  flowId: string;
  recordId: string;
  attempt: number;
}): string {
  if (!params.namespace.trim()) throw new Error("dispatch namespace is required");
  if (!params.flowId.trim()) throw new Error("flowId is required");
  if (!params.recordId.trim()) throw new Error("recordId is required");
  if (!Number.isSafeInteger(params.attempt) || params.attempt < 1) {
    throw new Error("attempt must be a positive integer");
  }
  return `${params.namespace}:${params.flowId}:${params.recordId}:attempt:${params.attempt}`;
}

export function completionMatchesChild(
  child: Pick<ChildIdentity, "runId" | "childSessionKey">,
  event: ChildCompletionEvent,
): boolean {
  return child.runId === event.runId && child.childSessionKey === event.childSessionKey;
}

export function createDeadlineTag(params: {
  flowId: string;
  recordId: string;
  attempt: number;
}): string {
  const digest = fingerprintArtifact(`${params.flowId}\n${params.recordId}\n${params.attempt}`).hex.slice(0, 20);
  return `workflow-deadline-${digest}`;
}

export function deadlineAt(startedAt: Date, timeoutMs: number): string {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("timeoutMs must be a positive integer");
  }
  return new Date(startedAt.getTime() + timeoutMs).toISOString();
}
