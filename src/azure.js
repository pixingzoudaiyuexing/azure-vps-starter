import crypto from "node:crypto";
import { ClientSecretCredential } from "@azure/identity";
import { ComputeManagementClient } from "@azure/arm-compute";
import { NetworkManagementClient } from "@azure/arm-network";
import { ResourceManagementClient } from "@azure/arm-resources";
import { SubscriptionClient } from "@azure/arm-resources-subscriptions";

export const IMAGE_PRESETS = [
  { id: "ubuntu-24.04", label: "Ubuntu 24.04 LTS", publisher: "Canonical", offer: "ubuntu-24_04-lts", sku: "server", version: "latest" },
  { id: "ubuntu-22.04", label: "Ubuntu 22.04 LTS", publisher: "Canonical", offer: "0001-com-ubuntu-server-jammy", sku: "22_04-lts", version: "latest" },
  { id: "debian-12", label: "Debian 12", publisher: "Debian", offer: "debian-12", sku: "12", version: "latest" },
];

export function createAzureClients(credentials) {
  const credential = new ClientSecretCredential(credentials.tenantId, credentials.clientId, credentials.clientSecret);
  return {
    credential,
    subscription: new SubscriptionClient(credential),
    compute: new ComputeManagementClient(credential, credentials.subscriptionId),
    network: new NetworkManagementClient(credential, credentials.subscriptionId),
    resources: new ResourceManagementClient(credential, credentials.subscriptionId),
  };
}

export async function validateAzureCredentials(credentials) {
  const { subscription } = createAzureClients(credentials);
  const result = await subscription.subscriptions.get(credentials.subscriptionId);
  return {
    subscriptionId: result.subscriptionId ?? credentials.subscriptionId,
    subscriptionName: result.displayName ?? "",
    tenantId: result.tenantId ?? credentials.tenantId,
    state: result.state ?? "Unknown",
  };
}

export async function listLocations(credentials) {
  const { subscription } = createAzureClients(credentials);
  const locations = [];
  for await (const location of subscription.subscriptions.listLocations(credentials.subscriptionId)) {
    if (!location.name || !location.displayName) continue;
    if (location.metadata?.regionType && location.metadata.regionType !== "Physical") continue;
    locations.push({
      name: location.name,
      displayName: location.displayName,
      regionalDisplayName: location.regionalDisplayName ?? "",
      geographyGroup: location.metadata?.geographyGroup ?? "",
    });
  }
  return locations.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listVmSkus(credentials, location) {
  const { compute } = createAzureClients(credentials);
  const target = location.toLowerCase();
  const rows = [];
  for await (const sku of compute.resourceSkus.list()) {
    if (sku.resourceType !== "virtualMachines" || !sku.name) continue;
    const skuLocations = (sku.locations ?? []).map((item) => item.toLowerCase());
    if (!skuLocations.includes(target)) continue;
    const restrictions = (sku.restrictions ?? []).filter((restriction) => {
      if (restriction.type !== "Location") return false;
      const locations = [
        ...(restriction.values ?? []),
        ...(restriction.restrictionInfo?.locations ?? []),
      ].map((item) => item.toLowerCase());
      return locations.length === 0 || locations.includes(target);
    });
    const caps = Object.fromEntries((sku.capabilities ?? []).filter((cap) => cap.name).map((cap) => [cap.name, cap.value ?? ""]));
    rows.push({
      name: sku.name,
      family: sku.family ?? "",
      tier: sku.tier ?? "",
      available: restrictions.length === 0,
      restrictionReasons: [...new Set(restrictions.map((item) => item.reasonCode ?? item.type ?? "Restricted"))],
      vCpus: numberCapability(caps.vCPUs ?? caps.vCPUsAvailable),
      memoryGB: numberCapability(caps.MemoryGB),
      maxDataDiskCount: numberCapability(caps.MaxDataDiskCount),
      zones: zoneListForLocation(sku.locationInfo, target),
    });
  }
  rows.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if ((a.vCpus ?? 0) !== (b.vCpus ?? 0)) return (a.vCpus ?? 0) - (b.vCpus ?? 0);
    if ((a.memoryGB ?? 0) !== (b.memoryGB ?? 0)) return (a.memoryGB ?? 0) - (b.memoryGB ?? 0);
    return a.name.localeCompare(b.name);
  });
  return rows;
}

