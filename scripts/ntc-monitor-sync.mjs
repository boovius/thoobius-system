import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

if (process.env.OPENCLAW_NOTION_PROFILE !== "ntc") throw new Error("OPENCLAW_NOTION_PROFILE must be ntc");
const token = process.env.NTC_NOTION_API_KEY;
if (!token) throw new Error("Protected NTC Notion credential is unavailable");

const flowId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(flowId ?? "")) throw new Error("Valid flow ID required");

const AUTOMATION_PAGE_ID = "3ddc9504-51fd-8047-8f27-e58e36922b0f";
const MONITOR_TITLE = "Kranz Research Monitor — Current Run";
const STATE_PATH = "/home/boovius/.openclaw/workspace/agents/kranz-coordinator/.ntc-state/notion-monitor.json";
const execFileAsync = promisify(execFile);

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

function richText(items = []) { return items.map((item) => item.plain_text ?? item.text?.content ?? "").join(""); }
function blockText(block) { return richText(block?.[block.type]?.rich_text ?? []); }
function text(content, bold = false) { return [{ type: "text", text: { content }, annotations: { bold } }]; }
function paragraph(content) { return { object: "block", type: "paragraph", paragraph: { rich_text: text(content) } }; }
function bullet(label, value) {
  return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [...text(`${label}: `, true), ...text(value)] } };
}
function heading2(content) { return { object: "block", type: "heading_2", heading_2: { rich_text: text(content) } }; }

async function children(blockId) {
  const all = [];
  let cursor;
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const body = await notion(`/blocks/${blockId}/children?${query}`);
    all.push(...(body.results ?? []));
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return all;
}

async function findOrCreateMonitor() {
  try {
    const saved = JSON.parse(await readFile(STATE_PATH, "utf8"));
    if (saved.pageId) {
      const page = await notion(`/pages/${saved.pageId}`);
      if (!page.archived) return { pageId: page.id, url: page.url };
    }
  } catch { /* recover from missing/stale local monitor state */ }

  const parentChildren = await children(AUTOMATION_PAGE_ID);
  const existing = parentChildren.find((block) => block.type === "child_page" && block.child_page?.title === MONITOR_TITLE);
  if (existing) {
    const page = await notion(`/pages/${existing.id}`);
    return { pageId: page.id, url: page.url };
  }

  const page = await notion("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: AUTOMATION_PAGE_ID },
      properties: { title: { type: "title", title: text(MONITOR_TITLE) } },
      children: [
        { object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "🎛️" }, rich_text: text("Human-readable projection of TaskFlow. TaskFlow remains the machine source of truth; a monitor-sync delay never advances or blocks research.") } },
        heading2("How to read this"),
        bullet("Verified", "The prospect page contains exactly one Deep Research section, read-back passed, and Status is Deep Research."),
        bullet("Current step", "The precise controller phase saved in TaskFlow."),
        bullet("Continuation", "A five-minute scheduled Kranz tick is the MVP wake-up mechanism."),
      ],
    }),
  });
  return { pageId: page.id, url: page.url };
}

const { stdout } = await execFileAsync("openclaw", ["tasks", "flow", "show", flowId, "--json"], { maxBuffer: 4 * 1024 * 1024 });
const flow = JSON.parse(stdout);
const state = flow.stateJson ?? {};
const queue = Array.isArray(state.queueSnapshot) ? state.queueSnapshot : [];
const completed = Array.isArray(state.completedPageIds) ? state.completedPageIds : [];
const skipped = Array.isArray(state.skippedPageIds) ? state.skippedPageIds : [];
const blocked = Array.isArray(state.blockedRecords) ? state.blockedRecords : [];
const monitor = await findOrCreateMonitor();

const existingBlocks = await children(monitor.pageId);
const managedStart = existingBlocks.findIndex((block) => block.type === "heading_2" && blockText(block).trim() === "Managed Snapshot");
if (managedStart >= 0) {
  for (const block of existingBlocks.slice(managedStart)) await notion(`/blocks/${block.id}`, { method: "DELETE" });
}

const currentIndex = Number(state.currentIndex ?? 0);
const current = queue[currentIndex];
const lastCompleted = state.lastCompletedRecord ?? null;
const snapshot = [
  heading2("Managed Snapshot"),
  paragraph(`Synced from TaskFlow at ${new Date().toISOString()}`),
  bullet("Flow ID", flow.flowId),
  bullet("Overall status", String(flow.status ?? "unknown")),
  bullet("Progress", `${completed.length} verified / ${queue.length} total`),
  bullet("Current prospect", current?.name ?? state.currentProspect ?? "None"),
  bullet("Queue position", current ? `${currentIndex + 1} of ${queue.length}` : "Complete"),
  bullet("Current step", String(flow.currentStep ?? "none")),
  bullet("TaskFlow revision", String(flow.revision ?? "unknown")),
  bullet("Blocked", String(blocked.length)),
  bullet("Skipped", String(skipped.length)),
  bullet("Last verified", String(state.lastVerifiedAt ?? "Not recorded")),
  bullet("Last completed record", lastCompleted?.name ?? "Not recorded"),
  bullet("Continuation", flow.status === "succeeded" ? "No continuation required" : "Five-minute scheduled Kranz tick"),
  ...(flow.blockedSummary ? [bullet("Current blocker", String(flow.blockedSummary))] : []),
];

await notion(`/blocks/${monitor.pageId}/children`, { method: "PATCH", body: JSON.stringify({ children: snapshot }) });
await mkdir(STATE_PATH.slice(0, STATE_PATH.lastIndexOf("/")), { recursive: true });
await writeFile(STATE_PATH, `${JSON.stringify({ pageId: monitor.pageId, url: monitor.url, flowId, syncedAt: new Date().toISOString(), syncedRevision: flow.revision }, null, 2)}\n`, { mode: 0o600 });

const verifiedBlocks = await children(monitor.pageId);
const labels = verifiedBlocks.map(blockText);
if (!labels.some((value) => value.includes(flow.flowId)) || !labels.includes("Managed Snapshot")) throw new Error("Monitor read-back verification failed");

process.stdout.write(`${JSON.stringify({ pageId: monitor.pageId, url: monitor.url, flowId, revision: flow.revision, progress: { verified: completed.length, total: queue.length }, currentProspect: current?.name ?? null, currentStep: flow.currentStep, readBackVerified: true }, null, 2)}\n`);
