const OPERATION_STORAGE_KEY = "azure-vps-starter.active-operation";
const state = {
  credentials: null,
  locations: [],
  skus: [],
  images: [],
  result: null,
  activeOperationToken: null,
  currentOperation: null,
  operationMissing: false,
  lostResourceGroup: null,
};
const el = (id) => document.getElementById(id);
const fields = {
  tenantId: el("tenantId"), clientId: el("clientId"), clientSecret: el("clientSecret"), subscriptionId: el("subscriptionId"),
  location: el("location"), vmSize: el("vmSize"), image: el("image"),
};

init();

async function init() {
  try {
    const meta = await api("/api/meta");
    state.images = meta.images;
    renderImages();
  } catch (error) { showError(error); }

  el("validateBtn").addEventListener("click", validateApi);
  el("location").addEventListener("change", loadSkus);
  el("createBtn").addEventListener("click", createVps);
  el("copyBtn").addEventListener("click", copyResult);
  for (const input of [fields.tenantId, fields.clientId, fields.clientSecret, fields.subscriptionId]) {
    input.addEventListener("input", invalidateValidatedCredentials);
  }

  const savedToken = sessionStorage.getItem(OPERATION_STORAGE_KEY);
  if (savedToken) {
    state.activeOperationToken = savedToken;
    await resumeOperation(savedToken);
  }
}

async function validateApi() {
  clearError();
  const credentials = readCredentials();
  if (!credentials) return;
  setBusy(el("validateBtn"), true, "检查中...");
  el("subscriptionInfo").textContent = "正在验证 Azure API";
  try {
    const data = await api("/api/azure/validate", { credentials });
    state.credentials = credentials;
    el("apiBadge").textContent = "API 正常";
    el("apiBadge").className = "badge success";
    el("subscriptionInfo").textContent = `${data.subscription.subscriptionName || "Azure Subscription"} · ${data.subscription.state}`;
    await loadLocations();

    if (state.operationMissing && state.activeOperationToken) {
      await offerRecovery(credentials);
    }
  } catch (error) {
    state.credentials = null;
    el("apiBadge").textContent = "验证失败";
    el("apiBadge").className = "badge error";
    el("subscriptionInfo").textContent = "";
    disableCreator();
    showError(error);
  } finally {
    setBusy(el("validateBtn"), false, "检查 API");
  }
}

async function loadLocations() {
  const data = await api("/api/azure/locations", { credentials: state.credentials });
  state.locations = data.locations;
  fields.location.innerHTML = `<option value="">请选择地区</option>` + state.locations.map((loc) =>
    `<option value="${escapeHtml(loc.name)}">${escapeHtml(loc.displayName)} (${escapeHtml(loc.name)})</option>`
  ).join("");
  fields.location.disabled = false;
  fields.image.disabled = false;
  el("createCard").classList.remove("disabledCard");
  el("skuMeta").textContent = `已读取 ${state.locations.length} 个 Azure 地区。型号列表仅显示与 x64 / Generation 2 系统镜像兼容的候选。`;
}

async function loadSkus() {
  clearError();
  const location = fields.location.value;
  state.skus = [];
  fields.vmSize.disabled = true;
  el("createBtn").disabled = true;
  if (!location) {
    fields.vmSize.innerHTML = `<option value="">先选择地区</option>`;
    return;
  }
  fields.vmSize.innerHTML = `<option value="">正在检查型号...</option>`;
  el("skuMeta").textContent = "正在读取 Resource SKUs、CPU 架构、Generation 和当前订阅配额，这一步可能稍慢。";
  try {
    const data = await api("/api/azure/skus", { credentials: state.credentials, location });
    state.skus = data.skus;
    const available = state.skus.filter((sku) => sku.available);
    fields.vmSize.innerHTML = `<option value="">请选择型号</option>` + available.map((sku) => {
      const specs = [sku.vCpus ? `${sku.vCpus}C` : "", sku.memoryGB ? `${sku.memoryGB}GB` : ""].filter(Boolean).join(" / ");
      return `<option value="${escapeHtml(sku.name)}">${escapeHtml(sku.name)}${specs ? ` · ${escapeHtml(specs)}` : ""}</option>`;
    }).join("");
    fields.vmSize.disabled = available.length === 0;
    el("createBtn").disabled = available.length === 0 || operationInProgress();
    el("skuMeta").textContent = `候选可用 ${data.availableCount} 个，订阅/配额/架构/Generation 限制 ${data.restrictedCount} 个。实际创建仍可能受实时容量影响。`;
  } catch (error) {
    fields.vmSize.innerHTML = `<option value="">读取失败</option>`;
    showError(error);
  }
}

