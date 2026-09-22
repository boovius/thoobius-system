import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
const script = readFileSync(new URL("../cron-tick.js", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
function details(value) {
    return { details: value };
}
const PARAM_NAMES = [
    "kranz_flow_tick",
    "kranz_flow_execute_pending_action",
    "kranz_flow_status",
    "kranz_flow_sync_monitor",
    "openclaw__gateway_exec",
    "automations",
];
function runScript(implementations) {
    const runner = new AsyncFunction(...PARAM_NAMES, script);
    const args = PARAM_NAMES.map((name) => implementations[name] ?? vi.fn(async () => { throw new Error(`unexpected call: ${name}`); }));
    return runner(...args);
}
describe("deterministic Kranz continuation", () => {
    it("calls Kranz tools as direct bare globals, not through a catalog lookup", async () => {
        const remove = vi.fn(async () => details({ removed: true }));
        const automations = vi.fn(async (params) => {
            if (params.action === "list")
                return details({ jobs: [{ id: "job-1", name: "Kranz deterministic NTC continuation" }] });
            return remove();
        });
        const result = (await runScript({
            kranz_flow_tick: vi.fn(async () => details({ status: "run_scope_complete", runScope: { handledPageIds: ["page-1"] } })),
            kranz_flow_status: vi.fn(async () => details({
                found: true,
                flow: {
                    revision: 33,
                    status: "waiting",
                    currentStep: "SELECT_RECORD",
                    stateJson: { completedPageIds: ["page-1"], queueSnapshot: [{ pageId: "page-1" }], blockedRecords: [] },
                },
            })),
            automations,
        }));
        expect(result.notify).toContain("completed the requested run scope");
        expect(result.state?.revision).toBe(33);
        expect(automations).toHaveBeenLastCalledWith({ action: "remove", jobId: "job-1" });
        expect(remove).toHaveBeenCalledOnce();
    });
    it("fails closed when the scheduled caller cannot see the owner-bound flow", async () => {
        await expect(runScript({
            kranz_flow_tick: vi.fn(async () => details({ status: "waiting" })),
            kranz_flow_status: vi.fn(async () => details({ found: false })),
        })).rejects.toThrow("is not visible from the scheduled owner binding");
    });
    it("runs the protected Gateway action through the direct exec global", async () => {
        const exec = vi.fn(async (_args) => details({ status: "action_complete" }));
        await runScript({
            kranz_flow_tick: vi
                .fn()
                .mockResolvedValueOnce(details({ status: "action_required", revision: 5 }))
                .mockResolvedValueOnce(details({ status: "waiting", revision: 5 })),
            kranz_flow_execute_pending_action: vi
                .fn()
                .mockResolvedValueOnce(details({ status: "action_authorized", action: { kind: "read_page", script: "/home/boovius/.openclaw/workspace/scripts/ntc-page-read.mjs", args: [] } }))
                .mockResolvedValueOnce(details({ status: "action_complete" })),
            openclaw__gateway_exec: exec,
            kranz_flow_status: vi.fn(async () => details({ found: true, flow: { revision: 5, status: "waiting", stateJson: {} } })),
        });
        expect(exec).toHaveBeenCalledOnce();
        expect(exec.mock.calls[0][0]).toMatchObject({ workdir: "/home/boovius/.openclaw/workspace" });
    });
});
