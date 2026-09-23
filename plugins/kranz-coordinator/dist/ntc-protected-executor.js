import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const WORKSPACE_ROOT = "/home/boovius/.openclaw/workspace";
const SCRIPT_BY_KIND = {
    read_page: path.join(WORKSPACE_ROOT, "scripts/ntc-page-read.mjs"),
    publish_notion: path.join(WORKSPACE_ROOT, "scripts/ntc-write-deep-research.mjs"),
    sync_monitor: path.join(WORKSPACE_ROOT, "scripts/ntc-monitor-sync.mjs"),
};
const DEFAULT_GRANT_TTL_MS = 2 * 60 * 1000;
const GRANT_ROOT = path.join(WORKSPACE_ROOT, ".ntc-protected-action-grants");
function isWithin(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
function assertPageId(value) {
    if (!/^[0-9a-f-]{32,36}$/i.test(value))
        throw new Error("Protected NTC action has an invalid page ID");
}
function assertFlowId(value) {
    if (!/^[0-9a-f-]{32,36}$/i.test(value))
        throw new Error("Protected NTC action has an invalid flow ID");
}
function assertActionMatchesPolicy(action, roots) {
    if (action.script !== SCRIPT_BY_KIND[action.kind])
        throw new Error("Protected NTC action script is not allowlisted");
    if (action.env.OPENCLAW_NOTION_PROFILE !== "ntc" || action.env.NTC_STATE_ROOT !== roots.stateRoot) {
        throw new Error("Protected NTC action environment is not allowlisted");
    }
    if (action.kind === "read_page") {
        const [pageId, outputPath, ...extra] = action.args;
        assertPageId(pageId ?? "");
        const expected = path.join(roots.stateRoot, "page-context", `${pageId}.json`);
        if (extra.length || outputPath !== expected)
            throw new Error("Protected NTC page-read arguments are not allowlisted");
        return;
    }
    if (action.kind === "publish_notion") {
        const [pageId, artifactPath, receiptPath, ...extra] = action.args;
        assertPageId(pageId ?? "");
        const expectedReceipt = path.join(roots.stateRoot, "publication-receipts", `${pageId}.json`);
        if (extra.length || !artifactPath || !isWithin(roots.artifactRoot, artifactPath) || receiptPath !== expectedReceipt) {
            throw new Error("Protected NTC publication arguments are not allowlisted");
        }
        if (!/^[0-9a-f]{64}$/i.test(action.artifactSha256 ?? ""))
            throw new Error("Protected NTC publication lacks an artifact hash");
        return;
    }
    const [flowId, stateRoot, ...extra] = action.args;
    assertFlowId(flowId ?? "");
    if (extra.length || stateRoot !== roots.stateRoot)
        throw new Error("Protected NTC monitor arguments are not allowlisted");
}
function grantPath(actionId, suffix = "json") {
    if (!/^[0-9a-f]{64}$/i.test(actionId))
        throw new Error("Invalid NTC protected action ID");
    return path.join(GRANT_ROOT, `${actionId}.${suffix}`);
}
function writePrivateJson(filePath, value) {
    mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}
export function issueNtcExecutionGrant(params) {
    assertFlowId(params.flowId);
    if (!Number.isInteger(params.revision) || params.revision < 0)
        throw new Error("Invalid NTC flow revision");
    assertActionMatchesPolicy(params.action, params.roots);
    const now = params.now ?? new Date();
    const ttlMs = params.ttlMs ?? DEFAULT_GRANT_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > DEFAULT_GRANT_TTL_MS)
        throw new Error("Invalid NTC action grant lifetime");
    const actionId = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const grant = {
        version: 1,
        actionId,
        flowId: params.flowId,
        revision: params.revision,
        kind: params.action.kind,
        args: [...params.action.args],
        stateRoot: params.roots.stateRoot,
        artifactRoot: params.roots.artifactRoot,
        ...(params.action.artifactSha256 ? { artifactSha256: params.action.artifactSha256 } : {}),
        createdAt: now.toISOString(),
        expiresAt,
    };
    writePrivateJson(grantPath(actionId), grant);
    return { actionId, command: `ntc-notion-exec ${actionId}`, expiresAt };
}
function parseGrant(value) {
    const grant = JSON.parse(value);
    if (grant.version !== 1 || typeof grant.actionId !== "string" || typeof grant.flowId !== "string" || !Number.isInteger(grant.revision)) {
        throw new Error("Malformed NTC protected action grant");
    }
    if (!Object.hasOwn(SCRIPT_BY_KIND, String(grant.kind)) || !Array.isArray(grant.args) || grant.args.some((arg) => typeof arg !== "string")) {
        throw new Error("Malformed NTC protected action grant");
    }
    if (typeof grant.stateRoot !== "string" || typeof grant.artifactRoot !== "string" || typeof grant.expiresAt !== "string") {
        throw new Error("Malformed NTC protected action grant");
    }
    return grant;
}
function defaultRunner(params) {
    const child = spawnSync(process.execPath, [params.script, ...params.args], {
        cwd: WORKSPACE_ROOT,
        env: params.env,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
    });
    return { status: child.status, ...(child.error ? { error: child.error } : {}), stderr: child.stderr };
}
function sanitizedFailure(run) {
    if (run.error)
        return run.error.name || "executor_error";
    return run.status === null ? "executor_terminated" : `executor_exit_${run.status}`;
}
export function executeNtcExecutionGrant(params) {
    const source = grantPath(params.actionId);
    const claimed = grantPath(params.actionId, "running");
    if (!existsSync(source))
        throw new Error("NTC protected action grant is missing or already consumed");
    renameSync(source, claimed);
    let grant;
    try {
        grant = parseGrant(readFileSync(claimed, "utf8"));
        if (grant.actionId !== params.actionId)
            throw new Error("NTC protected action grant identity mismatch");
        if (!isWithin(WORKSPACE_ROOT, path.resolve(grant.stateRoot)) || !isWithin(WORKSPACE_ROOT, path.resolve(grant.artifactRoot))) {
            throw new Error("NTC protected action roots are outside the workspace");
        }
        if ((params.now ?? new Date()).getTime() > Date.parse(grant.expiresAt))
            throw new Error("NTC protected action grant expired");
        const action = {
            kind: grant.kind,
            script: SCRIPT_BY_KIND[grant.kind],
            args: grant.args,
            env: { OPENCLAW_NOTION_PROFILE: "ntc", NTC_STATE_ROOT: grant.stateRoot },
            ...(grant.artifactSha256 ? { artifactSha256: grant.artifactSha256 } : {}),
        };
        assertActionMatchesPolicy(action, { stateRoot: grant.stateRoot, artifactRoot: grant.artifactRoot });
        if (grant.kind === "publish_notion") {
            const actualHash = createHash("sha256").update(readFileSync(grant.args[1], "utf8")).digest("hex");
            if (actualHash !== grant.artifactSha256)
                throw new Error("NTC publication artifact changed after authorization");
        }
        if (!process.env.NTC_NOTION_API_KEY)
            throw new Error("Gateway did not inject the protected NTC Notion credential sentinel");
        const run = (params.runner ?? defaultRunner)({
            script: SCRIPT_BY_KIND[grant.kind],
            args: grant.args,
            env: { ...process.env, OPENCLAW_NOTION_PROFILE: "ntc", NTC_STATE_ROOT: grant.stateRoot },
        });
        const receipt = {
            status: run.status === 0 ? "succeeded" : "failed",
            actionId: grant.actionId,
            flowId: grant.flowId,
            revision: grant.revision,
            kind: grant.kind,
            completedAt: new Date().toISOString(),
            exitCode: run.status ?? 1,
            ...(run.status === 0 ? {} : { error: sanitizedFailure(run) }),
        };
        writePrivateJson(grantPath(params.actionId, "result.json"), receipt);
        return receipt;
    }
    finally {
        if (existsSync(claimed))
            unlinkSync(claimed);
    }
}
