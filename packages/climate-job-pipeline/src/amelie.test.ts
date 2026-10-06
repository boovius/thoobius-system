import { describe, expect, it } from "vitest";
import { assertAmelieAssessment, buildAmelieAssessmentPrompt } from "./amelie.js";
import { assessmentFixture, jobFixture } from "./test-fixtures.js";

describe("Amelie assessment contract", () => {
  it("accepts a complete assessment", () => {
    expect(() => assertAmelieAssessment(assessmentFixture)).not.toThrow();
  });

  it("rejects out-of-range dimensions", () => {
    expect(() => assertAmelieAssessment({ ...assessmentFixture, roleShapeFit: 6 }))
      .toThrow("roleShapeFit");
  });

  it("builds a bounded role-specific assessment prompt", () => {
    const prompt = buildAmelieAssessmentPrompt(jobFixture);
    expect(prompt).toContain("Amelie climate-hiring lens");
    expect(prompt).toContain("Product Engineer");
    expect(prompt).toContain("Return JSON only");
  });
});
