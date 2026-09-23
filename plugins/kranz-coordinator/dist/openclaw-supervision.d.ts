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
type SessionTurnSchedule = (SessionTurnCommon & {
    at: string;
    delayMs?: never;
}) | (SessionTurnCommon & {
    delayMs: number;
    at?: never;
});
export type SessionTurnScheduler = {
    scheduleSessionTurn(params: SessionTurnSchedule): Promise<{
        id: string;
    } | undefined>;
    unscheduleSessionTurnsByTag(params: {
        sessionKey: string;
        tag: string;
    }): Promise<{
        removed: number;
        failed: number;
    }>;
};
export type SessionTurnDeadlinePortOptions = {
    scheduler: SessionTurnScheduler;
    sessionKey: string;
    agentId: string;
    messageForDeadline: (request: DeadlineRequest) => string;
};
export declare function createSessionTurnDeadlinePort(options: SessionTurnDeadlinePortOptions): DeadlinePort;
export declare function scheduleImmediateControllerWake(params: {
    scheduler: SessionTurnScheduler;
    sessionKey: string;
    agentId: string;
    flowId: string;
    child: ChildIdentity;
    tag: string;
    message: string;
    label: string;
}): Promise<void>;
export {};
