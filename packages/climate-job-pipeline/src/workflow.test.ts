import { describe, expect, it } from "vitest";
import { assessmentFixture, jobFixture } from "./test-fixtures.js";
import { ClimateJobFirstSlice, type JobTrackerPort } from "./workflow.js";
import type { TrackerEntry } from "./domain.js";

class MemoryTracker implements JobTrackerPort {
  readonly entries = new Map<string, { pageId: string; entry: TrackerEntry }>();

  async findByCanonicalUrl(url: string) {
    return this.entries.get(url) ?? null;
  }

  async publish(entry: TrackerEntry) {
    const pageId = `page-${this.entries.size + 1}`;
    this.entries.set(entry.canonicalUrl, { pageId, entry });
    return { pageId, canonicalUrl: entry.canonicalUrl, verified: true };
  }
}

describe("ClimateJobFirstSlice", () => {
  it("publishes once and skips the identical job on rerun", async () => {
    const tracker = new MemoryTracker();
    let evaluations = 0;
    const workflow = new ClimateJobFirstSlice(
      { fetchFirst: async () => jobFixture },
      { evaluate: async () => { evaluations += 1; return assessmentFixture; } },
      tracker,
    );

    const first = await workflow.run();
    const second = await workflow.run();

    expect(first.status).toBe("published");
    expect(second).toMatchObject({ status: "duplicate", pageId: "page-1" });
    expect(evaluations).toBe(1);
    expect(tracker.entries.size).toBe(1);
  });

  it("fails closed when publication cannot be verified", async () => {
    const workflow = new ClimateJobFirstSlice(
      { fetchFirst: async () => jobFixture },
      { evaluate: async () => assessmentFixture },
      {
        findByCanonicalUrl: async () => null,
        publish: async (entry) => ({ pageId: "page-1", canonicalUrl: entry.canonicalUrl, verified: false }),
      },
    );
    await expect(workflow.run()).rejects.toThrow("not verified");
  });
});
