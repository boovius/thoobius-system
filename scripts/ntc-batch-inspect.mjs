import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const profile = process.env.OPENCLAW_NOTION_PROFILE;
if (profile !== "ntc") throw new Error("OPENCLAW_NOTION_PROFILE must be ntc");

const token = process.env.NTC_NOTION_API_KEY;
if (!token) throw new Error("Protected NTC Notion credential is unavailable");

const notionVersion = "2026-03-11";
const outputDir = "/home/boovius/.openclaw/workspace/agents/kranz-coordinator/.ntc-state";
const outputPath = path.join(outputDir, "queue-inspection.json");

async function notion(endpoint, init = {}) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${endpoint}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function richText(items = []) {
  return items.map((item) => item.plain_text ?? item.text?.content ?? "").join("");
}

function titleOf(page) {
  for (const property of Object.values(page.properties ?? {})) {
    if (property?.type === "title") return richText(property.title);
  }
  return "";
}

function propertyText(page, names) {
  for (const name of names) {
    const property = page.properties?.[name];
    if (!property) continue;
    if (property.type === "select") return property.select?.name ?? null;
    if (property.type === "status") return property.status?.name ?? null;
    if (property.type === "multi_select") return property.multi_select?.map((x) => x.name).join(", ") ?? null;
    if (property.type === "rich_text") return richText(property.rich_text);
  }
  return null;
}

function blockText(block) {
  const value = block?.[block.type];
  if (!value) return "";
  return richText(value.rich_text ?? value.caption ?? []);
}

async function listChildren(blockId) {
  const all = [];
  let cursor;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const body = await notion(`/blocks/${blockId}/children?${query}`);
    for (const block of body.results ?? []) {
      const copy = { id: block.id, type: block.type, text: blockText(block), hasChildren: block.has_children };
      if (block.has_children) copy.children = await listChildren(block.id);
      all.push(copy);
    }
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return all;
}

function flatten(blocks, depth = 0, out = []) {
  for (const block of blocks) {
    out.push({ depth, id: block.id, type: block.type, text: block.text });
    if (block.children) flatten(block.children, depth + 1, out);
  }
  return out;
}

async function searchAll(queryText) {
  const results = [];
  let cursor;
  do {
    const body = await notion("/search", {
      method: "POST",
      body: JSON.stringify({ query: queryText, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    results.push(...(body.results ?? []));
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return results;
}

function objectTitle(object) {
  if (object.object === "data_source") return richText(object.title);
  if (object.object === "database") return richText(object.title);
  if (object.object === "page") return titleOf(object);
  return "";
}

const searchResults = await searchAll("Charity Sponsors");
const candidates = searchResults.filter((item) => objectTitle(item).trim() === "Charity Sponsors");
let dataSource = candidates.find((item) => item.object === "data_source");
if (!dataSource) {
  const database = candidates.find((item) => item.object === "database");
  const dataSources = database?.data_sources ?? [];
  if (dataSources.length === 1) dataSource = await notion(`/data_sources/${dataSources[0].id}`);
}
if (!dataSource) throw new Error(`Charity Sponsors data source not found; candidates=${candidates.map((x) => x.object).join(",")}`);

if (!dataSource.properties) dataSource = await notion(`/data_sources/${dataSource.id}`);
const statusProperty = dataSource.properties?.Status;
if (!statusProperty || !["status", "select"].includes(statusProperty.type)) {
  throw new Error(`Status property missing or unsupported on data source ${dataSource.id}`);
}

const queuePages = [];
let queryCursor;
do {
  const body = await notion(`/data_sources/${dataSource.id}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 100,
      filter: { property: "Status", [statusProperty.type]: { equals: "Research Further" } },
      ...(queryCursor ? { start_cursor: queryCursor } : {}),
    }),
  });
  queuePages.push(...(body.results ?? []));
  queryCursor = body.has_more ? body.next_cursor : undefined;
} while (queryCursor);

const queue = [];
for (let index = 0; index < queuePages.length; index += 1) {
  const page = queuePages[index];
  const blocks = await listChildren(page.id);
  const flat = flatten(blocks);
  const deepHeadings = flat.filter((block) => /^deep research$/i.test(block.text.trim()) && /^heading_[123]$/.test(block.type));
  queue.push({
    index,
    position: index + 1,
    pageId: page.id,
    name: titleOf(page),
    entityType: propertyText(page, ["Type", "Entity Type", "Prospect Type"]),
    status: propertyText(page, ["Status"]),
    url: page.url,
    lastEditedTime: page.last_edited_time,
    deepResearchHeadingCount: deepHeadings.length,
    deepResearchHeadingIds: deepHeadings.map((block) => block.id),
    body: flat,
  });
}

const priorVerifiedNames = new Set(["Omega Law Group", "Velo Pasadena"]);
const reconciledCompleted = queue
  .filter((item) => priorVerifiedNames.has(item.name) && item.deepResearchHeadingCount === 1)
  .map((item) => item.pageId);
const anomalies = queue
  .filter((item) => item.deepResearchHeadingCount > 1 || (priorVerifiedNames.has(item.name) && item.deepResearchHeadingCount !== 1))
  .map((item) => ({ pageId: item.pageId, name: item.name, deepResearchHeadingCount: item.deepResearchHeadingCount }));

const artifact = {
  inspectedAt: new Date().toISOString(),
  notionProfile: profile,
  databaseId: dataSource.parent?.database_id ?? null,
  dataSourceId: dataSource.id,
  dataSourceName: objectTitle(dataSource),
  statusPropertyType: statusProperty.type,
  queueCount: queue.length,
  queue,
  reconciledCompleted,
  anomalies,
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  inspectedAt: artifact.inspectedAt,
  notionProfile: profile,
  databaseId: artifact.databaseId,
  dataSourceId: artifact.dataSourceId,
  dataSourceName: artifact.dataSourceName,
  queueCount: queue.length,
  reconciledCompleted: queue.filter((item) => reconciledCompleted.includes(item.pageId)).map((item) => ({ name: item.name, pageId: item.pageId })),
  anomalies,
  firstEligible: queue.find((item) => !reconciledCompleted.includes(item.pageId)) ?? null,
  artifactPath: outputPath,
}, null, 2)}\n`);
