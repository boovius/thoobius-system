import { describe, expect, it } from "vitest";
import { completionMatchesChild, createDeadlineTag, createDispatchId, deadlineAt, fingerprintArtifact, freezeRunScope, } from "./index.js";
describe("workflow-controller-core", () => {
    it("fingerprints artifact bytes deterministically", () => {
        expect(fingerprintArtifact("hello")).toEqual({
            algorithm: "sha256",
            hex: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
            bytes: 5,
        });
    });
    it("freezes exactly the next eligible records", () => {
        const scope = freezeRunScope({
            records: [{ id: "done" }, { id: "next-a" }, { id: "blocked" }, { id: "next-b" }],
            handledRecordIds: new Set(["done", "blocked"]),
            itemLimit: 2,
            now: new Date("2026-09-22T20:00:00.000Z"),
        });
        expect(scope).toMatchObject({
            mode: "limited",
            requestedItems: 2,
            selectedRecordIds: ["next-a", "next-b"],
            remainingRecordIds: ["next-a", "next-b"],
            status: "active",
        });
    });
    it("rejects invalid item limits", () => {
        expect(() => freezeRunScope({ records: [], itemLimit: 0 })).toThrow("positive integer");
    });
    it("creates a stable logical dispatch identity", () => {
        const params = { namespace: "ntc", flowId: "flow-1", recordId: "page-1", attempt: 2 };
        expect(createDispatchId(params)).toBe("ntc:flow-1:page-1:attempt:2");
        expect(createDispatchId(params)).toBe(createDispatchId(params));
    });
    it("requires both child identifiers for completion reconciliation", () => {
        const child = { runId: "run-1", childSessionKey: "agent:worker:one" };
        expect(completionMatchesChild(child, child)).toBe(true);
        expect(completionMatchesChild(child, { ...child, runId: "run-2" })).toBe(false);
        expect(completionMatchesChild(child, { ...child, childSessionKey: "agent:worker:two" })).toBe(false);
    });
    it("creates stable deadline identity and time", () => {
        expect(createDeadlineTag({ flowId: "flow-1", recordId: "page-1", attempt: 1 }))
            .toBe(createDeadlineTag({ flowId: "flow-1", recordId: "page-1", attempt: 1 }));
        expect(deadlineAt(new Date("2026-09-22T20:00:00.000Z"), 20 * 60 * 1000))
            .toBe("2026-09-22T20:20:00.000Z");
    });
});
