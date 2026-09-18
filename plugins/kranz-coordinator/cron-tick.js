const FLOW_ID = "84e4b348-57e5-4729-b171-e6f98a891dc9";
const WORKDIR = "/home/boovius/.openclaw/workspace";
const ALLOWED_SCRIPTS = new Set([
  "/home/boovius/.openclaw/workspace/scripts/ntc-page-read.mjs",
  "/home/boovius/.openclaw/workspace/scripts/ntc-write-deep-research.mjs",
  "/home/boovius/.openclaw/workspace/scripts/ntc-monitor-sync.mjs",
]);

function detailsOf(value) {
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

async function runGatewayAction(action, title) {
  if (!action || !ALLOWED_SCRIPTS.has(action.script)) throw new Error(`Refusing unrecognized Kranz action: ${action?.script ?? "missing"}`);
  const command = ["node", action.script, ...(action.args ?? [])].map(shellArg).join(" ");
  return tools.openclaw__gateway_exec({
    command,
    workdir: WORKDIR,
    env: action.env ?? { OPENCLAW_NOTION_PROFILE: "ntc" },
    title,
    timeoutSeconds: 180,
    yieldMs: 10000,
  });
}

let lastTick;
for (let transition = 0; transition < 6; transition += 1) {
  lastTick = detailsOf(await tools.kranz_flow_tick({ flowId: FLOW_ID }));
  if (lastTick?.status !== "action_required") break;
  const kind = lastTick.action?.kind;
  await runGatewayAction(
    lastTick.action,
    kind === "publish_notion" ? "Publish and verify the current NTC research record" : "Read the current NTC research record",
  );
}

if (lastTick?.status === "action_required") throw new Error("Kranz tick exceeded the protected-action transition budget");

if (lastTick?.monitor) {
  await runGatewayAction(lastTick.monitor, "Sync the human-readable Kranz run monitor");
}

const status = detailsOf(await tools.kranz_flow_status({ flowId: FLOW_ID }));
const flow = status?.flow ?? {};
const state = flow.stateJson ?? {};
const completed = Array.isArray(state.completedPageIds) ? state.completedPageIds.length : 0;
const total = Array.isArray(state.queueSnapshot) ? state.queueSnapshot.length : 0;
const blocked = Array.isArray(state.blockedRecords) ? state.blockedRecords.length : 0;

let notify;
if (lastTick?.status === "batch_complete" || flow.status === "succeeded") {
  notify = `Kranz completed the NTC deep-research batch: ${completed}/${total} verified, ${blocked} blocked.`;
} else if (lastTick?.status === "record_blocked") {
  notify = `Kranz blocked ${lastTick.pageId} after exhausting research retries. Progress: ${completed}/${total} verified, ${blocked} blocked.`;
} else if (lastTick?.status === "record_complete" && completed > 0 && completed % 5 === 0) {
  notify = `Kranz checkpoint: ${completed}/${total} NTC records verified. Next: ${lastTick.next?.name ?? "none"}.`;
}

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
