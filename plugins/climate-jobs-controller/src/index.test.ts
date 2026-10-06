import { describe, expect, it } from "vitest";
import { mapCandidateAssessment, publishCandidateAssessment } from "./index.js";

const job = {
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

const assessment = {
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

describe("climate jobs plugin mapping boundary", () => {
  it("validates and maps JSON from the controller turn", () => {
    const mapped = mapCandidateAssessment(JSON.stringify(job), JSON.stringify(assessment));
    expect(mapped.properties).toMatchObject({
      Name: { title: [{ text: { content: "Patch — Product Engineer" } }] },
      Status: { select: { name: "Scored" } },
      "Weighted Score": { number: 88 },
    });
  });

  it("rejects malformed Amelie output", () => {
    expect(() => mapCandidateAssessment(JSON.stringify(job), JSON.stringify({ ...assessment, weightedScore: 101 })))
      .toThrow("weighted score");
  });

  it("rejects an untrusted source URL before mapping", () => {
    expect(() => mapCandidateAssessment(
      JSON.stringify({ ...job, canonicalUrl: "https://example.com/jobs/product-engineer-f42da2cfa6" }),
      JSON.stringify(assessment),
    )).toThrow("only canonical Jobs in Carbon");
  });

  it("rejects publication without owner and live-invocation authority", async () => {
    await expect(publishCandidateAssessment(JSON.stringify(job), JSON.stringify(assessment), { senderIsOwner: false }))
      .rejects.toThrow("authorized owner");
    await expect(publishCandidateAssessment(JSON.stringify(job), JSON.stringify(assessment), { senderIsOwner: true }))
      .rejects.toThrow("Live invocation authority");
  });
});
