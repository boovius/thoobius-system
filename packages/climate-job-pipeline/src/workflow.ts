import { mapToJobApplicationTracker } from "./notion-mapper.js";
import type { AmelieAssessment, CanonicalJob, TrackerEntry } from "./domain.js";

export interface JobSourcePort {
  fetchFirst(retrievedAt?: Date): Promise<CanonicalJob>;
}

export interface AmelieEvaluatorPort {
  evaluate(job: CanonicalJob): Promise<AmelieAssessment>;
}

export type TrackerReceipt = { pageId: string; canonicalUrl: string; verified: boolean };

export interface JobTrackerPort {
  findByCanonicalUrl(url: string): Promise<{ pageId: string } | null>;
  publish(entry: TrackerEntry): Promise<TrackerReceipt>;
}

export type FirstSliceResult =
  | { status: "duplicate"; job: CanonicalJob; pageId: string }
  | { status: "published"; job: CanonicalJob; assessment: AmelieAssessment; receipt: TrackerReceipt };

export class ClimateJobFirstSlice {
  constructor(
    private readonly source: JobSourcePort,
    private readonly evaluator: AmelieEvaluatorPort,
    private readonly tracker: JobTrackerPort,
  ) {}

  async run(retrievedAt = new Date()): Promise<FirstSliceResult> {
    const job = await this.source.fetchFirst(retrievedAt);
    const existing = await this.tracker.findByCanonicalUrl(job.canonicalUrl);
    if (existing) return { status: "duplicate", job, pageId: existing.pageId };
    const assessment = await this.evaluator.evaluate(job);
    const receipt = await this.tracker.publish(mapToJobApplicationTracker(job, assessment));
    if (!receipt.verified || receipt.canonicalUrl !== job.canonicalUrl) {
      throw new Error("Job tracker publication was not verified by read-back");
    }
    return { status: "published", job, assessment, receipt };
  }
}
