import { Router } from "express";
import {
  hashAdminPassword,
  panelAuthMiddleware,
  signPanelToken,
  verifyAdminPassword,
} from "./auth.js";
import {
  checkPanelDbHealth,
  panelDbConfigured,
  sbDelete,
  sbInsert,
  sbSelect,
  sbUpdate,
} from "./supabase.js";

const router = Router();

function mapAgent(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    pass: row.pass,
    pct: row.pct ?? 20,
    status: row.status ?? "active",
    level: row.level,
    parentId: row.parent_id ?? null,
    date: row.created_at,
  };
}

function mapPlayer(row, agentName = "") {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    tel: row.tel ?? "",
    platform: row.platform ?? "Stake",
    note: row.note ?? "",
    agentId: row.agent_id,
    agentName,
    date: row.created_at,
  };
}

function mapBet(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    playerName: row.player_name ?? "",
    agentId: row.agent_id,
    agentName: row.agent_name ?? "",
    platform: row.platform ?? "Stake",
    sport: row.sport ?? "",
    event: row.event ?? "",
    amount: Number(row.amount ?? 0),
    coef: Number(row.coef ?? 1),
    status: row.status ?? "open",
    note: row.note ?? "",
    date: row.created_at,
  };
}

async function getSettings() {
  let rows = await sbSelect("panel_settings", "?id=eq.1&limit=1");
  if (!rows.length) {
    const hash = await hashAdminPassword("admin123");
    const inserted = await sbInsert("panel_settings", {
      id: 1,
      admin_secret: "alfa-vip2024",
      admin_password_hash: hash,
      base_value: 10,
      main_url: "https://alfaportal-vip.com",
    });
    rows = Array.isArray(inserted) ? inserted : [inserted];
  }
  const s = rows[0];
  return {
    al: s.admin_secret,
    ap: null,
    bv: Number(s.base_value ?? 10),
    url: s.main_url || "https://alfaportal-vip.com",
    _hash: s.admin_password_hash,
  };
}

function cfgForClient(settings) {
  return { al: settings.al, bv: settings.bv, url: settings.url };
}

function agentIdsForUser(user, agents) {
  if (user.role === "admin") return agents.map((a) => a.id);
  if (user.role === "agent" && user.level === "super") {
    return agents
      .filter((a) => a.id === user.agentId || a.parentId === user.agentId)
      .map((a) => a.id);
  }
  if (user.role === "agent") return [user.agentId];
  return [];
}

function canAccessAgent(user, agent, allAgents) {
  if (user.role === "admin") return true;
  if (user.role !== "agent") return false;
  if (agent.id === user.agentId) return true;
  if (user.level === "super" && agent.parentId === user.agentId) return true;
  return false;
}