export async function createVps({ credentials, location, vmSize, imageId }) {
  const clients = createAzureClients(credentials);
  const image = IMAGE_PRESETS.find((item) => item.id === imageId);
  if (!image) throw new Error("Unsupported image preset");

  const suffix = crypto.randomBytes(4).toString("hex");
  const names = {
    resourceGroup: `avs-${suffix}`,
    vm: `vps-${suffix}`,
    vnet: `vnet-${suffix}`,
    subnet: `subnet-${suffix}`,
    nsg: `nsg-${suffix}`,
    publicIp: `pip-${suffix}`,
    nic: `nic-${suffix}`,
  };
  const rootPassword = generatePassword();
  const adminUsername = "azureadmin";

  await ensureImageAvailable(clients.compute, location, image);

  let resourceGroupCreated = false;
  try {
    await clients.resources.resourceGroups.createOrUpdate(names.resourceGroup, { location });
    resourceGroupCreated = true;

    const nsg = await clients.network.networkSecurityGroups.beginCreateOrUpdateAndWait(names.resourceGroup, names.nsg, {
      location,
      securityRules: [{
        name: "AllowAllInbound",
        priority: 100,
        direction: "Inbound",
        access: "Allow",
        protocol: "*",
        sourcePortRange: "*",
        destinationPortRange: "*",
        sourceAddressPrefix: "*",
        destinationAddressPrefix: "*",
        description: "azure-vps-starter: intentionally allow all inbound traffic",
      }],
    });

    const vnet = await clients.network.virtualNetworks.beginCreateOrUpdateAndWait(names.resourceGroup, names.vnet, {
      location,
      addressSpace: { addressPrefixes: ["10.30.0.0/16"] },
      subnets: [{ name: names.subnet, addressPrefix: "10.30.1.0/24" }],
    });
    const subnet = vnet.subnets?.find((item) => item.name === names.subnet);
    if (!subnet?.id) throw new Error("Azure 未返回 Subnet ID");

    const publicIp = await clients.network.publicIPAddresses.beginCreateOrUpdateAndWait(names.resourceGroup, names.publicIp, {
      location,
      publicIPAllocationMethod: "Static",
      sku: { name: "Standard" },
    });
    if (!publicIp.id) throw new Error("Azure 未返回 Public IP 资源 ID");
    if (!nsg.id) throw new Error("Azure 未返回 NSG ID");

    const nic = await clients.network.networkInterfaces.beginCreateOrUpdateAndWait(names.resourceGroup, names.nic, {
      location,
      networkSecurityGroup: { id: nsg.id },
      ipConfigurations: [{
        name: "ipconfig1",
        privateIPAllocationMethod: "Dynamic",
        subnet: { id: subnet.id },
        publicIPAddress: { id: publicIp.id },
      }],
    });
    if (!nic.id) throw new Error("Azure 未返回 NIC ID");

    const customData = Buffer.from(rootCloudInit(rootPassword), "utf8").toString("base64");
    const poller = await clients.compute.virtualMachines.beginCreateOrUpdate(names.resourceGroup, names.vm, {
      location,
      hardwareProfile: { vmSize },
      storageProfile: {
        imageReference: { publisher: image.publisher, offer: image.offer, sku: image.sku, version: image.version },
        osDisk: { createOption: "FromImage", deleteOption: "Delete", managedDisk: { storageAccountType: "Standard_LRS" } },
      },
      osProfile: {
        computerName: names.vm,
        adminUsername,
        adminPassword: rootPassword,
        customData,
        linuxConfiguration: { disablePasswordAuthentication: false },
      },
      networkProfile: { networkInterfaces: [{ id: nic.id, primary: true, deleteOption: "Delete" }] },
    });
    await poller.pollUntilDone();

    const freshIp = await clients.network.publicIPAddresses.get(names.resourceGroup, names.publicIp);
    if (!freshIp.ipAddress) throw new Error("VM 已创建，但暂未获得公网 IP");

    return {
      resourceGroup: names.resourceGroup,
      vmName: names.vm,
      location,
      vmSize,
      image: image.label,
      ip: freshIp.ipAddress,
      username: "root",
      password: rootPassword,
      firewall: "全部入站协议 / 全端口 / 任意来源",
    };
  } catch (error) {
    if (resourceGroupCreated) {
      try {
        await clients.resources.resourceGroups.beginDeleteAndWait(names.resourceGroup);
      } catch {
        error.cleanupWarning = `自动清理失败，请登录 Azure Portal 检查并删除资源组 ${names.resourceGroup}，避免产生额外费用。`;
      }
    }
    throw error;
  }
}

