const FLOW_ID = "84e4b348-57e5-4729-b171-e6f98a891dc9";
const AUTOMATION_NAME = "Kranz deterministic NTC continuation";
const WORKDIR = "/home/boovius/.openclaw/workspace";
const ALLOWED_SCRIPTS = new Set([
  "/home/boovius/.openclaw/workspace/scripts/ntc-page-read.mjs",
  "/home/boovius/.openclaw/workspace/scripts/ntc-write-deep-research.mjs",
  "/home/boovius/.openclaw/workspace/scripts/ntc-monitor-sync.mjs",
]);

function detailsOf(value) {
  if (value && typeof value === "object" && value.result) return detailsOf(value.result);
  if (value && typeof value === "object" && value.details) return value.details;
  if (value && typeof value === "object" && Array.isArray(value.content)) {
    const text = value.content.find((item) => item?.type === "text")?.text;
    if (text) return JSON.parse(text);
  }
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function shellArg(value) {
  return JSON.stringify(String(value));
}

async function runAuthorizedGatewayAction(authorization, title) {
  if (authorization?.status !== "action_authorized") throw new Error(`Kranz action was not authorized: ${authorization?.status ?? "missing"}`);
  const action = authorization.action;
  if (!action || !ALLOWED_SCRIPTS.has(action.script)) throw new Error(`Refusing unrecognized Kranz action: ${action?.script ?? "missing"}`);
  const command = ["node", action.script, ...(action.args ?? [])].map(shellArg).join(" ");
  return detailsOf(await openclaw__gateway_exec({
    command,
    workdir: WORKDIR,
    env: action.env ?? { OPENCLAW_NOTION_PROFILE: "ntc" },
    title,
    timeoutSeconds: 180,
    yieldMs: 10000,
  }));
}

async function stopCurrentAutomation() {
  const listing = detailsOf(await automations({ action: "list" }));
  const jobs = Array.isArray(listing?.jobs) ? listing.jobs : [];
  const matches = jobs.filter((job) => job?.name === AUTOMATION_NAME);
  if (matches.length !== 1 || !matches[0]?.id) {
    throw new Error(`Cannot identify the current Kranz automation safely: found ${matches.length}`);
  }
  await automations({ action: "remove", jobId: matches[0].id });
}

let lastTick;
for (let transition = 0; transition < 6; transition += 1) {
  lastTick = detailsOf(await kranz_flow_tick({ flowId: FLOW_ID }));
  if (lastTick?.status !== "action_required") break;
  const authorization = detailsOf(await kranz_flow_execute_pending_action({ flowId: FLOW_ID, expectedRevision: lastTick.revision }));
  await runAuthorizedGatewayAction(authorization, authorization.action?.kind === "publish_notion" ? "Publish and verify the current NTC research record" : "Read the current NTC research record");
  const verification = detailsOf(await kranz_flow_execute_pending_action({ flowId: FLOW_ID, expectedRevision: lastTick.revision }));
  if (verification?.status !== "action_complete") throw new Error(`Kranz action verification failed: ${verification?.status ?? "missing"}`);
}

if (lastTick?.status === "action_required") throw new Error("Kranz tick exceeded the protected-action transition budget");

const status = detailsOf(await kranz_flow_status({ flowId: FLOW_ID }));
if (status?.found !== true) throw new Error(`Kranz flow ${FLOW_ID} is not visible from the scheduled owner binding`);
const flow = status?.flow ?? {};

if (lastTick?.monitor) {
  const authorization = detailsOf(await kranz_flow_sync_monitor({ flowId: FLOW_ID, expectedRevision: flow.revision }));
  if (authorization?.status === "action_authorized") {
    await runAuthorizedGatewayAction(authorization, "Sync the human-readable Kranz run monitor");
  }
  const verification = detailsOf(await kranz_flow_sync_monitor({ flowId: FLOW_ID, expectedRevision: flow.revision }));
  if (verification?.status !== "monitor_synced") throw new Error(`Kranz monitor verification failed: ${verification?.status ?? "missing"}`);
}

const state = flow.stateJson ?? {};
const completed = Array.isArray(state.completedPageIds) ? state.completedPageIds.length : 0;
const total = Array.isArray(state.queueSnapshot) ? state.queueSnapshot.length : 0;
const blocked = Array.isArray(state.blockedRecords) ? state.blockedRecords.length : 0;

let notify;
if (lastTick?.status === "batch_complete" || flow.status === "succeeded") {
  notify = `Kranz completed the NTC deep-research batch: ${completed}/${total} verified, ${blocked} blocked.`;
} else if (lastTick?.status === "run_scope_complete") {
  const handled = lastTick.runScope?.handledPageIds?.length ?? 0;
  notify = `Kranz completed the requested run scope: ${handled} entries handled. Overall progress: ${completed}/${total} verified, ${blocked} blocked. Next: ${lastTick.next?.name ?? state.currentProspect ?? "none"}.`;
} else if (lastTick?.status === "record_blocked") {
  notify = `Kranz blocked ${lastTick.pageId} after exhausting research retries. Progress: ${completed}/${total} verified, ${blocked} blocked.`;
} else if (lastTick?.status === "record_complete" && completed > 0 && completed % 5 === 0) {
  notify = `Kranz checkpoint: ${completed}/${total} NTC records verified. Next: ${lastTick.next?.name ?? "none"}.`;
}

const terminalScope = lastTick?.status === "run_scope_complete" || lastTick?.status === "batch_complete" || flow.status === "succeeded";
if (terminalScope) await stopCurrentAutomation();

return {
  ...(notify ? { notify } : {}),
  state: {
    flowId: FLOW_ID,
    revision: flow.revision ?? null,
    status: flow.status ?? lastTick?.status ?? "unknown",
    currentStep: flow.currentStep ?? null,
    completed,
    total,
    blocked,
  },
};