router.get("/health", async (_req, res) => {
  try {
    const health = await checkPanelDbHealth();
    res.json({ ok: true, ...health });
  } catch (err) {
    console.error("[panel/health]", err);
    res.json({
      ok: true,
      configured: panelDbConfigured(),
      db: false,
      error: err.message || "Health check failed",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    if (!panelDbConfigured()) {
      res.status(503).json({ gabim: "Panel DB nuk është konfiguruar (SUPABASE_URL + SERVICE_ROLE)." });
      return;
    }
    const role = req.body?.role === "agent" ? "agent" : "admin";
    const secret = String(req.body?.secret ?? "").trim();
    const password = String(req.body?.password ?? "").trim();

    const settings = await getSettings();

    if (role === "admin") {
      if (secret !== settings.al) {
        res.status(401).json({ gabim: "Kod sekret ose fjalëkalim i gabuar." });
        return;
      }
      const ok = await verifyAdminPassword(password, settings._hash);
      if (!ok) {
        res.status(401).json({ gabim: "Kod sekret ose fjalëkalim i gabuar." });
        return;
      }
      const token = signPanelToken({ role: "admin" });
      res.json({ token, role: "admin", cfg: cfgForClient(settings) });
      return;
    }

    const agents = (await sbSelect("panel_agents", "?select=*&order=created_at.asc")) || [];
    const match = agents.find(
      (a) =>
        (a.code === password || a.pass === password) && a.status === "active",
    );
    if (!match) {
      res.status(401).json({ gabim: "Kodi i agjentit nuk u gjet." });
      return;
    }
    const token = signPanelToken({
      role: "agent",
      agentId: match.id,
      level: match.level,
    });
    res.json({
      token,
      role: "agent",
      agent: mapAgent(match),
      cfg: cfgForClient(settings),
    });
  } catch (err) {
    console.error("[panel/login]", err);
    res.status(500).json({ gabim: "Gabim serveri gjatë login." });
  }
});

router.get("/bootstrap", panelAuthMiddleware, async (req, res) => {
  try {
    const settings = await getSettings();
    const agentRows = await sbSelect("panel_agents", "?select=*&order=created_at.asc");
    let agents = agentRows.map(mapAgent);

    if (req.panelUser.role === "agent") {
      agents = agents.filter((a) => canAccessAgent(req.panelUser, a, agents));
    }

    const allowedIds = agentIdsForUser(req.panelUser, agents);
    if (!allowedIds.length) {
      res.json({
        cfg: cfgForClient(settings),
        agents,
        players: [],
        bets: [],
      });
      return;
    }
    const idFilter = allowedIds.map((id) => `"${id}"`).join(",");

    const playerRows = await sbSelect(
      "panel_players",
      `?select=*&agent_id=in.(${idFilter})&order=created_at.desc`,
    );
    const betRows = await sbSelect(
      "panel_bets",
      `?select=*&agent_id=in.(${idFilter})&order=created_at.desc`,
    );

    const agentById = new Map(agents.map((a) => [a.id, a]));
    const players = playerRows.map((p) =>
      mapPlayer(p, agentById.get(p.agent_id)?.name ?? ""),
    );
    const bets = betRows.map(mapBet);

    res.json({
      cfg: cfgForClient(settings),
      agents,
      players,
      bets,
    });
  } catch (err) {
    console.error("[panel/bootstrap]", err);
    res.status(500).json({ gabim: "Nuk u ngarkuan të dhënat." });
  }
});

router.post("/agents", panelAuthMiddleware, async (req, res) => {
  try {
    const user = req.panelUser;
    const body = req.body || {};
    const name = String(body.name ?? "").trim();
    const pass = String(body.pass ?? "").trim();
    const level = body.level === "super" ? "super" : "sub";
    let parentId = body.parentId || null;

    if (!name || !pass) {
      res.status(400).json({ gabim: "Emri dhe fjalëkalimi kërkohen." });
      return;
    }

    if (user.role === "agent") {
      if (user.level !== "super") {
        res.status(403).json({ gabim: "Vetëm super-agenti shton sub-agentë." });
        return;
      }
      if (level !== "sub") {
        res.status(403).json({ gabim: "Agjenti mund të shtojë vetëm sub-agentë." });
        return;
      }
      parentId = user.agentId;
    }

    const row = await sbInsert("panel_agents", {
      name,
      code: String(body.code ?? "").trim() || `AGT-${Date.now().toString(36).toUpperCase()}`,
      pass,
      pct: Number(body.pct) || 20,
      status: body.status || "active",
      level,
      parent_id: parentId,
    });
    const saved = Array.isArray(row) ? row[0] : row;
    res.status(201).json({ agent: mapAgent(saved) });
  } catch (err) {
    console.error("[panel/agents POST]", err);
    res.status(500).json({ gabim: "Agjenti nuk u ruajt." });
  }
});

router.patch("/agents/:id", panelAuthMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const agents = (await sbSelect("panel_agents", `?id=eq.${id}&limit=1`)) || [];
    const existing = agents[0];
    if (!existing) {
      res.status(404).json({ gabim: "Agjenti nuk u gjet." });
      return;
    }
    if (!canAccessAgent(req.panelUser, mapAgent(existing), [])) {
      res.status(403).json({ gabim: "Nuk keni akses." });
      return;
    }
    if (req.panelUser.role === "agent" && existing.id !== req.panelUser.agentId && existing.parent_id !== req.panelUser.agentId) {
      res.status(403).json({ gabim: "Nuk keni akses." });
      return;
    }

    const patch = {};
    const body = req.body || {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.code != null) patch.code = String(body.code).trim();
    if (body.pass != null) patch.pass = String(body.pass).trim();
    if (body.pct != null) patch.pct = Number(body.pct) || 20;
    if (body.status != null) patch.status = body.status;
    if (req.panelUser.role === "admin" && body.level != null) patch.level = body.level;
    if (req.panelUser.role === "admin" && body.parentId !== undefined) {
      patch.parent_id = body.parentId || null;
    }

    const updated = await sbUpdate("panel_agents", `?id=eq.${id}`, patch);
    res.json({ agent: mapAgent(updated) });
  } catch (err) {
    console.error("[panel/agents PATCH]", err);
    res.status(500).json({ gabim: "Agjenti nuk u përditësua." });
  }
});

