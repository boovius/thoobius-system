import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { executeNtcExecutionGrant, issueNtcExecutionGrant } from "./ntc-protected-executor.js";
const originalCredential = process.env.NTC_NOTION_API_KEY;
const testRoots = [];
const grantIds = [];
afterEach(() => {
    if (originalCredential === undefined)
        delete process.env.NTC_NOTION_API_KEY;
    else
        process.env.NTC_NOTION_API_KEY = originalCredential;
    for (const root of testRoots.splice(0))
        rmSync(root, { recursive: true, force: true });
    for (const actionId of grantIds.splice(0)) {
        const grantRoot = "/home/boovius/.openclaw/workspace/.ntc-protected-action-grants";
        for (const suffix of ["json", "running", "result.json"])
            rmSync(path.join(grantRoot, `${actionId}.${suffix}`), { force: true });
    }
});
function fixture() {
    const tempParent = "/home/boovius/.openclaw/workspace/.ntc-executor-tests";
    mkdirSync(tempParent, { recursive: true });
    const stateRoot = mkdtempSync(path.join(tempParent, "case-"));
    testRoots.push(stateRoot);
    const artifactRoot = path.join(stateRoot, "artifacts");
    const pageId = "3ddc9504-51fd-8122-83b4-f403ad4a8cad";
    mkdirSync(artifactRoot, { recursive: true });
    const artifactPath = path.join(artifactRoot, "example.md");
    const artifact = `Page ID: ${pageId}\nPACKET_COMPLETE\n`;
    writeFileSync(artifactPath, artifact);
    const action = {
        kind: "publish_notion",
        script: "/home/boovius/.openclaw/workspace/scripts/ntc-write-deep-research.mjs",
        args: [pageId, artifactPath, path.join(stateRoot, "publication-receipts", `${pageId}.json`)],
        env: { OPENCLAW_NOTION_PROFILE: "ntc", NTC_STATE_ROOT: stateRoot },
        artifactSha256: "99340a89f43f6cf46a54c60aab69fe31b8119b7eb18dbba42d08552f750f3b0d",
    };
    return { stateRoot, artifactRoot, artifactPath, action };
}
describe("NTC protected executor", () => {
    it("issues a short-lived opaque grant and consumes it once", () => {
        const f = fixture();
        const hash = createHash("sha256").update(readFileSync(f.artifactPath, "utf8")).digest("hex");
        f.action.artifactSha256 = hash;
        const issued = issueNtcExecutionGrant({
            flowId: "84e4b348-57e5-4729-b171-e6f98a891dc9",
            revision: 45,
            action: f.action,
            roots: f,
            now: new Date("2026-09-23T16:00:00.000Z"),
        });
        grantIds.push(issued.actionId);
        expect(issued.command).toBe(`ntc-notion-exec ${issued.actionId}`);
        process.env.NTC_NOTION_API_KEY = "opaque-sentinel";
        const receipt = executeNtcExecutionGrant({
            actionId: issued.actionId,
            now: new Date("2026-09-23T16:01:00.000Z"),
            runner: ({ env }) => ({ status: env.NTC_NOTION_API_KEY === "opaque-sentinel" ? 0 : 1 }),
        });
        grantIds.push(issued.actionId);
        expect(receipt).toMatchObject({ status: "succeeded", revision: 45, kind: "publish_notion" });
        expect(() => executeNtcExecutionGrant({ actionId: issued.actionId })).toThrow("already consumed");
    });
    it("rejects expired grants before executing", () => {
        const f = fixture();
        f.action.kind = "read_page";
        f.action.script = "/home/boovius/.openclaw/workspace/scripts/ntc-page-read.mjs";
        f.action.args = [f.action.args[0], path.join(f.stateRoot, "page-context", `${f.action.args[0]}.json`)];
        delete f.action.artifactSha256;
        const issued = issueNtcExecutionGrant({
            flowId: "84e4b348-57e5-4729-b171-e6f98a891dc9",
            revision: 45,
            action: f.action,
            roots: f,
            now: new Date("2026-09-23T16:00:00.000Z"),
            ttlMs: 1_000,
        });
        process.env.NTC_NOTION_API_KEY = "opaque-sentinel";
        expect(() => executeNtcExecutionGrant({
            actionId: issued.actionId,
            now: new Date("2026-09-23T16:00:02.000Z"),
            runner: () => ({ status: 0 }),
        })).toThrow("expired");
    });
    it("rejects arbitrary scripts and paths before issuing a grant", () => {
        const f = fixture();
        expect(() => issueNtcExecutionGrant({
            flowId: "84e4b348-57e5-4729-b171-e6f98a891dc9",
            revision: 45,
            action: { ...f.action, script: "/bin/sh" },
            roots: f,
        })).toThrow("script is not allowlisted");
        expect(() => issueNtcExecutionGrant({
            flowId: "84e4b348-57e5-4729-b171-e6f98a891dc9",
            revision: 45,
            action: { ...f.action, args: [f.action.args[0], "/tmp/other.md", f.action.args[2]] },
            roots: f,
        })).toThrow("arguments are not allowlisted");
    });
    it("fails closed without Gateway admission or when the artifact changes", () => {
        const f = fixture();
        f.action.artifactSha256 = createHash("sha256").update(readFileSync(f.artifactPath, "utf8")).digest("hex");
        const first = issueNtcExecutionGrant({
            flowId: "84e4b348-57e5-4729-b171-e6f98a891dc9",
            revision: 45,
            action: f.action,
            roots: f,
        });
        grantIds.push(first.actionId);
        delete process.env.NTC_NOTION_API_KEY;
        expect(() => executeNtcExecutionGrant({ actionId: first.actionId, runner: () => ({ status: 0 }) }))
            .toThrow("Gateway did not inject");
        const second = issueNtcExecutionGrant({
            flowId: "84e4b348-57e5-4729-b171-e6f98a891dc9",
            revision: 45,
            action: f.action,
            roots: f,
        });
        grantIds.push(second.actionId);
        process.env.NTC_NOTION_API_KEY = "opaque-sentinel";
        writeFileSync(f.artifactPath, "changed after authorization");
        expect(() => executeNtcExecutionGrant({ actionId: second.actionId, runner: () => ({ status: 0 }) }))
            .toThrow("artifact changed");
    });
});