async function ensureImageAvailable(compute, location, image) {
  const versions = await compute.virtualMachineImages.list(location, image.publisher, image.offer, image.sku);
  if (!Array.isArray(versions) || versions.length === 0) {
    const error = new Error(`${image.label} 在 ${location} 未找到可用 Marketplace 镜像`);
    error.code = "IMAGE_NOT_AVAILABLE";
    error.statusCode = 409;
    throw error;
  }
}

function rootCloudInit(password) {
  return `#!/bin/bash\nset -euo pipefail\necho 'root:${password}' | chpasswd\ninstall -d -m 0755 /etc/ssh/sshd_config.d\ncat >/etc/ssh/sshd_config.d/99-azure-vps-starter.conf <<'CFG'\nPermitRootLogin yes\nPasswordAuthentication yes\nCFG\nif command -v systemctl >/dev/null 2>&1; then\n  systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true\nfi\n`;
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let body = "";
  for (const byte of crypto.randomBytes(20)) body += alphabet[byte % alphabet.length];
  return `Aa1!${body}`;
}

function numberCapability(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function zoneListForLocation(locationInfo, target) {
  const info = (locationInfo ?? []).find((item) => item.location?.toLowerCase() === target);
  return info?.zones ?? [];
}

export function publicAzureError(error) {
  const code = error?.code ?? error?.details?.error?.code ?? "AZURE_ERROR";
  const statusCode = error?.statusCode ?? error?.response?.status ?? 502;
  let message = error?.message ?? error?.details?.error?.message ?? "Azure 请求失败";
  message = String(message).replace(/https?:\/\/[^\s]+/g, "[Azure URL]").slice(0, 1200);
  const friendly = friendlyMessage(code, message);
  const cleanupWarning = error?.cleanupWarning ? ` ${error.cleanupWarning}` : "";
  return {
    statusCode: Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : 502,
    code: String(code),
    message: `${friendly}${cleanupWarning}`,
  };
}

function friendlyMessage(code, fallback) {
  const messages = {
    AuthenticationFailed: "Azure API 认证失败，请检查 Tenant ID / Client ID / Client Secret。",
    AuthorizationFailed: "Azure API 已认证，但当前身份权限不足。请检查 Subscription 权限。",
    InvalidAuthenticationToken: "Azure 登录令牌无效，请重新检查 API 凭据。",
    ExpiredAuthenticationToken: "Azure 登录令牌已过期，请重新提交 API 凭据。",
    InvalidSubscriptionId: "Subscription ID 无效。",
    SubscriptionNotFound: "找不到该 Azure Subscription。",
    SkuNotAvailable: "该地区当前无法分配所选 VM 型号，请换地区或型号后重试。",
    AllocationFailed: "Azure 当前容量不足，无法分配该型号，请稍后重试或换地区/型号。",
    OperationNotAllowed: "Azure 配额或订阅策略不允许本次创建。",
  };
  return messages[code] ?? fallback;
}