router.delete("/agents/:id", panelAuthMiddleware, async (req, res) => {
  try {
    if (req.panelUser.role !== "admin") {
      res.status(403).json({ gabim: "Vetëm admini fshin agjentë." });
      return;
    }
    const id = req.params.id;
    await sbDelete("panel_bets", `?agent_id=eq.${id}`);
    await sbDelete("panel_players", `?agent_id=eq.${id}`);
    await sbDelete("panel_agents", `?parent_id=eq.${id}`);
    await sbDelete("panel_agents", `?id=eq.${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[panel/agents DELETE]", err);
    res.status(500).json({ gabim: "Agjenti nuk u fshi." });
  }
});

router.post("/players", panelAuthMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name ?? "").trim();
    let agentId = body.agentId;
    if (!name) {
      res.status(400).json({ gabim: "Emri i lojtarit kërkohet." });
      return;
    }
    if (req.panelUser.role === "agent") {
      agentId = agentId || req.panelUser.agentId;
    }
    const agents = (await sbSelect("panel_agents", `?id=eq.${agentId}&limit=1`)) || [];
    const ag = agents[0];
    if (!ag || !canAccessAgent(req.panelUser, mapAgent(ag), [])) {
      res.status(403).json({ gabim: "Agjenti nuk u gjet." });
      return;
    }

    const row = await sbInsert("panel_players", {
      name,
      email: String(body.email ?? "").trim(),
      tel: String(body.tel ?? "").trim(),
      platform: body.platform || "Stake",
      note: String(body.note ?? "").trim(),
      agent_id: agentId,
    });
    const saved = Array.isArray(row) ? row[0] : row;
    res.status(201).json({ player: mapPlayer(saved, ag.name) });
  } catch (err) {
    console.error("[panel/players POST]", err);
    res.status(500).json({ gabim: "Lojtari nuk u shtua." });
  }
});

router.delete("/players/:id", panelAuthMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await sbSelect("panel_players", `?id=eq.${id}&limit=1`);
    const pl = rows[0];
    if (!pl) {
      res.status(404).json({ gabim: "Lojtari nuk u gjet." });
      return;
    }
    const agents = await sbSelect("panel_agents", `?id=eq.${pl.agent_id}&limit=1`);
    if (!agents[0] || !canAccessAgent(req.panelUser, mapAgent(agents[0]), [])) {
      res.status(403).json({ gabim: "Nuk keni akses." });
      return;
    }
    await sbDelete("panel_bets", `?player_id=eq.${id}`);
    await sbDelete("panel_players", `?id=eq.${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[panel/players DELETE]", err);
    res.status(500).json({ gabim: "Lojtari nuk u fshi." });
  }
});

router.post("/bets", panelAuthMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const playerId = body.playerId;
    const amount = Number(body.amount) || 0;
    const coef = Number(body.coef) || 0;
    const event = String(body.event ?? "").trim();
    if (!playerId || !amount || !coef || !event) {
      res.status(400).json({ gabim: "Lojtari, shuma, koeficienti dhe ndeshja kërkohen." });
      return;
    }

    const players = await sbSelect("panel_players", `?id=eq.${playerId}&limit=1`);
    const player = players[0];
    if (!player) {
      res.status(404).json({ gabim: "Lojtari nuk u gjet." });
      return;
    }

    let agentId = body.agentId || player.agent_id;
    if (req.panelUser.role === "agent") agentId = req.panelUser.agentId;

    const agents = await sbSelect("panel_agents", `?id=eq.${agentId}&limit=1`);
    const ag = agents[0];
    if (!ag || !canAccessAgent(req.panelUser, mapAgent(ag), [])) {
      res.status(403).json({ gabim: "Nuk keni akses." });
      return;
    }

    const row = await sbInsert("panel_bets", {
      player_id: playerId,
      player_name: player.name,
      agent_id: agentId,
      agent_name: ag.name,
      platform: body.platform || player.platform || "Stake",
      sport: body.sport || "",
      event,
      amount,
      coef,
      status: body.status || "open",
      note: String(body.note ?? "").trim(),
    });
    const saved = Array.isArray(row) ? row[0] : row;
    res.status(201).json({ bet: mapBet(saved) });
  } catch (err) {
    console.error("[panel/bets POST]", err);
    res.status(500).json({ gabim: "Basti nuk u ruajt." });
  }
});

