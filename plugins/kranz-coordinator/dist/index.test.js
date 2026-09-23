import { describe, expect, it } from "vitest";
import entry, { artifactPathFor, bindManagedFlows, buildControllerWakeMessage, deadlineHasExpired, inspectDossier, migrateNtcControllerState, outcomePathFor, pendingGatewayAction, prepareInitialState, resolvePathRoots, selectedPageIdsForRun } from "./index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
describe("kranz-coordinator", () => {
    it("declares the durable flow tools", () => {
        expect(getToolPluginMetadata(entry)?.tools.map((tool) => tool.name)).toEqual([
            "kranz_flow_start",
            "kranz_flow_link_task",
            "kranz_flow_checkpoint",
            "kranz_flow_set_run_scope",
            "kranz_flow_tick",
            "kranz_flow_execute_pending_action",
            "kranz_flow_sync_monitor",
            "kranz_flow_status",
        ]);
    });
    it("binds main and cron callers to the configured stable flow owner", () => {
        const ownerFlows = { owner: "agent:kranz-coordinator:main" };
        const managedFlows = {
            bindSession: ({ sessionKey }) => ({ ...ownerFlows, sessionKey }),
            fromToolContext: (context) => ({ owner: context.sessionKey, sessionKey: context.sessionKey }),
        };
        const main = bindManagedFlows(managedFlows, { sessionKey: "agent:kranz-coordinator:main" }, { ownerSessionKey: "agent:kranz-coordinator:main" });
        const cron = bindManagedFlows(managedFlows, { sessionKey: "agent:kranz-coordinator:cron:test:run:1" }, { ownerSessionKey: "agent:kranz-coordinator:main" });
        expect(main).toEqual(cron);
        expect(cron.sessionKey).toBe("agent:kranz-coordinator:main");
    });
    it("keeps caller-scoped compatibility when no stable owner is configured", () => {
        const managedFlows = {
            bindSession: ({ sessionKey }) => ({ sessionKey }),
            fromToolContext: (context) => ({ sessionKey: context.sessionKey }),
        };
        expect(bindManagedFlows(managedFlows, { sessionKey: "agent:kranz-coordinator:cron:test" })).toEqual({ sessionKey: "agent:kranz-coordinator:cron:test" });
    });
    it("rejects redirecting Kranz flows to an arbitrary owner", () => {
        const managedFlows = {
            bindSession: ({ sessionKey }) => ({ sessionKey }),
            fromToolContext: (context) => ({ sessionKey: context.sessionKey }),
        };
        expect(() => bindManagedFlows(managedFlows, { sessionKey: "agent:kranz-coordinator:main" }, { ownerSessionKey: "agent:other:main" }))
            .toThrow("must be exactly agent:kranz-coordinator:main");
    });
    it("derives a deterministic artifact path", () => {
        expect(artifactPathFor({ position: 4, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8cad", name: "Guess Inc. (GUESS Foundation)" }))
            .toBe("/home/boovius/.openclaw/workspace/.ntc-state/artifacts/3ddc9504-51fd-8122-83b4-f403ad4a8cad-guess-inc-guess-foundation.md");
    });
    it("uses flow paths before plugin paths and safe shared defaults", () => {
        expect(resolvePathRoots()).toEqual({
            stateRoot: "/home/boovius/.openclaw/workspace/.ntc-state",
            artifactRoot: "/home/boovius/.openclaw/workspace/.ntc-state/artifacts",
        });
        expect(resolvePathRoots({ stateRoot: ".plugin-state", artifactRoot: ".plugin-artifacts" }, { stateRoot: ".flow-state", artifactRoot: ".flow-artifacts" })).toEqual({
            stateRoot: "/home/boovius/.openclaw/workspace/.flow-state",
            artifactRoot: "/home/boovius/.openclaw/workspace/.flow-artifacts",
        });
    });
    it("rejects configured paths outside the shared workspace", () => {
        expect(() => resolvePathRoots({ stateRoot: "/tmp/ntc-state" })).toThrow("must remain inside");
    });
    it("validates the strict dossier handoff", () => {
        const dir = mkdtempSync(path.join(tmpdir(), "kranz-test-"));
        const artifact = path.join(dir, "packet.md");
        writeFileSync(artifact, `Prospect: Example Co\nPage ID: page-123\nArtifact path: ${artifact}\n## Deep Research\n### Charities\nhttps://example.com/source\n### Beverly Hills\nUnresolved\n### Race/Run\nNone\n### Cancer\nNone\n### Personnel\nNone\n### Other Background Context\nNone\n## Notion Replacement Contract\nPreserve unrelated content.\nPACKET_COMPLETE\n`);
        expect(inspectDossier(artifact, "page-123", "Example Co")).toMatchObject({ ok: true, errors: [] });
    });
    it("rejects a packet without citations or the replacement contract", () => {
        const dir = mkdtempSync(path.join(tmpdir(), "kranz-test-"));
        const artifact = path.join(dir, "packet.md");
        writeFileSync(artifact, `Prospect: Example Co\nPage ID: page-123\nArtifact path: ${artifact}\n## Deep Research\n### Charities\n### Beverly Hills\n### Race/Run\n### Cancer\n### Personnel\n### Other Background Context\nUnresolved\nPACKET_COMPLETE\n`);
        expect(inspectDossier(artifact, "page-123", "Example Co").errors).toEqual(expect.arrayContaining(["citations_missing", "replacement_contract_missing"]));
    });
    it("derives a deterministic child outcome path", () => {
        expect(outcomePathFor({ position: 4, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8cad", name: "Guess" }, 2))
            .toContain("3ddc9504-51fd-8122-83b4-f403ad4a8cad-attempt-2.json");
    });
    it("derives a page-read action only from the current flow record", () => {
        const stateRoot = mkdtempSync(path.join(tmpdir(), "kranz-state-"));
        const roots = { stateRoot, artifactRoot: path.join(stateRoot, "artifacts") };
        const state = { currentIndex: 0, queueSnapshot: [{ position: 1, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8cad", name: "Example Co" }] };
        expect(pendingGatewayAction({ currentStep: "SELECT_RECORD" }, state, roots)).toMatchObject({
            kind: "read_page",
            args: ["3ddc9504-51fd-8122-83b4-f403ad4a8cad", path.join(stateRoot, "page-context", "3ddc9504-51fd-8122-83b4-f403ad4a8cad.json")],
        });
    });
    it("selects the next requested available records in queue order", () => {
        const queueSnapshot = [
            { position: 1, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8ca1", name: "Done" },
            { position: 2, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8ca2", name: "Next A" },
            { position: 3, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8ca3", name: "Blocked" },
            { position: 4, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8ca4", name: "Next B" },
            { position: 5, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8ca5", name: "Next C" },
        ];
        const state = { queueSnapshot, currentIndex: 1, completedPageIds: [queueSnapshot[0].pageId], blockedRecords: [{ pageId: queueSnapshot[2].pageId }] };
        expect(selectedPageIdsForRun(state, 2)).toEqual([queueSnapshot[1].pageId, queueSnapshot[3].pageId]);
        expect(selectedPageIdsForRun(state)).toEqual([queueSnapshot[1].pageId, queueSnapshot[3].pageId, queueSnapshot[4].pageId]);
        expect(() => selectedPageIdsForRun(state, 0)).toThrow("positive integer");
    });
    it.each(["manual", "scheduled"])("freezes the same bounded run scope for a %s start", (triggerSource) => {
        const queueSnapshot = [
            { position: 1, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8ca1", name: "Done" },
            { position: 2, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8ca2", name: "Next A" },
            { position: 3, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8ca3", name: "Next B" },
            { position: 4, pageId: "3ddc9504-51fd-8122-83b4-f403ad4a8ca4", name: "Later" },
        ];
        const prepared = prepareInitialState({ queueSnapshot, currentIndex: 1, completedPageIds: [queueSnapshot[0].pageId] }, {}, 2, triggerSource);
        expect(prepared.runScope).toMatchObject({
            mode: "limited",
            requestedEntries: 2,
            selectedPageIds: [queueSnapshot[1].pageId, queueSnapshot[2].pageId],
        });
        expect(prepared.startRequest).toMatchObject({ triggerSource, itemLimit: 2 });
        expect(prepared.currentPageId).toBe(queueSnapshot[1].pageId);
    });
    it("builds bounded completion and deadline wake instructions", () => {
        const completion = buildControllerWakeMessage({ flowId: "flow-1", cause: "child_completion", runId: "run-1" });
        const deadline = buildControllerWakeMessage({ flowId: "flow-1", cause: "deadline", runId: "run-1" });
        expect(completion).toContain("TaskFlow flow-1");
        expect(completion).toContain('"cause":"child_completion"');
        expect(completion).toContain("Child run: run-1");
        expect(completion).toContain("frozen run scope");
        expect(deadline).toContain("deadline");
    });
    it("treats only a reached persisted deadline as expired", () => {
        const now = Date.parse("2026-09-22T20:20:00.000Z");
        expect(deadlineHasExpired("2026-09-22T20:20:00.000Z", now)).toBe(true);
        expect(deadlineHasExpired("2026-09-22T20:21:00.000Z", now)).toBe(false);
        expect(deadlineHasExpired(undefined, now)).toBe(false);
    });
    it("adds adapter schema identity without discarding existing flow state", () => {
        const original = { currentPageId: "page-1", completedPageIds: ["page-0"], custom: { keep: true } };
        const migrated = migrateNtcControllerState(original);
        expect(migrated.changed).toBe(true);
        expect(migrated.state).toEqual({
            ...original,
            adapterId: "ntc-deep-research",
            adapterVersion: 1,
        });
        expect(migrateNtcControllerState(migrated.state)).toEqual({ state: migrated.state, changed: false });
    });
    it("derives a publication action only for a valid dossier without a verified receipt", () => {
        const stateRoot = mkdtempSync(path.join(tmpdir(), "kranz-state-"));
        const roots = { stateRoot, artifactRoot: path.join(stateRoot, "artifacts") };
        const pageId = "3ddc9504-51fd-8122-83b4-f403ad4a8cad";
        const record = { position: 1, pageId, name: "Example Co" };
        const artifact = artifactPathFor(record, roots);
        const state = { currentIndex: 0, queueSnapshot: [record] };
        mkdirSync(path.dirname(artifact), { recursive: true });
        writeFileSync(artifact, `Prospect: Example Co\nPage ID: ${pageId}\nArtifact path: ${artifact}\n## Deep Research\n### Charities\nhttps://example.com/source\n### Beverly Hills\nUnresolved\n### Race/Run\nNone\n### Cancer\nNone\n### Personnel\nNone\n### Other Background Context\nNone\n## Notion Replacement Contract\nPreserve unrelated content.\nPACKET_COMPLETE\n`, { flag: "w" });
        expect(pendingGatewayAction({ currentStep: "WRITE_NOTION" }, state, roots)).toMatchObject({
            kind: "publish_notion",
            args: [pageId, artifact, path.join(stateRoot, "publication-receipts", `${pageId}.json`)],
        });
    });
});
