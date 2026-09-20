import path from "node:path";

export const NTC_WORKSPACE_ROOT = "/home/boovius/.openclaw/workspace";
export const DEFAULT_NTC_STATE_ROOT = path.join(NTC_WORKSPACE_ROOT, ".ntc-state");

export function resolveWorkspacePath(value, fallback) {
  const candidate = value || fallback;
  const resolved = path.resolve(path.isAbsolute(candidate) ? candidate : path.join(NTC_WORKSPACE_ROOT, candidate));
  const relative = path.relative(NTC_WORKSPACE_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`NTC path must remain inside ${NTC_WORKSPACE_ROOT}: ${resolved}`);
  }
  return resolved;
}

export function resolveNtcStateRoot(value = process.env.NTC_STATE_ROOT) {
  return resolveWorkspacePath(value, DEFAULT_NTC_STATE_ROOT);
}

export function resolveNtcOutputPath(value, fallbackRelativePath, stateRoot = resolveNtcStateRoot()) {
  if (value) return resolveWorkspacePath(value, path.join(stateRoot, fallbackRelativePath));
  return resolveWorkspacePath(path.join(stateRoot, fallbackRelativePath), path.join(stateRoot, fallbackRelativePath));
}
