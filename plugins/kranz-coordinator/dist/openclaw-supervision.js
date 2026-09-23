export function createSessionTurnDeadlinePort(options) {
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
            if (!handle)
                throw new Error(`Unable to schedule workflow deadline ${request.tag}`);
        },
        async cancel(tag) {
            const result = await options.scheduler.unscheduleSessionTurnsByTag({
                sessionKey: options.sessionKey,
                tag,
            });
            if (result.failed > 0)
                throw new Error(`Unable to cancel all workflow deadlines tagged ${tag}`);
        },
    };
}
export async function scheduleImmediateControllerWake(params) {
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
    if (!handle)
        throw new Error(`Unable to schedule controller wake for ${params.flowId}`);
}
