const pageId = "3ddc9504-51fd-8047-8f27-e58e36922b0f";
const notionVersion = "2025-09-03";
const mode = process.argv[2] ?? "inspect";
const token = process.env.NTC_NOTION_API_KEY;

if (!token) throw new Error("Protected NTC Notion credential is unavailable on this host");

const headers = {
  Authorization: `Bearer ${token}`,
  "Notion-Version": notionVersion,
  "Content-Type": "application/json",
};

async function notion(path, init = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function children(blockId) {
  const results = [];
  let cursor;
  do {
    const suffix = new URLSearchParams({ page_size: "100" });
    if (cursor) suffix.set("start_cursor", cursor);
    const body = await notion(`/blocks/${blockId}/children?${suffix}`);
    results.push(...body.results);
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return results;
}

function plain(block) {
  return (block[block.type]?.rich_text ?? []).map((part) => part.plain_text).join("");
}

function rich(text, options = {}) {
  return [{
    type: "text",
    text: { content: text },
    annotations: {
      bold: Boolean(options.bold), italic: false, strikethrough: false,
      underline: false, code: false, color: "default",
    },
    plain_text: text,
    href: null,
  }];
}

function heading2(text) {
  return { object: "block", type: "heading_2", heading_2: { rich_text: rich(text), is_toggleable: false, color: "default" } };
}

function heading3(text) {
  return { object: "block", type: "heading_3", heading_3: { rich_text: rich(text), is_toggleable: false, color: "default" } };
}

function paragraph(label, text) {
  return {
    object: "block", type: "paragraph",
    paragraph: {
      rich_text: [
        ...rich(`${label}: `, { bold: true }),
        ...rich(text),
      ],
      color: "default",
    },
  };
}

const recipeBlocks = [
  heading2("Roles"),
  heading3("1. Humboldt Scout — Broad Discovery (Sonnet 5)"),
  paragraph("Mission", "Broad discovery — surfaces plausible sponsor, donor, event, and partnership candidates and normalizes them into evidence packets for human review."),
  paragraph("Model", "Claude Sonnet 5 (anthropic/claude-sonnet-5), with gpt-5.6-sol configured as fallback."),
  paragraph("Research sequence", "Scope topic, geography, and time window → survey broadly across official sites, filings, journalism, and public professional or social sources → resolve entity identity and deduplicate → build a candidate packet with entity/type, why it matters, evidence with links and dates, Beverly Hills/race-run/cancer/charity connections, confidence, contradictions or unknowns, and recommended next action → write to NTC Notion only when authorized → report counts searched, excluded, deduplicated, surfaced, and recommended for deep research."),
  paragraph("Evidence standard", "Prefer primary sources plus reputable reporting; provide direct citations with dates; grade confidence as Well-supported, Plausible, Disputed, or Unknown; do not use people-finder sites or unsourced listicles; do not speculate about medical or family matters."),
  paragraph("Boundaries", "Research and internal NTC Notion updates only. Never contact, email, message, or pitch anyone; never change status or imply outreach approval; use only the NTC Notion profile."),
  heading3("2. McClintock Deep — Single-Entity Deep Research (Opus 5)"),
  paragraph("Mission", "A targeted deep dive on one prospect already marked Research Further. Humboldt finds the landscape; McClintock investigates one row completely."),
  paragraph("Model", "Claude Opus 5 (anthropic/claude-opus-5)."),
  paragraph("Queue boundary", "Connect to the NTC Notion profile; process only rows whose Status is exactly Research Further, one at a time in displayed order; never select the next record or manage the batch; never change status without explicit authorization."),
  paragraph("Investigation threads", "Charities (donations, sponsorships, tiers, and amounts); Beverly Hills (documented residence, headquarters, civic, philanthropic, and event ties); Race/Run (5Ks, marathons, and charity runs, including role, tier, event, and year); Cancer (only clearly public personal, family, fundraising, or advocacy connections, with no medical speculation); Personnel (for businesses only: public CSR, community-relations, and foundation contacts); Other Background Context (company history, leadership, reputation, and notable news)."),
  paragraph("Method", "Start from the existing record → list what is known, claimed, missing, and contradictory → cross-check material claims with a second source → label conclusions Verified, Supported inference, Unresolved, or No public evidence found → revisit anomalies → stop when more searching is unlikely to change the decision."),
  paragraph("Required handoff", "Return the exact target page ID, prospect name, entity type, complete six-section packet, direct source links, evidence labels, unresolved items, intended replacement placement, and a durable completion-artifact path. The packet must be self-contained."),
  paragraph("Notion write-back", "McClintock does not receive the protected credential. Kranz writes through the Gateway: append a Deep Research section with Charities, Beverly Hills, Race/Run, Cancer, Personnel when applicable, and Other Background Context; on rerun replace only the existing Deep Research section; preserve unrelated content; read the page back and verify it."),
  paragraph("Boundaries", "Research only. Never contact anyone; never infer private medical or family details; never change status without authorization; use only the NTC Notion profile."),
  heading3("3. Kranz — Durable Research Coordinator (Gateway / TaskFlow)"),
  paragraph("Mission", "Own durable multi-record execution of NTC research queues. McClintock investigates one prospect; Kranz owns queue state, protected Notion writes, verification, retries, and recovery so one agent turn ending never silently stops the batch."),
  paragraph("Runtime", "Main OpenClaw Gateway with the dedicated kranz-coordinator TaskFlow plugin so batch state persists durably. Primary model openai/gpt-5.6-sol, with Claude Haiku 4.5 configured as fallback."),
  paragraph("Mission loop", "(1) Read and snapshot the Research Further queue. (2) Select one uncompleted record. (3) Launch McClintock on Opus 5 with that record’s identity and existing page context. (4) Require a self-contained dossier plus page ID and artifact path. (5) Validate required sections and citations. (6) Write or replace only the Deep Research section through the protected Gateway. (7) Read the Notion page back and verify the write. (8) After verification, set Status to Deep Research. (9) Save a durable checkpoint. (10) Launch the next record automatically. Finish only when every record is verified, skipped with a recorded reason, or explicitly blocked."),
  paragraph("Persisted checkpoint state", "Queue snapshot and record IDs; current record and index; McClintock child-run ID; retry count; dossier artifact path and hash; Notion write and read-back status; status-update confirmation; completed, skipped, and blocked records; last verified timestamp."),
  paragraph("Failure handling", "A child session ending is a handoff, not completion; research failures retry the same prospect within a defined limit; write or verification failures never advance the queue; restarting OpenClaw resumes from the last verified checkpoint; idempotent writes prevent duplicate Deep Research sections; processing remains serial, one prospect at a time."),
  paragraph("Verification gates", "Validate prospect identity and page ID, required research headings, meaningful direct citations, unresolved items, preservation of unrelated content, absence of duplicate Deep Research sections, and the post-verification Status transition before advancing."),
  paragraph("Reporting", "Report verified / total, the current prospect, and blocked count. Distinguish research complete, Notion write complete, and verified. Say running only when an active linked task or scheduled continuation truly exists."),
  paragraph("Boundaries", "Use the NTC Notion profile only for NTC work; never pass the protected NTC Notion credential to Claude CLI, child agents, artifacts, logs, or prompts; never perform outreach; change prospect Status only through the explicitly authorized post-verification transition to Deep Research."),
];

async function inspect() {
  const blocks = await children(pageId);
  console.log(JSON.stringify(blocks.map((block, index) => ({ index, id: block.id, type: block.type, text: plain(block) })), null, 2));
}

async function writeRoles() {
  const before = await children(pageId);
  const rolesIndex = before.findIndex((block) => block.type === "heading_2" && plain(block).trim() === "Roles");
  if (rolesIndex < 0) throw new Error("Roles heading not found");
  const nextHeadingIndex = before.findIndex((block, index) => index > rolesIndex && block.type === "heading_2");
  const end = nextHeadingIndex < 0 ? before.length : nextHeadingIndex;
  const targets = before.slice(rolesIndex, end);
  const preservedBefore = before.slice(0, rolesIndex).map((block) => ({ id: block.id, type: block.type, text: plain(block) }));
  const preservedAfter = before.slice(end).map((block) => ({ id: block.id, type: block.type, text: plain(block) }));

  for (const block of targets) {
    await notion(`/blocks/${block.id}`, { method: "DELETE" });
  }
  await notion(`/blocks/${pageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({
      children: recipeBlocks,
      after: rolesIndex === 0 ? undefined : before[rolesIndex - 1].id,
    }),
  });

  const after = await children(pageId);
  const afterRolesIndex = after.findIndex((block) => block.type === "heading_2" && plain(block).trim() === "Roles");
  const afterNextHeadingIndex = after.findIndex((block, index) => index > afterRolesIndex && block.type === "heading_2");
  const afterEnd = afterNextHeadingIndex < 0 ? after.length : afterNextHeadingIndex;
  const actualBefore = after.slice(0, afterRolesIndex).map((block) => ({ id: block.id, type: block.type, text: plain(block) }));
  const actualAfter = after.slice(afterEnd).map((block) => ({ id: block.id, type: block.type, text: plain(block) }));
  const roles = after.slice(afterRolesIndex, afterEnd).map((block) => ({ type: block.type, text: plain(block) }));
  const expectedRoleTexts = recipeBlocks.map((block) => ({ type: block.type, text: plain(block) }));
  const verified = JSON.stringify(preservedBefore) === JSON.stringify(actualBefore)
    && JSON.stringify(preservedAfter) === JSON.stringify(actualAfter)
    && JSON.stringify(expectedRoleTexts) === JSON.stringify(roles);

  console.log(JSON.stringify({
    verified,
    pageUrl: `https://www.notion.so/${pageId.replaceAll("-", "")}`,
    rolesBlockCount: roles.length,
    preservedBeforeCount: actualBefore.length,
    preservedAfterCount: actualAfter.length,
    roleHeadings: roles.filter((block) => block.type.startsWith("heading_")).map((block) => block.text),
  }, null, 2));
  if (!verified) process.exitCode = 2;
}

if (mode === "inspect") await inspect();
else if (mode === "write") await writeRoles();
else throw new Error(`Unknown mode: ${mode}`);
