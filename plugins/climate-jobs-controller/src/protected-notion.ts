import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  NotionJobTracker,
  type TrackerEntry,
  type TrackerReceipt,
} from "@thoobius/climate-job-pipeline";

const WORKSPACE_ROOT = "/home/boovius/.openclaw/workspace";
const DEFAULT_STATE_ROOT = path.join(WORKSPACE_ROOT, ".climate-jobs-controller");
const MAX_GRANT_TTL_MS = 2 * 60 * 1000;
const ALLOWED_PROPERTIES = new Set([
  "Name", "Company", "Role", "Location", "Job URL", "JD Posted Date", "Employment Type", "Work Mode",
  "Sector", "Status", "Contract Window", "Weighted Score", "Climate Mission Alignment", "Role Shape Fit",
  "Technical Leverage", "Systems Ambiguity Fit", "Team Stage Fit", "Product Strategic Influence",
  "Practical Viability", "Overall read", "Why it looks good", "What gives me pause", "Stretch",
  "Long Beach Fit", "Search Lane",
]);

type PublicationGrant = {
  version: 1;
  actionId: string;
  planSha256: string;
  idempotencyKey: string;
  canonicalUrl: string;
  createdAt: string;
  expiresAt: string;
};

export type ProtectedPublicationReceipt = TrackerReceipt & {
  actionId: string;
  idempotencyKey: string;
  completedAt: string;
};

type TrackerFactory = (token: string) => { publish(entry: TrackerEntry): Promise<TrackerReceipt> };

function privateJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function actionPath(stateRoot: string, actionId: string, suffix: string): string {
  if (!/^[0-9a-f]{64}$/i.test(actionId)) throw new Error("Invalid climate-jobs action ID");
  return path.join(stateRoot, `${actionId}.${suffix}`);
}

function assertEntryAllowed(entry: TrackerEntry): void {
  const url = new URL(entry.canonicalUrl);
  if (url.protocol !== "https:" || url.hostname !== "jobsincarbon.com" || !url.pathname.startsWith("/jobs/")) {
    throw new Error("Protected publication accepts only Jobs in Carbon job URLs");
  }
  if (!/^[^:]+:[^:]+:[0-9a-f]{16}$/i.test(entry.idempotencyKey)) throw new Error("Invalid publication idempotency key");
  const names = Object.keys(entry.properties);
  if (!names.length || names.some((name) => !ALLOWED_PROPERTIES.has(name))) throw new Error("Publication contains a non-allowlisted tracker property");
  const jobUrl = entry.properties["Job URL"];
  if (!jobUrl || !("url" in jobUrl) || jobUrl.url !== entry.canonicalUrl) throw new Error("Publication Job URL does not match its canonical URL");
  const status = entry.properties.Status;
  if (!status || !("select" in status) || status.select.name !== "Scored") throw new Error("Publication status must be Scored");
}

function parsePlan(raw: string): TrackerEntry {
  const value = JSON.parse(raw) as TrackerEntry;
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.idempotencyKey !== "string" || typeof value.canonicalUrl !== "string" || !value.properties || typeof value.properties !== "object") {
    throw new Error("Malformed climate-jobs publication plan");
  }
  assertEntryAllowed(value);
  return value;
}

function parseGrant(raw: string): PublicationGrant {
  const value = JSON.parse(raw) as Partial<PublicationGrant>;
  if (value.version !== 1 || typeof value.actionId !== "string" || typeof value.planSha256 !== "string" || typeof value.idempotencyKey !== "string" || typeof value.canonicalUrl !== "string" || typeof value.expiresAt !== "string") {
    throw new Error("Malformed climate-jobs publication grant");
  }
  return value as PublicationGrant;
}

export function issuePublicationGrant(entry: TrackerEntry, options: { stateRoot?: string; now?: Date; ttlMs?: number } = {}) {
  assertEntryAllowed(entry);
  const stateRoot = options.stateRoot ?? DEFAULT_STATE_ROOT;
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? MAX_GRANT_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_GRANT_TTL_MS) throw new Error("Invalid climate-jobs grant lifetime");
  const actionId = randomBytes(32).toString("hex");
  const plan = `${JSON.stringify(entry, null, 2)}\n`;
  const grant: PublicationGrant = {
    version: 1,
    actionId,
    planSha256: sha256(plan),
    idempotencyKey: entry.idempotencyKey,
    canonicalUrl: entry.canonicalUrl,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
  privateJson(actionPath(stateRoot, actionId, "plan.json"), entry);
  privateJson(actionPath(stateRoot, actionId, "grant.json"), grant);
  return { actionId, expiresAt: grant.expiresAt };
}

export async function executePublicationGrant(params: {
  actionId: string;
  stateRoot?: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  trackerFactory?: TrackerFactory;
  assertCurrent?: () => void;
}): Promise<ProtectedPublicationReceipt> {
  const stateRoot = params.stateRoot ?? DEFAULT_STATE_ROOT;
  const source = actionPath(stateRoot, params.actionId, "grant.json");
  const claimed = actionPath(stateRoot, params.actionId, "running");
  if (!existsSync(source)) throw new Error("Climate-jobs publication grant is missing or already consumed");
  renameSync(source, claimed);
  try {
    const grant = parseGrant(readFileSync(claimed, "utf8"));
    if (grant.actionId !== params.actionId) throw new Error("Climate-jobs publication grant identity mismatch");
    if ((params.now ?? new Date()).getTime() > Date.parse(grant.expiresAt)) throw new Error("Climate-jobs publication grant expired");
    const planRaw = readFileSync(actionPath(stateRoot, params.actionId, "plan.json"), "utf8");
    if (sha256(planRaw) !== grant.planSha256) throw new Error("Climate-jobs publication plan changed after authorization");
    const entry = parsePlan(planRaw);
    if (entry.idempotencyKey !== grant.idempotencyKey || entry.canonicalUrl !== grant.canonicalUrl) throw new Error("Climate-jobs publication grant does not match its plan");
    const token = (params.env ?? process.env).CLIMATE_JOBS_NOTION_API_KEY;
    if (!token) throw new Error("Gateway did not inject the protected climate-jobs Notion credential sentinel");
    const tracker = (params.trackerFactory ?? ((credential) => new NotionJobTracker(credential)))(token);
    params.assertCurrent?.();
    const receipt = await tracker.publish(entry);
    if (!receipt.verified || receipt.canonicalUrl !== entry.canonicalUrl) throw new Error("Protected Notion publication failed read-back verification");
    const protectedReceipt: ProtectedPublicationReceipt = {
      ...receipt,
      actionId: grant.actionId,
      idempotencyKey: entry.idempotencyKey,
      completedAt: new Date().toISOString(),
    };
    privateJson(actionPath(stateRoot, params.actionId, "receipt.json"), protectedReceipt);
    return protectedReceipt;
  } finally {
    if (existsSync(claimed)) unlinkSync(claimed);
  }
}
