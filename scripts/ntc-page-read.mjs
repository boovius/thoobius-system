import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

if (process.env.OPENCLAW_NOTION_PROFILE !== "ntc") throw new Error("OPENCLAW_NOTION_PROFILE must be ntc");
const token = process.env.NTC_NOTION_API_KEY;
if (!token) throw new Error("Protected NTC Notion credential is unavailable");
const pageId = process.argv[2];
if (!/^[0-9a-f-]{32,36}$/i.test(pageId ?? "")) throw new Error("Valid page ID required");
const requestedOutputPath = process.argv[3];

async function notion(endpoint) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2026-03-11" },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${endpoint}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function richText(items = []) { return items.map((x) => x.plain_text ?? x.text?.content ?? "").join(""); }
function propertyValue(property) {
  if (!property) return null;
  if (property.type === "title") return richText(property.title);
  if (property.type === "rich_text") return richText(property.rich_text);
  if (property.type === "select") return property.select?.name ?? null;
  if (property.type === "status") return property.status?.name ?? null;
  if (property.type === "multi_select") return property.multi_select?.map((x) => x.name) ?? [];
  if (property.type === "checkbox") return property.checkbox;
  if (property.type === "url") return property.url;
  if (property.type === "email") return property.email;
  if (property.type === "phone_number") return property.phone_number;
  if (property.type === "number") return property.number;
  if (property.type === "date") return property.date;
  if (property.type === "people") return property.people?.map((x) => x.name ?? x.id) ?? [];
  if (property.type === "relation") return property.relation?.map((x) => x.id) ?? [];
  return null;
}
function blockText(block) {
  const value = block?.[block.type];
  return value ? richText(value.rich_text ?? value.caption ?? []) : "";
}
async function children(blockId) {
  const out = [];
  let cursor;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const result = await notion(`/blocks/${blockId}/children?${query}`);
    for (const block of result.results ?? []) {
      const row = { id: block.id, type: block.type, text: blockText(block) };
      if (block.has_children) row.children = await children(block.id);
      out.push(row);
    }
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);
  return out;
}

const page = await notion(`/pages/${pageId}`);
const body = await children(pageId);
const properties = Object.fromEntries(Object.entries(page.properties ?? {}).map(([name, value]) => [name, { type: value.type, value: propertyValue(value) }]));
const context = { readAt: new Date().toISOString(), notionProfile: "ntc", pageId, url: page.url, properties, body };
const outputDir = "/home/boovius/.openclaw/workspace/agents/kranz-coordinator/.ntc-state";
const outputPath = requestedOutputPath
  ? path.resolve(requestedOutputPath)
  : `${outputDir}/current-page-context.json`;
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(context, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ ...context, outputPath }, null, 2)}\n`);
