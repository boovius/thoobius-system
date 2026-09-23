import { describe, expect, it, vi } from "vitest";
import { createSessionTurnDeadlinePort, scheduleImmediateControllerWake } from "./openclaw-supervision.js";

describe("OpenClaw workflow supervision adapter", () => {
  it("schedules and cancels a one-shot deadline by stable tag", async () => {
    const scheduleSessionTurn = vi.fn(async () => ({ id: "job-1" }));
    const unscheduleSessionTurnsByTag = vi.fn(async () => ({ removed: 1, failed: 0 }));
    const deadlines = createSessionTurnDeadlinePort({
      scheduler: { scheduleSessionTurn, unscheduleSessionTurnsByTag },
      sessionKey: "agent:controller:main",
      agentId: "controller",
      messageForDeadline: ({ flowId }) => `reconcile ${flowId}`,
    });
    const child = { dispatchId: "dispatch-1", runId: "run-1", childSessionKey: "agent:worker:one", attempt: 1 };
    await deadlines.schedule({ tag: "deadline-1", at: "2026-09-22T20:20:00.000Z", flowId: "flow-1", child });
    await deadlines.cancel("deadline-1");
    expect(scheduleSessionTurn).toHaveBeenCalledWith(expect.objectContaining({
      sessionKey: "agent:controller:main",
      agentId: "controller",
      at: "2026-09-22T20:20:00.000Z",
      tag: "deadline-1",
      deleteAfterRun: true,
    }));
    expect(unscheduleSessionTurnsByTag).toHaveBeenCalledWith({ sessionKey: "agent:controller:main", tag: "deadline-1" });
  });

  it("schedules a completion wake through the same stable session", async () => {
    const scheduleSessionTurn = vi.fn(async () => ({ id: "job-2" }));
    await scheduleImmediateControllerWake({
      scheduler: { scheduleSessionTurn, unscheduleSessionTurnsByTag: vi.fn() },
      sessionKey: "agent:controller:main",
      agentId: "controller",
      flowId: "flow-1",
      child: { dispatchId: "dispatch-1", runId: "run-1", childSessionKey: "agent:worker:one", attempt: 1 },
      tag: "deadline-1-completion",
      message: "resume flow-1",
      label: "Child completion",
    });
    expect(scheduleSessionTurn).toHaveBeenCalledWith(expect.objectContaining({
      delayMs: 1_000,
      tag: "deadline-1-completion",
      message: "resume flow-1",
    }));
  });
});
