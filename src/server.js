import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import {
  IMAGE_PRESETS,
  createVps,
  listLocations,
  listVmSkus,
  publicAzureError,
  validateAzureCredentials,
} from "./azure.js";
import { requireCredentials, requireImageId, requireLocation, requireVmSize } from "./validation.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "64kb" }));
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use("/api", rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/healthz", (_req, res) => res.json({ ok: true, service: "azure-vps-starter" }));
app.get("/api/meta", (_req, res) => res.json({ images: IMAGE_PRESETS.map(({ id, label }) => ({ id, label })) }));

app.post("/api/azure/validate", asyncRoute(async (req, res) => {
  const credentials = requireCredentials(req.body);
  const result = await validateAzureCredentials(credentials);
  res.json({ ok: true, subscription: result });
}));

app.post("/api/azure/locations", asyncRoute(async (req, res) => {
  const credentials = requireCredentials(req.body);
  const locations = await listLocations(credentials);
  res.json({ ok: true, locations });
}));

app.post("/api/azure/skus", asyncRoute(async (req, res) => {
  const credentials = requireCredentials(req.body);
  const location = requireLocation(req.body.location);
  const skus = await listVmSkus(credentials, location);
  res.json({
    ok: true,
    location,
    availableCount: skus.filter((item) => item.available).length,
    restrictedCount: skus.filter((item) => !item.available).length,
    skus,
  });
}));

app.post("/api/azure/create", asyncRoute(async (req, res) => {
  const credentials = requireCredentials(req.body);
  const location = requireLocation(req.body.location);
  const vmSize = requireVmSize(req.body.vmSize);
  const imageId = requireImageId(req.body.imageId, IMAGE_PRESETS.map((item) => item.id));

  const skus = await listVmSkus(credentials, location);
  const selected = skus.find((item) => item.name === vmSize);
  if (!selected) {
    const error = new Error("所选 VM 型号不属于该地区");
    error.statusCode = 400;
    error.code = "SKU_NOT_IN_LOCATION";
    throw error;
  }
  if (!selected.available) {
    const error = new Error(`所选 VM 型号受当前订阅限制：${selected.restrictionReasons.join(", ") || "Restricted"}`);
    error.statusCode = 409;
    error.code = "SKU_RESTRICTED";
    throw error;
  }

  const result = await createVps({ credentials, location, vmSize, imageId });
  res.status(201).json({ ok: true, result });
}));

app.use(express.static(publicDir, { maxAge: "1h", etag: true }));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((error, _req, res, _next) => {
  if (error?.code === "BAD_REQUEST" || error?.statusCode === 400 || error?.statusCode === 409) {
    res.status(error.statusCode ?? 400).json({ ok: false, error: { code: error.code ?? "BAD_REQUEST", message: error.message } });
    return;
  }
  const safe = publicAzureError(error);
  console.error(`[azure-vps-starter] ${safe.code}: ${safe.message}`);
  res.status(safe.statusCode).json({ ok: false, error: { code: safe.code, message: safe.message } });
});

app.listen(port, host, () => console.log(`azure-vps-starter listening on http://${host}:${port}`));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