async function createVps() {
  clearError();
  if (operationInProgress()) {
    showError(new Error("已有 Azure 创建任务正在执行，请等待当前任务完成。"));
    return;
  }

  const location = fields.location.value;
  const vmSize = fields.vmSize.value;
  const imageId = fields.image.value;
  if (!location || !vmSize || !imageId || !state.credentials) {
    showError(new Error("请先完成 API 验证并选择地区、型号和系统。"));
    return;
  }
  if (!window.confirm(`确认创建 ${vmSize}？\n\n防火墙将开放全部入站协议和全部端口。`)) return;

  const operationToken = generateOperationToken();
  state.activeOperationToken = operationToken;
  state.currentOperation = null;
  state.operationMissing = false;
  state.lostResourceGroup = null;
  sessionStorage.setItem(OPERATION_STORAGE_KEY, operationToken);

  setBusy(el("createBtn"), true, "创建中...");
  el("createStatus").textContent = "正在提交创建任务。任务提交后可以安全刷新页面，后台会继续执行。";

  try {
    const data = await api("/api/azure/create", {
      credentials: state.credentials,
      location,
      vmSize,
      imageId,
      operationToken,
    });
    handleOperation(data.operation);
    await pollOperation(operationToken);
  } catch (error) {
    // A transport error can happen after the server already accepted the job.
    // Try to recover the task using the token before declaring failure.
    if (!error.status) {
      await sleep(1500);
      await resumeOperation(operationToken);
      return;
    }
    sessionStorage.removeItem(OPERATION_STORAGE_KEY);
    state.activeOperationToken = null;
    setBusy(el("createBtn"), false, "创建 VPS");
    el("createStatus").textContent = "创建任务未开始。";
    showError(error);
  }
}

async function resumeOperation(operationToken) {
  try {
    const data = await api("/api/azure/operation", { operationToken });
    state.operationMissing = false;
    state.lostResourceGroup = null;
    handleOperation(data.operation);
    if (data.operation.status === "queued" || data.operation.status === "running") {
      await pollOperation(operationToken);
    }
  } catch (error) {
    if (error.code === "OPERATION_NOT_FOUND") {
      state.operationMissing = true;
      state.lostResourceGroup = error.details?.resourceGroup || null;
      setBusy(el("createBtn"), false, "创建 VPS");
      el("createStatus").textContent = state.lostResourceGroup
        ? `检测到上次任务记录已丢失。对应 Azure 资源组：${state.lostResourceGroup}。重新填写 API 并点击“检查 API”即可恢复或清理。`
        : "检测到上次任务记录已丢失。重新填写 API 并点击“检查 API”即可尝试恢复。";
      return;
    }
    el("createStatus").textContent = "暂时无法读取创建任务状态；任务 token 已保留，刷新页面可以继续检查。";
    showError(error);
  }
}

async function pollOperation(operationToken) {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (state.activeOperationToken === operationToken && Date.now() < deadline) {
    await sleep(2000);
    try {
      const data = await api("/api/azure/operation", { operationToken });
      handleOperation(data.operation);
      if (data.operation.status === "succeeded" || data.operation.status === "failed") return;
    } catch (error) {
      if (error.code === "OPERATION_NOT_FOUND") {
        state.operationMissing = true;
        state.lostResourceGroup = error.details?.resourceGroup || null;
        setBusy(el("createBtn"), false, "创建 VPS");
        el("createStatus").textContent = state.lostResourceGroup
          ? `后台任务记录丢失。Azure 资源组 ${state.lostResourceGroup} 可能仍存在；重新验证 API 后可自动恢复/清理。`
          : "后台任务记录丢失；重新验证 API 后可尝试恢复。";
        return;
      }
      el("createStatus").textContent = "网络暂时中断，后台任务仍可能继续。正在重试状态查询……";
    }
  }

  if (state.activeOperationToken === operationToken && operationInProgress()) {
    setBusy(el("createBtn"), false, "创建 VPS");
    el("createStatus").textContent = "状态查询已超过 30 分钟。任务 token 仍保留，刷新页面会继续检查；不要重复创建。";
  }
}

async function offerRecovery(credentials) {
  const resourceGroup = state.lostResourceGroup ? `\n\n对应资源组：${state.lostResourceGroup}` : "";
  const accepted = window.confirm(
    `检测到服务器曾丢失上一次创建任务的内存状态。${resourceGroup}\n\n是否使用当前 Azure API 尝试恢复？如果只有部分资源，程序会删除该资源组以避免继续计费。`,
  );
  if (!accepted) return;

  clearError();
  setBusy(el("createBtn"), true, "恢复中...");
  el("createStatus").textContent = "正在检查 Azure 中的上次资源。若 VM 已创建，将重新生成 root 密码；若只有部分资源，将整组清理。";
  try {
    const data = await api("/api/azure/recover", {
      credentials,
      operationToken: state.activeOperationToken,
    });
    state.operationMissing = false;
    handleOperation(data.operation);
    await pollOperation(state.activeOperationToken);
  } catch (error) {
    setBusy(el("createBtn"), false, "创建 VPS");
    showError(error);
  }
}

