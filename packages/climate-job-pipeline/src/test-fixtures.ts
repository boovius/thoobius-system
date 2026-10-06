import type { AmelieAssessment, CanonicalJob } from "./domain.js";

export const assessmentFixture: AmelieAssessment = {
  assessmentVersion: 1,
  weightedScore: 88,
  climateMissionAlignment: 5,
  roleShapeFit: 4,
  technicalLeverage: 5,
  systemsAmbiguityFit: 5,
  teamStageFit: 4,
  productStrategicInfluence: 4,
  practicalViability: 3,
  overallRead: "88/100 — compelling climate-software fit.",
  whyItLooksGood: "Strong product-engineering and climate-data overlap.",
  whatGivesMePause: "Hybrid location needs confirmation.",
  stretch: false,
  longBeachFit: "Remote",
  searchLane: "Climate Priority",
};

export const jobFixture: CanonicalJob = {
  source: "jobs-in-carbon",
  sourceJobId: "f42da2cfa6",
  canonicalUrl: "https://jobsincarbon.com/jobs/product-engineer-f42da2cfa6",
  company: "Patch",
  role: "Product Engineer",
  location: "San Francisco, CA, United States",
  employmentType: "Full-time",
  workMode: "Remote",
  postedDate: "2026-10-05",
  description: "Build trustworthy climate software.",
  retrievedAt: "2026-10-05T18:00:00.000Z",
  contentHash: "a".repeat(64),
};
