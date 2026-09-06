const state = { credentials: null, locations: [], skus: [], images: [], result: null };
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
  el("skuMeta").textContent = `已读取 ${state.locations.length} 个 Azure 地区。`;
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
  el("skuMeta").textContent = "正在读取 Resource SKUs 和当前订阅限制，这一步可能稍慢。";
  try {
    const data = await api("/api/azure/skus", { credentials: state.credentials, location });
    state.skus = data.skus;
    const available = state.skus.filter((sku) => sku.available);
    fields.vmSize.innerHTML = `<option value="">请选择型号</option>` + available.map((sku) => {
      const specs = [sku.vCpus ? `${sku.vCpus}C` : "", sku.memoryGB ? `${sku.memoryGB}GB` : ""].filter(Boolean).join(" / ");
      return `<option value="${escapeHtml(sku.name)}">${escapeHtml(sku.name)}${specs ? ` · ${escapeHtml(specs)}` : ""}</option>`;
    }).join("");
    fields.vmSize.disabled = available.length === 0;
    el("createBtn").disabled = available.length === 0;
    el("skuMeta").textContent = `候选可用 ${data.availableCount} 个，订阅/地区限制 ${data.restrictedCount} 个。实际创建仍可能受实时容量影响。`;
  } catch (error) {
    fields.vmSize.innerHTML = `<option value="">读取失败</option>`;
    showError(error);
  }
}

async function createVps() {
  clearError();
  const location = fields.location.value;
  const vmSize = fields.vmSize.value;
  const imageId = fields.image.value;
  if (!location || !vmSize || !imageId || !state.credentials) {
    showError(new Error("请先完成 API 验证并选择地区、型号和系统。"));
    return;
  }
  if (!window.confirm(`确认创建 ${vmSize}？\n\n防火墙将开放全部入站协议和全部端口。`)) return;
  setBusy(el("createBtn"), true, "创建中...");
  el("createStatus").textContent = "Azure 正在创建网络、IP 和 VM，请不要刷新页面。";
  try {
    const data = await api("/api/azure/create", { credentials: state.credentials, location, vmSize, imageId });
    state.result = data.result;
    renderResult(data.result);
    el("createStatus").textContent = "创建完成";
  } catch (error) {
    el("createStatus").textContent = "创建失败；服务端已尝试删除本次新建的资源组。";
    showError(error);
  } finally {
    setBusy(el("createBtn"), false, "创建 VPS");
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
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]);
}
