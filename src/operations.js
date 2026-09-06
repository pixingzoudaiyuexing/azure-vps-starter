import crypto from "node:crypto";

const operations = new Map();
const RESULT_TTL_MS = 2 * 60 * 60 * 1000;

export function operationIdFromToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 24);
}

export function operationSuffixFromToken(token) {
  return crypto.createHash("sha256").update(`resource:${token}`).digest("hex").slice(0, 12);
}

export function operationResourceGroupFromToken(token) {
  return `avs-${operationSuffixFromToken(token)}`;
}

export function createOperation(token, metadata = {}) {
  const id = operationIdFromToken(token);
  const existing = operations.get(id);
  if (existing) return { created: false, operation: snapshot(existing) };

  const now = new Date().toISOString();
  const job = {
    id,
    resourceSuffix: operationSuffixFromToken(token),
    resourceGroup: operationResourceGroupFromToken(token),
    status: "queued",
    stage: "queued",
    detail: "创建任务已进入队列",
    createdAt: now,
    updatedAt: now,
    metadata: sanitizeMetadata(metadata),
    result: null,
    error: null,
  };
  operations.set(id, job);
  return { created: true, operation: snapshot(job) };
}

export function getOperation(token) {
  const job = operations.get(operationIdFromToken(token));
  return job ? snapshot(job) : null;
}

export function markOperationRunning(token, detail = "正在创建 Azure 资源") {
  mutate(token, (job) => {
    job.status = "running";
    job.stage = "starting";
    job.detail = detail;
  });
}

export function updateOperationStage(token, stage, detail = "") {
  mutate(token, (job) => {
    if (job.status === "queued") job.status = "running";
    job.stage = stage;
    job.detail = detail || stage;
  });
}

export function markOperationSucceeded(token, result) {
  mutate(token, (job) => {
    job.status = "succeeded";
    job.stage = "completed";
    job.detail = "VPS 创建完成";
    job.result = result;
    job.error = null;
  });
}

export function markOperationFailed(token, error) {
  mutate(token, (job) => {
    job.status = "failed";
    job.stage = "failed";
    job.detail = error?.message || "VPS 创建失败";
    job.error = {
      code: String(error?.code || "AZURE_ERROR"),
      message: String(error?.message || "Azure 请求失败").slice(0, 1600),
    };
    job.result = null;
  });
}

export function forgetOperation(token) {
  operations.delete(operationIdFromToken(token));
}

function mutate(token, updater) {
  const id = operationIdFromToken(token);
  const job = operations.get(id);
  if (!job) return;
  updater(job);
  job.updatedAt = new Date().toISOString();
}

function snapshot(job) {
  return {
    id: job.id,
    resourceGroup: job.resourceGroup,
    status: job.status,
    stage: job.stage,
    detail: job.detail,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    metadata: { ...job.metadata },
    result: job.result ? { ...job.result } : null,
    error: job.error ? { ...job.error } : null,
  };
}

function sanitizeMetadata(metadata) {
  const allowed = ["location", "vmSize", "imageId", "mode"];
  return Object.fromEntries(allowed.filter((key) => metadata[key] != null).map((key) => [key, String(metadata[key])]));
}

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - RESULT_TTL_MS;
  for (const [id, job] of operations) {
    if (job.status === "queued" || job.status === "running") continue;
    const updated = Date.parse(job.updatedAt);
    if (Number.isFinite(updated) && updated < cutoff) operations.delete(id);
  }
}, 10 * 60 * 1000);
cleanupTimer.unref?.();
