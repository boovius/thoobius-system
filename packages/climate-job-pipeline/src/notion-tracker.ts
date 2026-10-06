import type { TrackerEntry, TrackerProperty } from "./domain.js";
import type { JobTrackerPort, TrackerReceipt } from "./workflow.js";

export const JOB_APPLICATION_TRACKER_DATABASE_ID = "69cfbec6-36ad-45c0-9636-70db3551e2b8";
export const JOB_APPLICATION_TRACKER_DATA_SOURCE_ID = "b38c3c59-2ac6-4032-ba66-a8fb07307a24";

type FetchLike = typeof fetch;
type NotionPage = { id: string; properties?: Record<string, unknown> };

function plainText(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return items.map((item) => {
    if (!item || typeof item !== "object") return "";
    const value = item as { plain_text?: unknown; text?: { content?: unknown } };
    return typeof value.plain_text === "string"
      ? value.plain_text
      : typeof value.text?.content === "string" ? value.text.content : "";
  }).join("");
}

function propertyValue(property: unknown, expected: TrackerProperty): unknown {
  if (!property || typeof property !== "object") return undefined;
  const value = property as Record<string, any>;
  if ("title" in expected) return plainText(value.title);
  if ("rich_text" in expected) return plainText(value.rich_text);
  if ("select" in expected) return value.select?.name;
  if ("number" in expected) return value.number;
  if ("checkbox" in expected) return value.checkbox;
  if ("url" in expected) return value.url;
  return value.date?.start;
}

function expectedValue(property: TrackerProperty): unknown {
  if ("title" in property) return plainText(property.title);
  if ("rich_text" in property) return plainText(property.rich_text);
  if ("select" in property) return property.select.name;
  if ("number" in property) return property.number;
  if ("checkbox" in property) return property.checkbox;
  if ("url" in property) return property.url;
  return property.date.start;
}

export class NotionJobTracker implements JobTrackerPort {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    if (!token) throw new Error("Protected climate-jobs Notion credential is unavailable");
  }

  private async notion(endpoint: string, init: RequestInit = {}): Promise<any> {
    const response = await this.fetchImpl(`https://api.notion.com/v1${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": "2026-03-11",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const body = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(`${init.method ?? "GET"} ${endpoint}: Notion returned ${response.status}`);
    return body;
  }

  async findByCanonicalUrl(url: string): Promise<{ pageId: string } | null> {
    const body = await this.notion(`/data_sources/${JOB_APPLICATION_TRACKER_DATA_SOURCE_ID}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 1,
        filter: { property: "Job URL", url: { equals: url } },
      }),
    });
    const page = Array.isArray(body.results) ? body.results[0] as NotionPage | undefined : undefined;
    return page?.id ? { pageId: page.id } : null;
  }

  async publish(entry: TrackerEntry): Promise<TrackerReceipt> {
    const existing = await this.findByCanonicalUrl(entry.canonicalUrl);
    let pageId = existing?.pageId;
    if (!pageId) {
      const created = await this.notion("/pages", {
        method: "POST",
        body: JSON.stringify({
          parent: { type: "database_id", database_id: JOB_APPLICATION_TRACKER_DATABASE_ID },
          properties: entry.properties,
        }),
      }) as NotionPage;
      if (!created.id) throw new Error("Notion create response omitted the page ID");
      pageId = created.id;
    }

    const page = await this.notion(`/pages/${pageId}`) as NotionPage;
    const verified = Object.entries(entry.properties).every(([name, expected]) =>
      propertyValue(page.properties?.[name], expected) === expectedValue(expected));
    return { pageId, canonicalUrl: entry.canonicalUrl, verified };
  }
}
