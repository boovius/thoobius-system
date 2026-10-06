import { createHash } from "node:crypto";

export const CLIMATE_JOB_SOURCE = "jobs-in-carbon" as const;

export type EmploymentType =
  | "Full-time"
  | "Contract"
  | "Contract-to-hire"
  | "Fractional / Consulting"
  | "Unknown";

export type WorkMode = "Hybrid" | "In-person" | "Remote" | null;

export type CanonicalJob = {
  source: string;
  sourceJobId: string;
  canonicalUrl: string;
  company: string;
  role: string;
  location: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  postedDate: string | null;
  description: string;
  retrievedAt: string;
  contentHash: string;
};

export type AmelieAssessment = {
  assessmentVersion: 1;
  weightedScore: number;
  climateMissionAlignment: number;
  roleShapeFit: number;
  technicalLeverage: number;
  systemsAmbiguityFit: number;
  teamStageFit: number;
  productStrategicInfluence: number;
  practicalViability: number;
  overallRead: string;
  whyItLooksGood: string;
  whatGivesMePause: string;
  stretch: boolean;
  longBeachFit: "LBC" | "LA Core / Nearby" | "Remote" | "Not Local" | "Unknown";
  searchLane: "Long Beach Proximity" | "Pasadena Hybrid" | "Remote Contract" | "Climate Priority" | "Overflow / Later";
};

export type TrackerProperty =
  | { title: Array<{ text: { content: string } }> }
  | { rich_text: Array<{ text: { content: string } }> }
  | { select: { name: string } }
  | { number: number }
  | { checkbox: boolean }
  | { url: string }
  | { date: { start: string } };

export type TrackerEntry = {
  canonicalUrl: string;
  idempotencyKey: string;
  properties: Record<string, TrackerProperty>;
};

export function contentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function idempotencyKeyFor(job: Pick<CanonicalJob, "source" | "sourceJobId" | "canonicalUrl">): string {
  return `${job.source}:${job.sourceJobId}:${contentHash(job.canonicalUrl).slice(0, 16)}`;
}

export function assertCanonicalJob(value: unknown): asserts value is CanonicalJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Canonical job must be an object");
  const job = value as Partial<CanonicalJob>;
  for (const field of ["source", "sourceJobId", "canonicalUrl", "company", "role", "description", "retrievedAt", "contentHash"] as const) {
    if (typeof job[field] !== "string" || !job[field]!.trim()) throw new Error(`Canonical job ${field} is required`);
  }
  const canonicalUrl = job.canonicalUrl as string;
  const retrievedAt = job.retrievedAt as string;
  const hash = job.contentHash as string;
  const url = new URL(canonicalUrl);
  if (url.protocol !== "https:") throw new Error("Canonical job URL must use HTTPS");
  if (!Number.isFinite(Date.parse(retrievedAt))) throw new Error("Canonical job retrievedAt is invalid");
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error("Canonical job contentHash is invalid");
  if (job.postedDate !== null && (typeof job.postedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(job.postedDate))) {
    throw new Error("Canonical job postedDate is invalid");
  }
  if (!["Full-time", "Contract", "Contract-to-hire", "Fractional / Consulting", "Unknown"].includes(String(job.employmentType))) {
    throw new Error("Canonical job employmentType is invalid");
  }
  if (job.workMode !== null && !["Hybrid", "In-person", "Remote"].includes(String(job.workMode))) {
    throw new Error("Canonical job workMode is invalid");
  }
}