function handleOperation(operation) {
  state.currentOperation = operation;
  if (!operation) return;

  const suffix = operation.resourceGroup ? ` · ${operation.resourceGroup}` : "";
  if (operation.status === "queued" || operation.status === "running") {
    setBusy(el("createBtn"), true, "创建中...");
    el("createStatus").textContent = `${operation.detail || stageLabel(operation.stage)}${suffix}。可安全刷新页面。`;
    return;
  }

  setBusy(el("createBtn"), false, "创建 VPS");
  if (operation.status === "succeeded" && operation.result) {
    state.result = operation.result;
    renderResult(operation.result);
    el("createStatus").textContent = operation.result.recovered ? "创建任务已恢复完成，并重新生成了 root 密码。" : "创建完成。";
    clearError();
    return;
  }

  if (operation.status === "failed") {
    el("createStatus").textContent = operation.detail || "创建失败；如果资源组已建立，服务端已尝试回滚。";
    const error = new Error(operation.error?.message || "Azure 创建失败");
    error.code = operation.error?.code;
    showError(error);
  }
}

function renderImages() {
  fields.image.innerHTML = state.images.map((image) => `<option value="${escapeHtml(image.id)}">${escapeHtml(image.label)}</option>`).join("");
}

function renderResult(result) {
  el("resultIp").textContent = result.ip;
  el("resultUser").textContent = result.username;
  el("resultPassword").textContent = result.password;
  el("resultSize").textContent = result.vmSize;
  el("resultLocation").textContent = result.location;
  el("resultRg").textContent = result.resourceGroup;
  el("resultCard").classList.remove("hidden");
  el("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function copyResult() {
  if (!state.result) return;
  const text = `IP: ${state.result.ip}\n用户: ${state.result.username}\n密码: ${state.result.password}`;
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const button = el("copyBtn");
  const old = button.textContent;
  button.textContent = "已复制";
  setTimeout(() => { button.textContent = old; }, 1200);
}

function readCredentials() {
  const credentials = {
    tenantId: fields.tenantId.value.trim(),
    clientId: fields.clientId.value.trim(),
    clientSecret: fields.clientSecret.value,
    subscriptionId: fields.subscriptionId.value.trim(),
  };
  if (Object.values(credentials).some((value) => !value)) {
    showError(new Error("Tenant ID、Client ID、Client Secret、Subscription ID 都必须填写。"));
    return null;
  }
  return credentials;
}

function invalidateValidatedCredentials() {
  if (!state.credentials) return;
  state.credentials = null;
  state.locations = [];
  state.skus = [];
  el("apiBadge").textContent = "凭据已修改";
  el("apiBadge").className = "badge neutral";
  el("subscriptionInfo").textContent = "请重新检查 API";
  fields.location.innerHTML = `<option value="">请重新验证 API</option>`;
  fields.vmSize.innerHTML = `<option value="">先选择地区</option>`;
  disableCreator();
}

function disableCreator() {
  fields.location.disabled = true;
  fields.vmSize.disabled = true;
  fields.image.disabled = true;
  el("createBtn").disabled = true;
  el("createCard").classList.add("disabledCard");
}

function operationInProgress() {
  return state.currentOperation?.status === "queued" || state.currentOperation?.status === "running";
}

function generateOperationToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stageLabel(stage) {
  const labels = {
    queued: "任务排队中",
    starting: "正在启动任务",
    image_check: "正在检查系统镜像",
    resource_group: "正在创建资源组",
    nsg: "正在创建防火墙",
    vnet: "正在创建虚拟网络",
    public_ip: "正在申请公网 IP",
    nic: "正在创建网卡",
    vm: "正在创建虚拟机",
    root_access: "正在设置 root 登录",
    public_ip_wait: "正在读取公网 IP",
    recovery_check: "正在检查上次资源",
    recovery_vm: "正在恢复虚拟机",
    rollback: "正在回滚 Azure 资源",
    completed: "创建完成",
  };
  return labels[stage] || "正在处理 Azure 任务";
}

async function api(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `请求失败 (${response.status})`);
    error.code = data?.error?.code;
    error.status = response.status;
    error.details = data?.error || {};
    throw error;
  }
  return data;
}

function showError(error) {
  const box = el("errorBox");
  box.textContent = `${error.code ? `[${error.code}] ` : ""}${error.message || String(error)}`;
  box.classList.remove("hidden");
}
function clearError() { el("errorBox").classList.add("hidden"); }
function setBusy(button, busy, label) { button.disabled = busy; button.textContent = label; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]);
}
