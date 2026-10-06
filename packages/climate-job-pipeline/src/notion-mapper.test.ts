import { describe, expect, it } from "vitest";
import { assessmentFixture, jobFixture } from "./test-fixtures.js";
import { mapToJobApplicationTracker } from "./notion-mapper.js";

describe("Job Application Tracker mapper", () => {
  it("maps source and Amelie fields to the live tracker schema", () => {
    const entry = mapToJobApplicationTracker(jobFixture, assessmentFixture);
    expect(entry.canonicalUrl).toBe(jobFixture.canonicalUrl);
    expect(entry.idempotencyKey).toMatch(/^jobs-in-carbon:f42da2cfa6:/);
    expect(entry.properties).toMatchObject({
      Name: { title: [{ text: { content: "Patch — Product Engineer" } }] },
      Company: { rich_text: [{ text: { content: "Patch" } }] },
      Role: { rich_text: [{ text: { content: "Product Engineer" } }] },
      "Job URL": { url: jobFixture.canonicalUrl },
      Status: { select: { name: "Scored" } },
      Sector: { select: { name: "Climate Tech" } },
      "Weighted Score": { number: 88 },
      "Role Shape Fit": { number: 4 },
      "Work Mode": { select: { name: "Remote" } },
      "JD Posted Date": { date: { start: "2026-10-05" } },
      "Long Beach Fit": { select: { name: "Remote" } },
      "Search Lane": { select: { name: "Climate Priority" } },
    });
    expect(entry.properties).not.toHaveProperty("Personal Notes");
    expect(entry.properties).not.toHaveProperty("Target Week");
  });
});
