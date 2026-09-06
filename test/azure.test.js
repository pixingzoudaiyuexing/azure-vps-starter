import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_PRESETS, publicAzureError } from "../src/azure.js";

test("ships expected Linux image presets", () => {
  assert.deepEqual(IMAGE_PRESETS.map((item) => item.id), ["ubuntu-24.04", "ubuntu-22.04", "debian-12"]);
});

test("maps common Azure capacity failures to Chinese message", () => {
  const result = publicAzureError({ code: "AllocationFailed", statusCode: 409, message: "capacity failed" });
  assert.equal(result.statusCode, 409);
  assert.equal(result.code, "AllocationFailed");
  assert.match(result.message, /容量不足/);
});

test("sanitizes Azure URLs from fallback error output", () => {
  const result = publicAzureError({ code: "Unknown", message: "request failed at https://management.azure.com/secret/path" });
  assert.doesNotMatch(result.message, /management\.azure\.com/);
  assert.match(result.message, /\[Azure URL\]/);
});

test("surfaces rollback warning without exposing credentials", () => {
  const result = publicAzureError({
    code: "Unknown",
    message: "create failed",
    cleanupWarning: "自动清理失败，请删除资源组 avs-deadbeef。",
  });
  assert.match(result.message, /avs-deadbeef/);
});
