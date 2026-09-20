import { mkdir, readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { resolveNtcOutputPath, resolveNtcStateRoot, resolveWorkspacePath } from "./lib/ntc-paths.mjs";

if (process.env.OPENCLAW_NOTION_PROFILE !== "ntc") throw new Error("OPENCLAW_NOTION_PROFILE must be ntc");
const token = process.env.NTC_NOTION_API_KEY;
if (!token) throw new Error("Protected NTC Notion credential is unavailable");

const pageId = process.argv[2];
const requestedArtifactPath = process.argv[3];
const requestedReceiptPath = process.argv[4];
if (!/^[0-9a-f-]{32,36}$/i.test(pageId ?? "")) throw new Error("Valid page ID required");
if (!requestedArtifactPath) throw new Error("Artifact path required");
const stateRoot = resolveNtcStateRoot();
const artifactPath = resolveWorkspacePath(requestedArtifactPath, requestedArtifactPath);
const receiptPath = resolveNtcOutputPath(requestedReceiptPath, `publication-receipts/${pageId}.json`, stateRoot);

async function notion(endpoint, init = {}) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2026-03-11",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${endpoint}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function richTextPlain(items = []) { return items.map((x) => x.plain_text ?? x.text?.content ?? "").join(""); }
function topText(block) { return richTextPlain(block?.[block.type]?.rich_text ?? []); }

async function listTopLevel() {
  const all = [];
  let cursor;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const body = await notion(`/blocks/${pageId}/children?${query}`);
    all.push(...(body.results ?? []));
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return all;
}

function deepSectionRange(blocks) {
  const start = blocks.findIndex((block) => block.type === "heading_2" && /^deep research$/i.test(topText(block).trim()));
  if (start < 0) return null;
  let end = blocks.length;
  for (let i = start + 1; i < blocks.length; i += 1) {
    if (blocks[i].type === "heading_2") { end = i; break; }
  }
  return { start, end };
}

function cleanInline(text) {
  return text.replaceAll("**", "").replaceAll("__", "").replace(/`([^`]+)`/g, "$1");
}

function richText(markdown) {
  const out = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let index = 0;
  for (const match of markdown.matchAll(pattern)) {
    if (match.index > index) out.push(...textItems(cleanInline(markdown.slice(index, match.index))));
    out.push({ type: "text", text: { content: cleanInline(match[1]), link: { url: match[2] } } });
    index = match.index + match[0].length;
  }
  if (index < markdown.length) out.push(...textItems(cleanInline(markdown.slice(index))));
  return out.length ? out : [{ type: "text", text: { content: " " } }];
}

function textItems(text) {
  const items = [];
  for (let i = 0; i < text.length; i += 1800) items.push({ type: "text", text: { content: text.slice(i, i + 1800) } });
  return items;
}

function block(type, markdown) {
  return { object: "block", type, [type]: { rich_text: richText(markdown) } };
}

function markdownToBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## Deep Research");
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  if (start < 0) throw new Error("Artifact lacks ## Deep Research");
  const section = lines.slice(start, end < 0 ? lines.length : end);
  const blocks = [];
  for (const raw of section) {
    const line = raw.trim();
    if (!line || line === "---") continue;
    if (line.startsWith("## ")) { blocks.push(block("heading_2", line.slice(3))); continue; }
    if (line.startsWith("### ")) { blocks.push(block("heading_3", line.slice(4))); continue; }
    if (/^[-*]\s+/.test(line)) { blocks.push(block("bulleted_list_item", line.replace(/^[-*]\s+/, ""))); continue; }
    if (/^\d+\.\s+/.test(line)) { blocks.push(block("numbered_list_item", line.replace(/^\d+\.\s+/, ""))); continue; }
    blocks.push(block("paragraph", line));
  }
  return blocks;
}

const artifact = await readFile(artifactPath, "utf8");
const artifactHash = crypto.createHash("sha256").update(artifact).digest("hex");
if (!artifact.includes(pageId)) throw new Error("Artifact page ID mismatch");
if ((artifact.match(/^## Deep Research$/gm) ?? []).length !== 1) throw new Error("Artifact must contain exactly one Deep Research H2");
for (const heading of ["Charities", "Beverly Hills", "Race/Run", "Cancer", "Personnel", "Other Background Context"]) {
  if (!artifact.includes(`### ${heading}`)) throw new Error(`Artifact lacks ${heading}`);
}

const before = await listTopLevel();
const existing = deepSectionRange(before);
const deletedBlockIds = [];
const preservedIds = before.filter((_, index) => !existing || index < existing.start || index >= existing.end).map((block) => block.id);
if (existing) {
  for (const oldBlock of before.slice(existing.start, existing.end)) {
    await notion(`/blocks/${oldBlock.id}`, { method: "DELETE" });
    deletedBlockIds.push(oldBlock.id);
  }
}

const children = markdownToBlocks(artifact);
for (let index = 0; index < children.length; index += 100) {
  await notion(`/blocks/${pageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children: children.slice(index, index + 100) }),
  });
}

const afterWrite = await listTopLevel();
const deepHeadings = afterWrite.filter((block) => block.type === "heading_2" && /^deep research$/i.test(topText(block).trim()));
const h3 = new Set(afterWrite.filter((block) => block.type === "heading_3").map((block) => topText(block).trim()));
const linkedHrefCount = afterWrite.reduce((count, block) => count + (block?.[block.type]?.rich_text ?? []).filter((item) => item.href || item.text?.link?.url).length, 0);
const plainUrlCount = afterWrite.reduce((count, block) => count + (topText(block).match(/https?:\/\/\S+/g) ?? []).length, 0);
const citationUrlCount = linkedHrefCount + plainUrlCount;
const preserved = preservedIds.every((id) => afterWrite.some((block) => block.id === id));
const requiredHeadings = ["Charities", "Beverly Hills", "Race/Run", "Cancer", "Personnel", "Other Background Context"];
const verified = deepHeadings.length === 1 && requiredHeadings.every((heading) => h3.has(heading)) && citationUrlCount > 0 && preserved;
if (!verified) {
  throw new Error(`Read-back verification failed: ${JSON.stringify({ deepHeadingCount: deepHeadings.length, headings: [...h3], linkedHrefCount, plainUrlCount, citationUrlCount, preserved })}`);
}

await notion(`/pages/${pageId}`, {
  method: "PATCH",
  body: JSON.stringify({ properties: { Status: { select: { name: "Deep Research" } } } }),
});
const finalPage = await notion(`/pages/${pageId}`);
const finalStatus = finalPage.properties?.Status?.select?.name ?? finalPage.properties?.Status?.status?.name ?? null;
if (finalStatus !== "Deep Research") throw new Error(`Status verification failed: ${finalStatus}`);

const receipt = {
  pageId,
  artifactPath,
  artifactHash,
  deletedBlockIds,
  appendedBlockCount: children.length,
  readBack: { deepHeadingCount: deepHeadings.length, requiredHeadings: requiredHeadings.filter((heading) => h3.has(heading)), linkedHrefCount, plainUrlCount, citationUrlCount, preserved },
  verified: true,
  status: finalStatus,
  verifiedAt: new Date().toISOString(),
};
await mkdir(path.dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ ...receipt, receiptPath }, null, 2)}\n`);
