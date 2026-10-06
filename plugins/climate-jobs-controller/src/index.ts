import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import {
  JobsInCarbonAdapter,
  CLIMATE_JOB_SOURCE,
  assertCanonicalJob,
  assertAmelieAssessment,
  buildAmelieAssessmentPrompt,
  mapToJobApplicationTracker,
  type AmelieAssessment,
  type CanonicalJob,
} from "@thoobius/climate-job-pipeline";
import { executePublicationGrant, issuePublicationGrant } from "./protected-notion.js";

const JsonText = Type.String({ description: "A complete JSON-encoded object." });

function result(details: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }], details };
}

function parseObject<T>(value: string, label: string): T {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must encode a JSON object`);
  return parsed as T;
}

export async function fetchFirstCandidate(adapter = new JobsInCarbonAdapter()) {
  const job = await adapter.fetchFirst();
  return { job, assessmentPrompt: buildAmelieAssessmentPrompt(job) };
}

export function mapCandidateAssessment(jobJson: string, assessmentJson: string) {
  const job = parseObject<CanonicalJob>(jobJson, "jobJson");
  const assessment = parseObject<AmelieAssessment>(assessmentJson, "assessmentJson");
  assertCanonicalJob(job);
  const url = new URL(job.canonicalUrl);
  if (job.source !== CLIMATE_JOB_SOURCE || url.hostname !== "jobsincarbon.com" || !url.pathname.startsWith("/jobs/")) {
    throw new Error("The first-slice mapper accepts only canonical Jobs in Carbon candidates");
  }
  assertAmelieAssessment(assessment);
  return mapToJobApplicationTracker(job, assessment);
}

export async function publishCandidateAssessment(
  jobJson: string,
  assessmentJson: string,
  authority: { senderIsOwner?: boolean; assertInvocationCurrent?: () => void },
) {
  if (authority.senderIsOwner !== true) throw new Error("Only the authorized owner may publish climate jobs to Notion");
  if (!authority.assertInvocationCurrent) throw new Error("Live invocation authority is required for Notion publication");
  const entry = mapCandidateAssessment(jobJson, assessmentJson);
  authority.assertInvocationCurrent();
  const grant = issuePublicationGrant(entry);
  return executePublicationGrant({
    actionId: grant.actionId,
    assertCurrent: authority.assertInvocationCurrent,
  });
}

export default defineToolPlugin({
  id: "climate-jobs-controller",
  name: "Climate Jobs Controller",
  description: "Fetch and assess climate-job candidates before protected tracker publication.",
  configSchema: Type.Object({}, { additionalProperties: false }),
  tools: (tool) => [
    tool({
      name: "climate_jobs_fetch_first",
      description: "Fetch and normalize the first current Jobs in Carbon listing, returning the candidate plus the versioned Amelie assessment prompt.",
      parameters: Type.Object({}),
      factory() {
        return {
          name: "climate_jobs_fetch_first",
          label: "Fetch First Climate Job",
          description: "Fetch and normalize the first current Jobs in Carbon listing.",
          parameters: Type.Object({}),
          executionMode: "sequential" as const,
          async execute() { return result(await fetchFirstCandidate()); },
        };
      },
    }),
    tool({
      name: "climate_jobs_map_assessment",
      description: "Validate a structured Amelie assessment and map it with its canonical job to the live Job Application Tracker schema. This tool does not publish.",
      parameters: Type.Object({ jobJson: JsonText, assessmentJson: JsonText }),
      factory() {
        return {
          name: "climate_jobs_map_assessment",
          label: "Map Climate Job Assessment",
          description: "Validate and map an Amelie assessment to the Job Application Tracker schema without publishing.",
          parameters: Type.Object({ jobJson: JsonText, assessmentJson: JsonText }),
          executionMode: "sequential" as const,
          async execute(_id: string, params: Record<string, unknown>) {
            return result(mapCandidateAssessment(String(params.jobJson), String(params.assessmentJson)));
          },
        };
      },
    }),
    tool({
      name: "climate_jobs_publish_assessment",
      description: "Owner-only protected publication of one validated Jobs in Carbon candidate and Amelie assessment to the Job Application Tracker. Uses a short-lived one-time grant and verifies the Notion read-back.",
      parameters: Type.Object({ jobJson: JsonText, assessmentJson: JsonText }),
      factory({ toolContext }) {
        return {
          name: "climate_jobs_publish_assessment",
          label: "Publish Scored Climate Job",
          description: "Publish one validated scored job through the protected Notion executor.",
          parameters: Type.Object({ jobJson: JsonText, assessmentJson: JsonText }),
          executionMode: "sequential" as const,
          async execute(_id: string, params: Record<string, unknown>) {
            return result(await publishCandidateAssessment(
              String(params.jobJson),
              String(params.assessmentJson),
              toolContext,
            ));
          },
        };
      },
    }),
  ],
});
