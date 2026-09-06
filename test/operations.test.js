import test from "node:test";
import assert from "node:assert/strict";
import {
  createOperation,
  forgetOperation,
  getOperation,
  markOperationFailed,
  markOperationRunning,
  markOperationSucceeded,
  operationIdFromToken,
  operationResourceGroupFromToken,
  operationSuffixFromToken,
  updateOperationStage,
} from "../src/operations.js";

const token = "ab".repeat(32);

test("operation identifiers are deterministic without exposing the full token", () => {
  assert.equal(operationIdFromToken(token).length, 24);
  assert.equal(operationSuffixFromToken(token).length, 12);
  assert.equal(operationResourceGroupFromToken(token), `avs-${operationSuffixFromToken(token)}`);
  assert.ok(!operationIdFromToken(token).includes(token));
});

test("operation creation is idempotent for the same token", () => {
  forgetOperation(token);
  const first = createOperation(token, { location: "japaneast", vmSize: "Standard_B1s", mode: "create" });
  const second = createOperation(token, { location: "westus", vmSize: "Standard_D2s_v5", mode: "create" });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.operation.metadata.location, "japaneast");
  assert.equal(second.operation.metadata.vmSize, "Standard_B1s");
  forgetOperation(token);
});

test("operation lifecycle retains result but no Azure credentials", () => {
  forgetOperation(token);
  createOperation(token, { location: "japaneast", secret: "must-not-be-kept" });
  markOperationRunning(token);
  updateOperationStage(token, "vm", "creating vm");

  let snapshot = getOperation(token);
  assert.equal(snapshot.status, "running");
  assert.equal(snapshot.stage, "vm");
  assert.equal(snapshot.metadata.secret, undefined);

  markOperationSucceeded(token, { ip: "203.0.113.1", username: "root", password: "test-password" });
  snapshot = getOperation(token);
  assert.equal(snapshot.status, "succeeded");
  assert.equal(snapshot.result.ip, "203.0.113.1");
  assert.equal(snapshot.result.password, "test-password");
  forgetOperation(token);
});

test("failed operations return only safe error fields", () => {
  forgetOperation(token);
  createOperation(token, {});
  markOperationFailed(token, { code: "AllocationFailed", message: "capacity unavailable", extraSecret: "nope" });
  const snapshot = getOperation(token);
  assert.deepEqual(snapshot.error, { code: "AllocationFailed", message: "capacity unavailable" });
  forgetOperation(token);
});
