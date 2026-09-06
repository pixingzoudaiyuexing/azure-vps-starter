import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("preserves operation token on network and 5xx create failures", () => {
  assert.match(appSource, /if \(!error\.status \|\| error\.status >= 500\)/);
});

test("only clears operation storage after non-ambiguous create failure", () => {
  const guardIndex = appSource.indexOf("if (!error.status || error.status >= 500)");
  const clearIndex = appSource.indexOf("sessionStorage.removeItem(OPERATION_STORAGE_KEY)", guardIndex);
  assert.ok(guardIndex >= 0, "ambiguous failure guard must exist");
  assert.ok(clearIndex > guardIndex, "token clearing must happen after the ambiguous failure early return");
});

test("treats a missing or unresolved saved operation as in progress", () => {
  assert.match(appSource, /if \(!state\.activeOperationToken\) return false;/);
  assert.match(appSource, /if \(state\.operationMissing \|\| !state\.currentOperation\) return true;/);
});
