import crypto from "node:crypto";
import { copyFile, lstat, mkdir, readdir, readFile, chmod } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_NTC_STATE_ROOT, NTC_WORKSPACE_ROOT, resolveNtcStateRoot } from "./lib/ntc-paths.mjs";

const LEGACY_STATE_ROOT = path.join(NTC_WORKSPACE_ROOT, "agents/kranz-coordinator/.ntc-state");
const LEGACY_ARTIFACT_ROOT = path.join(NTC_WORKSPACE_ROOT, "agents/mcclintock-deep-opus/artifacts");
const requestedTarget = process.argv[2];
const targetRoot = resolveNtcStateRoot(requestedTarget);

async function sha256(filePath) {
  return crypto.createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function copyVerifiedFile(sourcePath, destinationPath, summary) {
  try {
    const [sourceHash, destinationHash] = await Promise.all([sha256(sourcePath), sha256(destinationPath)]);
    if (sourceHash !== destinationHash) throw new Error(`Migration conflict at ${destinationPath}`);
    summary.identical += 1;
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  await copyFile(sourcePath, destinationPath);
  await chmod(destinationPath, 0o600);
  if (await sha256(sourcePath) !== await sha256(destinationPath)) {
    throw new Error(`Hash verification failed after copying ${sourcePath}`);
  }
  summary.copied += 1;
}

async function copyTree(sourceRoot, destinationRoot, summary) {
  let entries;
  try {
    entries = await readdir(sourceRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  await mkdir(destinationRoot, { recursive: true, mode: 0o700 });
  await chmod(destinationRoot, 0o700);
  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(destinationRoot, entry.name);
    const stat = await lstat(sourcePath);
    if (stat.isSymbolicLink()) throw new Error(`Refusing to migrate symbolic link: ${sourcePath}`);
    if (stat.isDirectory()) {
      await copyTree(sourcePath, destinationPath, summary);
      continue;
    }
    if (!stat.isFile()) throw new Error(`Refusing to migrate non-file entry: ${sourcePath}`);

    await copyVerifiedFile(sourcePath, destinationPath, summary);
  }
}

if (targetRoot !== DEFAULT_NTC_STATE_ROOT && !requestedTarget) {
  throw new Error(`Unexpected default target: ${targetRoot}`);
}

const summary = { targetRoot, copied: 0, identical: 0 };
await copyTree(LEGACY_STATE_ROOT, targetRoot, summary);
await copyTree(LEGACY_ARTIFACT_ROOT, path.join(targetRoot, "artifacts"), summary);
try {
  await copyVerifiedFile(
    path.join(LEGACY_STATE_ROOT, "notion-monitor.json"),
    path.join(targetRoot, "monitor/notion-monitor.json"),
    summary,
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
