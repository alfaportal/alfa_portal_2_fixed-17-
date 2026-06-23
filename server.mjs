import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import panelRouter from "./src/panel/routes.js";
import { checkPanelDbHealth, getSupabaseClient, panelDbConfigured } from "./src/panel/supabase.js";

const require = createRequire(import.meta.url);
const chatModule = require("./netlify-functions/chat.js");

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8080;

const GO_REDIRECTS = {
  "/api/go/stake": "https://stake.com/?c=7jlHcmRU",
  "/api/go/1win": "https://one-vv407.com/betting?p=pgoj&sharebet=alfaportalvip",
  "/api/go/roobet": "https://roobet.com/",
  "/api/go/bcgame": "https://bc.game/",
  "/api/go/rollbit": "https://rollbit.com/",
  "/api/go/ggpoker": "https://ggpoker.com/?btag=ALFAPORTALVIP",
};

function applyHeaders(res, headers = {}) {
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) res.setHeader(key, value);
  }
}

function setupPinoBundlerOverrides(nfDir) {
  const resolveWorker = (file) => path.join(nfDir, file);
  globalThis.__bundlerPathsOverrides = {
    ...(globalThis.__bundlerPathsOverrides || {}),
    "thread-stream-worker": resolveWorker("thread-stream-worker.mjs"),
    "pino-worker": resolveWorker("pino-worker.mjs"),
    "pino/file": resolveWorker("pino-file.mjs"),
    "pino-pretty": resolveWorker("pino-pretty.mjs"),
  };
}

let apiHandlerPromise = null;

function loadApiHandler() {
  if (!apiHandlerPromise) {
    apiHandlerPromise = (async () => {
      const nfDir = path.join(rootDir, "netlify-functions");
      setupPinoBundlerOverrides(nfDir);
      const mod = await import("./netlify-functions/api.mjs");
      return mod.handler;
    })().catch((err) => {
      console.error("[api] failed to load bundled API:", err);
      apiHandlerPromise = null;
      throw err;
    });
  }
  return apiHandlerPromise;
}

function createServerlessBridge(getHandler) {
  return async (req, res) => {
    try {
      const handler = await getHandler();
      const event = {
        httpMethod: req.method,
        path: req.path,
        rawUrl: req.originalUrl,
        headers: req.headers,
        queryStringParameters: Object.keys(req.query).length ? req.query : undefined,
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : typeof req.body === "string"
              ? req.body
              : req.body != null
                ? JSON.stringify(req.body)
                : undefined,
        isBase64Encoded: false,
      };
      const result = await handler(event, {});
      res.status(result?.statusCode ?? 500);
      applyHeaders(res, result?.headers);
      res.send(result?.body ?? "");
    } catch (err) {
      console.error("[api]", err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
}

async function runChat(req, res) {
  try {
    const event = {
      httpMethod: req.method,
      headers: req.headers,
      body:
        typeof req.body === "string"
          ? req.body
          : req.body != null
            ? JSON.stringify(req.body)
            : null,
    };
    const result = await chatModule.handler(event);
    res.status(result?.statusCode ?? 500);
    applyHeaders(res, result?.headers);
    res.send(result?.body ?? "");
  } catch (err) {
    console.error("[chat]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Chat error" });
  }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

for (const [route, target] of Object.entries(GO_REDIRECTS)) {
  app.get(route, (_req, res) => res.redirect(302, target));
}

app.post("/.netlify/functions/chat", runChat);
app.post("/api/chat", runChat);

app.get("/panel", (_req, res) => res.redirect(302, "/alfa-panel.html"));
app.get("/admin", (_req, res) => res.redirect(302, "/alfa-panel.html"));
app.use("/api/panel", panelRouter);

const apiBridge = createServerlessBridge(loadApiHandler);
app.use((req, res, next) => {
  if (
    !req.path.startsWith("/api/")
    || req.path === "/api/healthz"
    || req.path.startsWith("/api/panel")
  ) {
    return next();
  }
  return apiBridge(req, res);
});

app.use(
  express.static(rootDir, {
    index: false,
    dotfiles: "ignore",
  }),
);

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  const basename = path.basename(req.path);
  if (basename.includes(".")) {
    return res.status(404).send("Not found");
  }
  res.sendFile(path.join(rootDir, "index.html"));
});

app.listen(port, "0.0.0.0", async () => {
  console.log(`[alfaportalvip] listening on ${port}`);
  if (!panelDbConfigured()) {
    console.warn("[alfaportalvip] Supabase panel DB not configured (SUPABASE_URL + SERVICE_ROLE)");
    return;
  }
  getSupabaseClient();
  try {
    const health = await checkPanelDbHealth();
    if (health.db) {
      console.log("[alfaportalvip] Supabase panel DB OK (panel_settings readable)");
    } else {
      console.warn("[alfaportalvip] Supabase panel DB issue:", health.error, health.hint || "");
    }
  } catch (err) {
    console.warn("[alfaportalvip] Supabase panel DB health check failed:", err.message);
  }
});
