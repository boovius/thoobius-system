import type { ChildIdentity, DeadlinePort, DeadlineRequest } from "@thoobius/workflow-controller-core";

type SessionTurnCommon = {
  sessionKey: string;
  message: string;
  agentId?: string;
  deliveryMode?: "none" | "announce";
  name?: string;
  tag?: string;
  deleteAfterRun?: boolean;
};

type SessionTurnSchedule =
  | (SessionTurnCommon & { at: string; delayMs?: never })
  | (SessionTurnCommon & { delayMs: number; at?: never });

export type SessionTurnScheduler = {
  scheduleSessionTurn(params: SessionTurnSchedule): Promise<{ id: string } | undefined>;
  unscheduleSessionTurnsByTag(params: {
    sessionKey: string;
    tag: string;
  }): Promise<{ removed: number; failed: number }>;
};

export type SessionTurnDeadlinePortOptions = {
  scheduler: SessionTurnScheduler;
  sessionKey: string;
  agentId: string;
  messageForDeadline: (request: DeadlineRequest) => string;
};

export function createSessionTurnDeadlinePort(options: SessionTurnDeadlinePortOptions): DeadlinePort {
  return {
    async schedule(request) {
      const handle = await options.scheduler.scheduleSessionTurn({
        sessionKey: options.sessionKey,
        agentId: options.agentId,
        at: request.at,
        deleteAfterRun: true,
        deliveryMode: "none",
        name: `Workflow deadline — ${request.flowId}`,
        tag: request.tag,
        message: options.messageForDeadline(request),
      });
      if (!handle) throw new Error(`Unable to schedule workflow deadline ${request.tag}`);
    },
    async cancel(tag) {
      const result = await options.scheduler.unscheduleSessionTurnsByTag({
        sessionKey: options.sessionKey,
        tag,
      });
      if (result.failed > 0) throw new Error(`Unable to cancel all workflow deadlines tagged ${tag}`);
    },
  };
}

export async function scheduleImmediateControllerWake(params: {
  scheduler: SessionTurnScheduler;
  sessionKey: string;
  agentId: string;
  flowId: string;
  child: ChildIdentity;
  tag: string;
  message: string;
  label: string;
}): Promise<void> {
  const handle = await params.scheduler.scheduleSessionTurn({
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    delayMs: 1_000,
    deleteAfterRun: true,
    deliveryMode: "none",
    name: params.label,
    tag: params.tag,
    message: params.message,
  });
  if (!handle) throw new Error(`Unable to schedule controller wake for ${params.flowId}`);
}
