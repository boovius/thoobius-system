import { describe, expect, it } from "vitest";
import { firstJobUrlFromList, JobsInCarbonAdapter, parseJobsInCarbonDetail } from "./jobs-in-carbon.js";

const listHtml = `
  <ul class="space-y-3">
    <li><a href="/jobs/product-engineer-f42da2cfa6"><h3>Product Engineer</h3></a></li>
  </ul>
`;

const detailHtml = `
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"JobPosting","title":"Product Engineer","datePosted":"2026-10-05T12:00:00Z","employmentType":"FULL_TIME","hiringOrganization":{"@type":"Organization","name":"Patch"},"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"San Francisco","addressRegion":"CA","addressCountry":"United States"}}}
  </script>
  <h1>Product Engineer</h1>
  <dl>
    <dt>Location</dt><dd>San Francisco, CA, United States</dd>
    <dt>Contract</dt><dd>Full-time · Hybrid</dd>
  </dl>
  <div class="prose"><h2>About the role</h2><p>Build trustworthy climate software.</p></div>
`;

describe("JobsInCarbonAdapter", () => {
  it("locates the first detail URL", () => {
    expect(firstJobUrlFromList(listHtml)).toBe("https://jobsincarbon.com/jobs/product-engineer-f42da2cfa6");
  });

  it("normalizes a detail page into a canonical job", () => {
    const job = parseJobsInCarbonDetail(
      detailHtml,
      "https://jobsincarbon.com/jobs/product-engineer-f42da2cfa6",
      new Date("2026-10-05T18:00:00.000Z"),
    );
    expect(job).toMatchObject({
      source: "jobs-in-carbon",
      sourceJobId: "f42da2cfa6",
      company: "Patch",
      role: "Product Engineer",
      location: "San Francisco, CA, United States",
      employmentType: "Full-time",
      workMode: "Hybrid",
      postedDate: "2026-10-05",
      retrievedAt: "2026-10-05T18:00:00.000Z",
    });
    expect(job.description).toContain("Build trustworthy climate software");
    expect(job.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fetches list and detail pages through the injected transport", async () => {
    const requested: string[] = [];
    const fetcher = async (input: string | URL) => {
      const url = String(input);
      requested.push(url);
      return { ok: true, status: 200, text: async () => url.endsWith("/jobs") ? listHtml : detailHtml };
    };
    const adapter = new JobsInCarbonAdapter(fetcher);
    const job = await adapter.fetchFirst(new Date("2026-10-05T18:00:00.000Z"));
    expect(requested).toEqual([
      "https://jobsincarbon.com/jobs",
      "https://jobsincarbon.com/jobs/product-engineer-f42da2cfa6",
    ]);
    expect(job.sourceJobId).toBe("f42da2cfa6");
  });
});
