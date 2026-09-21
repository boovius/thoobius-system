import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
const script = readFileSync(new URL("../cron-tick.js", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
function details(value) {
    return { details: value };
}
function catalogFor(implementations) {
    return {
        search: vi.fn(async (name) => {
            const implementation = implementations[name];
            if (!implementation)
                return [];
            return [Object.assign(implementation, { callableName: name, toolName: name })];
        }),
    };
}
describe("deterministic Kranz continuation", () => {
    it("removes only its uniquely named automation after run-scope completion", async () => {
        const remove = vi.fn(async () => ({ tool: "automations", result: details({ removed: true }) }));
        const implementations = {
            kranz_flow_tick: vi.fn(async () => ({ tool: "kranz_flow_tick", result: details({ status: "run_scope_complete", runScope: { handledPageIds: ["page-1"] } }) })),
            kranz_flow_status: vi.fn(async () => ({ tool: "kranz_flow_status", result: details({
                    found: true,
                    flow: {
                        revision: 33,
                        status: "waiting",
                        currentStep: "SELECT_RECORD",
                        stateJson: { completedPageIds: ["page-1"], queueSnapshot: [{ pageId: "page-1" }], blockedRecords: [] },
                    },
                }) })),
            automations: vi.fn(async (params) => {
                if (params.action === "list")
                    return { tool: "automations", result: details({ jobs: [{ id: "job-1", name: "Kranz deterministic NTC continuation" }] }) };
                return remove();
            }),
        };
        const runner = new AsyncFunction("catalog", script);
        const result = await runner(catalogFor(implementations));
        expect(result.notify).toContain("completed the requested run scope");
        expect(result.state?.revision).toBe(33);
        expect(implementations.automations).toHaveBeenLastCalledWith({ action: "remove", jobId: "job-1" });
        expect(remove).toHaveBeenCalledOnce();
    });
    it("fails closed when the scheduled caller cannot see the owner-bound flow", async () => {
        const implementations = {
            kranz_flow_tick: vi.fn(async () => ({ tool: "kranz_flow_tick", result: details({ status: "waiting" }) })),
            kranz_flow_status: vi.fn(async () => ({ tool: "kranz_flow_status", result: details({ found: false }) })),
        };
        const runner = new AsyncFunction("catalog", script);
        await expect(runner(catalogFor(implementations))).rejects.toThrow("is not visible from the scheduled owner binding");
    });
});
