import { idempotencyKeyFor, type AmelieAssessment, type CanonicalJob, type TrackerEntry, type TrackerProperty } from "./domain.js";
import { assertAmelieAssessment } from "./amelie.js";

function title(content: string): TrackerProperty {
  return { title: [{ text: { content } }] };
}

function text(content: string): TrackerProperty {
  return { rich_text: content ? [{ text: { content } }] : [] };
}

export function mapToJobApplicationTracker(job: CanonicalJob, assessment: AmelieAssessment): TrackerEntry {
  assertAmelieAssessment(assessment);
  const properties: Record<string, TrackerProperty> = {
    Name: title(`${job.company} — ${job.role}`),
    Company: text(job.company),
    Role: text(job.role),
    Location: text(job.location),
    "Job URL": { url: job.canonicalUrl },
    "Employment Type": { select: { name: job.employmentType } },
    Sector: { select: { name: "Climate Tech" } },
    Status: { select: { name: "Scored" } },
    "Weighted Score": { number: assessment.weightedScore },
    "Climate Mission Alignment": { number: assessment.climateMissionAlignment },
    "Role Shape Fit": { number: assessment.roleShapeFit },
    "Technical Leverage": { number: assessment.technicalLeverage },
    "Systems Ambiguity Fit": { number: assessment.systemsAmbiguityFit },
    "Team Stage Fit": { number: assessment.teamStageFit },
    "Product Strategic Influence": { number: assessment.productStrategicInfluence },
    "Practical Viability": { number: assessment.practicalViability },
    "Overall read": text(assessment.overallRead),
    "Why it looks good": text(assessment.whyItLooksGood),
    "What gives me pause": text(assessment.whatGivesMePause),
    Stretch: { checkbox: assessment.stretch },
    "Long Beach Fit": { select: { name: assessment.longBeachFit } },
    "Search Lane": { select: { name: assessment.searchLane } },
  };
  if (job.employmentType === "Full-time") properties["Contract Window"] = { select: { name: "N/A" } };
  if (job.workMode) properties["Work Mode"] = { select: { name: job.workMode } };
  if (job.postedDate) properties["JD Posted Date"] = { date: { start: job.postedDate } };
  return { canonicalUrl: job.canonicalUrl, idempotencyKey: idempotencyKeyFor(job), properties };
}
