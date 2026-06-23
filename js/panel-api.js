/**
 * Alfa Portal VIP — panel API client (Supabase via server).
 */
(function () {
  var TOKEN_KEY = "apv_panel_token";

  var cache = {
    cfg: { al: "alfa-vip2024", bv: 10, url: "https://alfaportal-vip.com" },
    agents: [],
    players: [],
    bets: [],
  };

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(t) {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  }

  async function request(method, path, body) {
    var headers = { "Content-Type": "application/json" };
    var t = token();
    if (t) headers.Authorization = "Bearer " + t;
    var res = await fetch("/api/panel" + path, {
      method: method,
      headers: headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    var data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }
    if (!res.ok) {
      var err = new Error(data.gabim || data.error || "Request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function applyBootstrap(data) {
    if (data.cfg) {
      cache.cfg = {
        al: data.cfg.al,
        bv: data.cfg.bv,
        url: data.cfg.url,
        ap: null,
      };
    }
    cache.agents = data.agents || [];
    cache.players = data.players || [];
    cache.bets = data.bets || [];
  }

  function mergeAgent(agent) {
    var i = -1;
    for (var j = 0; j < cache.agents.length; j++) {
      if (cache.agents[j].id === agent.id) {
        i = j;
        break;
      }
    }
    if (i >= 0) cache.agents[i] = agent;
    else cache.agents.push(agent);
  }

  window.PanelAPI = {
    token: token,
    setToken: setToken,
    clearSession: function () {
      setToken("");
      cache.agents = [];
      cache.players = [];
      cache.bets = [];
    },
    getCfg: function () {
      return cache.cfg;
    },
    getAgents: function () {
      return cache.agents;
    },
    getPlayers: function () {
      return cache.players;
    },
    getBets: function () {
      return cache.bets;
    },
    setCache: function (data) {
      applyBootstrap(data);
    },
    login: async function (role, secret, password) {
      var data = await request("POST", "/login", {
        role: role,
        secret: secret,
        password: password,
      });
      setToken(data.token);
      if (data.cfg) applyBootstrap({ cfg: data.cfg, agents: [], players: [], bets: [] });
      await window.PanelAPI.bootstrap();
      return data;
    },
    bootstrap: async function () {
      var data = await request("GET", "/bootstrap");
      applyBootstrap(data);
      return data;
    },
    tryRestoreSession: async function () {
      if (!token()) return false;
      try {
        await window.PanelAPI.bootstrap();
        return true;
      } catch (e) {
        window.PanelAPI.clearSession();
        return false;
      }
    },
    saveAgent: async function (obj, isEdit) {
      var data;
      if (isEdit) {
        data = await request("PATCH", "/agents/" + encodeURIComponent(obj.id), obj);
        mergeAgent(data.agent);
      } else {
        data = await request("POST", "/agents", obj);
        mergeAgent(data.agent);
      }
      return data.agent;
    },
    deleteAgent: async function (id) {
      await request("DELETE", "/agents/" + encodeURIComponent(id));
      cache.agents = cache.agents.filter(function (a) {
        return a.id !== id && a.parentId !== id;
      });
      cache.players = cache.players.filter(function (p) {
        return p.agentId !== id;
      });
      cache.bets = cache.bets.filter(function (b) {
        return b.agentId !== id;
      });
    },
    savePlayer: async function (obj) {
      var data = await request("POST", "/players", obj);
      cache.players.push(data.player);
      return data.player;
    },
    deletePlayer: async function (id) {
      await request("DELETE", "/players/" + encodeURIComponent(id));
      cache.players = cache.players.filter(function (p) {
        return p.id !== id;
      });
      cache.bets = cache.bets.filter(function (b) {
        return b.playerId !== id;
      });
    },
    saveBet: async function (obj, isEdit) {
      var data;
      if (isEdit) {
        data = await request("PATCH", "/bets/" + encodeURIComponent(obj.id), obj);
        for (var i = 0; i < cache.bets.length; i++) {
          if (cache.bets[i].id === obj.id) {
            cache.bets[i] = data.bet;
            break;
          }
        }
      } else {
        data = await request("POST", "/bets", obj);
        cache.bets.push(data.bet);
      }
      return data.bet;
    },
    deleteBet: async function (id) {
      await request("DELETE", "/bets/" + encodeURIComponent(id));
      cache.bets = cache.bets.filter(function (b) {
        return b.id !== id;
      });
    },
    patchBetStatus: async function (id, status) {
      var data = await request("PATCH", "/bets/" + encodeURIComponent(id), { status: status });
      for (var i = 0; i < cache.bets.length; i++) {
        if (cache.bets[i].id === id) {
          cache.bets[i] = data.bet;
          break;
        }
      }
    },
    saveSettings: async function (patch) {
      var data = await request("PATCH", "/settings", patch);
      if (data.cfg) cache.cfg = { al: data.cfg.al, bv: data.cfg.bv, url: data.cfg.url, ap: null };
      return data.cfg;
    },
  };

  window.DB = {
    getCfg: function () {
      return window.PanelAPI.getCfg();
    },
    getAgents: function () {
      return window.PanelAPI.getAgents();
    },
    getPlayers: function () {
      return window.PanelAPI.getPlayers();
    },
    getBets: function () {
      return window.PanelAPI.getBets();
    },
  };
})();
