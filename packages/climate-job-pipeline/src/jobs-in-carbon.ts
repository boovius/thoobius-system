import * as cheerio from "cheerio";
import {
  CLIMATE_JOB_SOURCE,
  contentHash,
  type CanonicalJob,
  type EmploymentType,
  type WorkMode,
} from "./domain.js";

const BASE_URL = "https://jobsincarbon.com";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "text">>;

function absoluteUrl(href: string): string {
  return new URL(href, BASE_URL).toString();
}

function employmentType(value: string): EmploymentType {
  const normalized = value.toLowerCase();
  if (normalized.includes("contract")) return "Contract";
  if (normalized.includes("full-time") || normalized.includes("full time") || normalized.includes("full_time")) return "Full-time";
  return "Unknown";
}

function workMode(value: string): WorkMode {
  const normalized = value.toLowerCase();
  if (normalized.includes("hybrid")) return "Hybrid";
  if (normalized.includes("remote")) return "Remote";
  if (normalized.includes("on-site") || normalized.includes("onsite")) return "In-person";
  return null;
}

function sourceJobIdFrom(url: string): string {
  const slug = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  const match = slug.match(/-([0-9a-f]{10})$/i);
  if (!match) throw new Error(`Jobs in Carbon URL lacks a stable source job ID: ${url}`);
  return match[1]!.toLowerCase();
}

function readJobPosting(html: string): Record<string, unknown> {
  const $ = cheerio.load(html);
  const raw = $('script[type="application/ld+json"]').first().text().trim();
  if (!raw) throw new Error("Jobs in Carbon detail page has no JobPosting JSON-LD");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed["@type"] !== "JobPosting") throw new Error("Jobs in Carbon JSON-LD is not a JobPosting");
  return parsed;
}

function addressFrom(posting: Record<string, unknown>): string {
  const location = posting.jobLocation as { address?: Record<string, unknown> } | undefined;
  const address = location?.address ?? {};
  return [address.addressLocality, address.addressRegion, address.addressCountry]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(", ");
}

export function firstJobUrlFromList(html: string): string {
  const $ = cheerio.load(html);
  const href = $('ul li a[href^="/jobs/"]').first().attr("href");
  if (!href) throw new Error("Jobs in Carbon list page contains no job links");
  return absoluteUrl(href);
}

export function parseJobsInCarbonDetail(html: string, canonicalUrl: string, retrievedAt: Date): CanonicalJob {
  const $ = cheerio.load(html);
  const posting = readJobPosting(html);
  const organization = posting.hiringOrganization as Record<string, unknown> | undefined;
  const role = String(posting.title ?? $("h1").first().text()).trim();
  const company = String(organization?.name ?? $('a[href^="/companies/"]').first().text()).trim();
  const details = $("dt").toArray().reduce<Record<string, string>>((result, node) => {
    const label = $(node).text().trim().toLowerCase();
    result[label] = $(node).next("dd").text().replace(/\s+/g, " ").trim();
    return result;
  }, {});
  const contract = details.contract ?? String(posting.employmentType ?? "");
  const description = $(".prose").first().text().replace(/\s+/g, " ").trim();
  const postedDate = typeof posting.datePosted === "string" ? posting.datePosted.slice(0, 10) : null;
  const normalizedUrl = new URL(canonicalUrl).toString();
  const stable = {
    role,
    company,
    location: details.location || addressFrom(posting),
    contract,
    postedDate,
    description,
  };
  if (!stable.role || !stable.company || !stable.description) {
    throw new Error("Jobs in Carbon detail page is missing required job fields");
  }
  return {
    source: CLIMATE_JOB_SOURCE,
    sourceJobId: sourceJobIdFrom(normalizedUrl),
    canonicalUrl: normalizedUrl,
    company: stable.company,
    role: stable.role,
    location: stable.location,
    employmentType: employmentType(contract),
    workMode: workMode(contract),
    postedDate,
    description,
    retrievedAt: retrievedAt.toISOString(),
    contentHash: contentHash(stable),
  };
}

export class JobsInCarbonAdapter {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async fetchFirst(retrievedAt = new Date()): Promise<CanonicalJob> {
    const list = await this.fetcher(`${BASE_URL}/jobs`);
    if (!list.ok) throw new Error(`Jobs in Carbon list request failed: ${list.status}`);
    const detailUrl = firstJobUrlFromList(await list.text());
    const detail = await this.fetcher(detailUrl);
    if (!detail.ok) throw new Error(`Jobs in Carbon detail request failed: ${detail.status}`);
    return parseJobsInCarbonDetail(await detail.text(), detailUrl, retrievedAt);
  }
}