router.patch("/bets/:id", panelAuthMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await sbSelect("panel_bets", `?id=eq.${id}&limit=1`);
    const existing = rows[0];
    if (!existing) {
      res.status(404).json({ gabim: "Basti nuk u gjet." });
      return;
    }
    const agents = await sbSelect("panel_agents", `?id=eq.${existing.agent_id}&limit=1`);
    if (!agents[0] || !canAccessAgent(req.panelUser, mapAgent(agents[0]), [])) {
      res.status(403).json({ gabim: "Nuk keni akses." });
      return;
    }

    const patch = {};
    const body = req.body || {};
    if (body.status != null) patch.status = body.status;
    if (body.amount != null) patch.amount = Number(body.amount);
    if (body.coef != null) patch.coef = Number(body.coef);
    if (body.event != null) patch.event = String(body.event).trim();
    if (body.sport != null) patch.sport = body.sport;
    if (body.note != null) patch.note = String(body.note).trim();
    if (body.platform != null) patch.platform = body.platform;

    const updated = await sbUpdate("panel_bets", `?id=eq.${id}`, patch);
    res.json({ bet: mapBet(updated) });
  } catch (err) {
    console.error("[panel/bets PATCH]", err);
    res.status(500).json({ gabim: "Basti nuk u përditësua." });
  }
});

router.delete("/bets/:id", panelAuthMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await sbSelect("panel_bets", `?id=eq.${id}&limit=1`);
    const existing = rows[0];
    if (!existing) {
      res.status(404).json({ gabim: "Basti nuk u gjet." });
      return;
    }
    const agents = await sbSelect("panel_agents", `?id=eq.${existing.agent_id}&limit=1`);
    if (!agents[0] || !canAccessAgent(req.panelUser, mapAgent(agents[0]), [])) {
      res.status(403).json({ gabim: "Nuk keni akses." });
      return;
    }
    await sbDelete("panel_bets", `?id=eq.${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[panel/bets DELETE]", err);
    res.status(500).json({ gabim: "Basti nuk u fshi." });
  }
});

router.patch("/settings", panelAuthMiddleware, async (req, res) => {
  try {
    if (req.panelUser.role !== "admin") {
      res.status(403).json({ gabim: "Vetëm admini ndryshon settings." });
      return;
    }
    const body = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (body.secret != null) patch.admin_secret = String(body.secret).trim();
    if (body.baseValue != null) patch.base_value = Number(body.baseValue) || 10;
    if (body.mainUrl != null) patch.main_url = String(body.mainUrl).trim();
    if (body.password) {
      patch.admin_password_hash = await hashAdminPassword(String(body.password));
    }
    await sbUpdate("panel_settings", "?id=eq.1", patch);
    const settings = await getSettings();
    res.json({ cfg: cfgForClient(settings) });
  } catch (err) {
    console.error("[panel/settings]", err);
    res.status(500).json({ gabim: "Settings nuk u ruajtën." });
  }
});

export default router;
