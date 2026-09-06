const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LOCATION_RE = /^[a-z0-9-]{2,40}$/i;
const VM_SIZE_RE = /^[A-Za-z0-9_-]{2,80}$/;
const OPERATION_TOKEN_RE = /^[0-9a-f]{64}$/i;

export function requireCredentials(input) {
  const credentials = input?.credentials ?? input;
  const fields = ["tenantId", "clientId", "clientSecret", "subscriptionId"];
  for (const field of fields) {
    if (typeof credentials?.[field] !== "string" || credentials[field].trim() === "") {
      throw badRequest(`缺少 ${field}`);
    }
  }

  const normalized = {
    tenantId: credentials.tenantId.trim(),
    clientId: credentials.clientId.trim(),
    clientSecret: credentials.clientSecret,
    subscriptionId: credentials.subscriptionId.trim(),
  };

  for (const field of ["tenantId", "clientId", "subscriptionId"]) {
    if (!GUID_RE.test(normalized[field])) {
      throw badRequest(`${field} 格式不正确`);
    }
  }

  if (normalized.clientSecret.length > 2048) {
    throw badRequest("Client Secret 过长");
  }

  return normalized;
}

export function requireLocation(value) {
  if (typeof value !== "string" || !LOCATION_RE.test(value)) {
    throw badRequest("地区参数不正确");
  }
  return value.toLowerCase();
}

export function requireVmSize(value) {
  if (typeof value !== "string" || !VM_SIZE_RE.test(value)) {
    throw badRequest("VM 型号参数不正确");
  }
  return value;
}

export function requireImageId(value, allowedIds) {
  if (typeof value !== "string" || !allowedIds.includes(value)) {
    throw badRequest("系统镜像参数不正确");
  }
  return value;
}

export function requireOperationToken(value) {
  if (typeof value !== "string" || !OPERATION_TOKEN_RE.test(value)) {
    throw badRequest("创建任务标识不正确");
  }
  return value.toLowerCase();
}

export function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "BAD_REQUEST";
  return error;
}
