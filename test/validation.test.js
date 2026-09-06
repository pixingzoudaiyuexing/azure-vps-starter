import test from "node:test";
import assert from "node:assert/strict";
import { requireCredentials, requireImageId, requireLocation, requireVmSize } from "../src/validation.js";

const valid = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  clientId: "22222222-2222-2222-2222-222222222222",
  clientSecret: "secret-value",
  subscriptionId: "33333333-3333-3333-3333-333333333333",
};

test("accepts normalized Azure credentials", () => {
  assert.deepEqual(requireCredentials({ credentials: valid }), valid);
});

test("rejects malformed Azure identifiers", () => {
  assert.throws(() => requireCredentials({ ...valid, tenantId: "not-a-guid" }), /tenantId/);
  assert.throws(() => requireCredentials({ ...valid, subscriptionId: "11111111-1111" }), /subscriptionId/);
});

test("validates provisioning selectors", () => {
  assert.equal(requireLocation("JapanEast"), "japaneast");
  assert.equal(requireVmSize("Standard_B1s"), "Standard_B1s");
  assert.equal(requireImageId("debian-12", ["debian-12"]), "debian-12");
  assert.throws(() => requireLocation("../../etc/passwd"));
  assert.throws(() => requireVmSize("bad size"));
  assert.throws(() => requireImageId("unknown", ["debian-12"]));
});
