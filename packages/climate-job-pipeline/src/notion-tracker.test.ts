import { describe, expect, it, vi } from "vitest";
import { mapToJobApplicationTracker } from "./notion-mapper.js";
import { NotionJobTracker } from "./notion-tracker.js";
import { assessmentFixture, jobFixture } from "./test-fixtures.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("NotionJobTracker", () => {
  it("queries by canonical URL, creates once, and verifies every mapped property", async () => {
    const entry = mapToJobApplicationTracker(jobFixture, assessmentFixture);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ results: [] }))
      .mockResolvedValueOnce(response({ results: [] }))
      .mockResolvedValueOnce(response({ id: "page-1" }))
      .mockResolvedValueOnce(response({ id: "page-1", properties: entry.properties }));
    const tracker = new NotionJobTracker("test-token", fetchImpl);

    expect(await tracker.findByCanonicalUrl(entry.canonicalUrl)).toBeNull();
    await expect(tracker.publish(entry)).resolves.toEqual({
      pageId: "page-1",
      canonicalUrl: entry.canonicalUrl,
      verified: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const create = JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body));
    expect(create.properties).toEqual(entry.properties);
  });

  it("does not create a duplicate and fails verification when read-back differs", async () => {
    const entry = mapToJobApplicationTracker(jobFixture, assessmentFixture);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ results: [{ id: "page-existing" }] }))
      .mockResolvedValueOnce(response({ id: "page-existing", properties: { ...entry.properties, "Weighted Score": { number: 1 } } }));
    const tracker = new NotionJobTracker("test-token", fetchImpl);

    await expect(tracker.publish(entry)).resolves.toMatchObject({ pageId: "page-existing", verified: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).endsWith("/pages"))).toBe(true);
  });

  it("redacts Notion response bodies from errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ message: "secret-ish server detail" }, 401));
    const tracker = new NotionJobTracker("test-token", fetchImpl);
    await expect(tracker.findByCanonicalUrl(jobFixture.canonicalUrl)).rejects.toThrow("Notion returned 401");
    await expect(tracker.findByCanonicalUrl(jobFixture.canonicalUrl)).rejects.not.toThrow("secret-ish");
  });
});
