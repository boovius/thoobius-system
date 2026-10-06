import type { AmelieAssessment, CanonicalJob } from "./domain.js";

const LONG_BEACH_FITS = new Set(["LBC", "LA Core / Nearby", "Remote", "Not Local", "Unknown"]);
const SEARCH_LANES = new Set(["Long Beach Proximity", "Pasadena Hybrid", "Remote Contract", "Climate Priority", "Overflow / Later"]);
const DIMENSIONS: Array<keyof AmelieAssessment> = [
  "climateMissionAlignment",
  "roleShapeFit",
  "technicalLeverage",
  "systemsAmbiguityFit",
  "teamStageFit",
  "productStrategicInfluence",
  "practicalViability",
];

export function assertAmelieAssessment(value: unknown): asserts value is AmelieAssessment {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Amelie assessment must be an object");
  const assessment = value as Partial<AmelieAssessment>;
  if (assessment.assessmentVersion !== 1) throw new Error("Unsupported Amelie assessment version");
  if (!Number.isInteger(assessment.weightedScore) || assessment.weightedScore! < 0 || assessment.weightedScore! > 100) {
    throw new Error("Amelie weighted score must be an integer from 0 to 100");
  }
  for (const dimension of DIMENSIONS) {
    const score = assessment[dimension];
    if (!Number.isInteger(score) || Number(score) < 1 || Number(score) > 5) {
      throw new Error(`Amelie ${dimension} must be an integer from 1 to 5`);
    }
  }
  for (const field of ["overallRead", "whyItLooksGood", "whatGivesMePause"] as const) {
    if (typeof assessment[field] !== "string" || !assessment[field]!.trim()) throw new Error(`Amelie ${field} is required`);
  }
  if (typeof assessment.stretch !== "boolean") throw new Error("Amelie stretch must be boolean");
  if (!LONG_BEACH_FITS.has(String(assessment.longBeachFit))) throw new Error("Invalid Amelie longBeachFit");
  if (!SEARCH_LANES.has(String(assessment.searchLane))) throw new Error("Invalid Amelie searchLane");
}

export function buildAmelieAssessmentPrompt(job: CanonicalJob): string {
  return [
    "Review, analyze, and score this role for Josh using the Amelie climate-hiring lens.",
    "Separate intrinsic role fit from practical viability. Return JSON only, matching assessmentVersion 1.",
    "All seven dimension scores must be integers from 1 to 5; weightedScore must be an integer from 0 to 100.",
    "Do not invent candidate experience or facts absent from the trusted candidate profile.",
    "",
    JSON.stringify(job, null, 2),
  ].join("\n");
}
