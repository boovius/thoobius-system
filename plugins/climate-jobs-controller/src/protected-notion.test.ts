import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mapToJobApplicationTracker, type AmelieAssessment, type CanonicalJob } from "@thoobius/climate-job-pipeline";
import { executePublicationGrant, issuePublicationGrant } from "./protected-notion.js";

const jobFixture: CanonicalJob = {
  source: "jobs-in-carbon",
  sourceJobId: "f42da2cfa6",
  canonicalUrl: "https://jobsincarbon.com/jobs/product-engineer-f42da2cfa6",
  company: "Patch",
  role: "Product Engineer",
  location: "Remote",
  employmentType: "Full-time",
  workMode: "Remote",
  postedDate: "2026-10-05",
  description: "Build climate software.",
  retrievedAt: "2026-10-05T18:00:00.000Z",
  contentHash: "a".repeat(64),
};

const assessmentFixture: AmelieAssessment = {
  assessmentVersion: 1,
  weightedScore: 88,
  climateMissionAlignment: 5,
  roleShapeFit: 4,
  technicalLeverage: 5,
  systemsAmbiguityFit: 5,
  teamStageFit: 4,
  productStrategicInfluence: 4,
  practicalViability: 4,
  overallRead: "Compelling.",
  whyItLooksGood: "Strong overlap.",
  whatGivesMePause: "Confirm scope.",
  stretch: false,
  longBeachFit: "Remote",
  searchLane: "Climate Priority",
};

describe("protected Notion publication", () => {
  it("executes a hashed plan once and returns only a verified receipt", async () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), "climate-jobs-grant-"));
    const entry = mapToJobApplicationTracker(jobFixture, assessmentFixture);
    const grant = issuePublicationGrant(entry, { stateRoot, now: new Date("2026-10-05T20:00:00Z") });
    const publish = vi.fn(async () => ({ pageId: "page-1", canonicalUrl: entry.canonicalUrl, verified: true }));
    const assertCurrent = vi.fn();

    const receipt = await executePublicationGrant({
      actionId: grant.actionId,
      stateRoot,
      now: new Date("2026-10-05T20:01:00Z"),
      env: { CLIMATE_JOBS_NOTION_API_KEY: "sentinel" },
      trackerFactory: () => ({ publish }),
      assertCurrent,
    });

    expect(receipt).toMatchObject({ pageId: "page-1", verified: true, idempotencyKey: entry.idempotencyKey });
    expect(publish).toHaveBeenCalledWith(entry);
    expect(assertCurrent).toHaveBeenCalledOnce();
    await expect(executePublicationGrant({ actionId: grant.actionId, stateRoot, env: { CLIMATE_JOBS_NOTION_API_KEY: "sentinel" } })).rejects.toThrow("already consumed");
  });

  it("rejects plan tampering before any Notion call", async () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), "climate-jobs-grant-"));
    const entry = mapToJobApplicationTracker(jobFixture, assessmentFixture);
    const grant = issuePublicationGrant(entry, { stateRoot });
    const planPath = path.join(stateRoot, `${grant.actionId}.plan.json`);
    const plan = readFileSync(planPath, "utf8").replace(jobFixture.company, "Tampered Company");
    writeFileSync(planPath, plan);
    const publish = vi.fn();

    await expect(executePublicationGrant({
      actionId: grant.actionId,
      stateRoot,
      env: { CLIMATE_JOBS_NOTION_API_KEY: "sentinel" },
      trackerFactory: () => ({ publish }),
    })).rejects.toThrow("changed after authorization");
    expect(publish).not.toHaveBeenCalled();
  });

  it("fails closed without the Gateway-owned credential sentinel", async () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), "climate-jobs-grant-"));
    const entry = mapToJobApplicationTracker(jobFixture, assessmentFixture);
    const grant = issuePublicationGrant(entry, { stateRoot });
    await expect(executePublicationGrant({ actionId: grant.actionId, stateRoot, env: {} })).rejects.toThrow("credential sentinel");
  });
});
