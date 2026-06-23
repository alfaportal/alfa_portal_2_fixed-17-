import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

let client = null;

export function panelDbConfigured() {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

/** Lexon panel_settings për të verifikuar lidhjen reale (jo vetëm env vars). */
export async function checkPanelDbHealth() {
  if (!panelDbConfigured()) {
    return {
      configured: false,
      db: false,
      error: "SUPABASE_URL ose SUPABASE_SERVICE_ROLE_KEY mungojnë në Railway.",
    };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("panel_settings")
    .select("id")
    .limit(1);

  if (error) {
    const hint =
      error.code === "42501" || /permission denied/i.test(error.message)
        ? "Përdor service_role key (jo anon). Ekzekuto supabase/panel-rls-fix.sql nëse RLS është aktiv."
        : /relation .* does not exist/i.test(error.message)
          ? "Ekzekuto supabase/panel-schema.sql në Supabase SQL Editor."
          : null;

    return {
      configured: true,
      db: false,
      error: error.message,
      code: error.code ?? null,
      hint,
    };
  }

  return {
    configured: true,
    db: true,
    settingsRows: Array.isArray(data) ? data.length : 0,
  };
}

/** @returns {import("@supabase/supabase-js").SupabaseClient | null} */
export function getSupabaseClient() {
  if (!panelDbConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function throwOnError(error) {
  if (error) {
    throw new Error(`SUPABASE:${error.message}`);
  }
}

function applyQueryFilters(builder, query) {
  const params = new URLSearchParams(query.replace(/^\?/, ""));

  for (const [key, raw] of params.entries()) {
    if (key === "select" || key === "order" || key === "limit") continue;
    if (raw.startsWith("eq.")) {
      const value = raw.slice(3);
      builder = builder.eq(key, key === "id" && /^\d+$/.test(value) ? Number(value) : value);
    } else if (raw.startsWith("in.")) {
      const inner = raw.slice(3).replace(/^\(/, "").replace(/\)$/, "");
      const values = inner
        .split(",")
        .map((part) => part.replace(/^"|"$/g, "").trim())
        .filter(Boolean);
      builder = builder.in(key, values);
    }
  }

  const order = params.get("order");
  if (order) {
    const [column, direction] = order.split(".");
    builder = builder.order(column, { ascending: direction !== "desc" });
  }

  const limit = params.get("limit");
  if (limit) builder = builder.limit(Number(limit));

  return builder;
}

export async function sbSelect(table, query = "") {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("PANEL_DB_NOT_CONFIGURED");

  const params = new URLSearchParams(query.replace(/^\?/, ""));
  const selectCols = params.get("select") || "*";
  let builder = supabase.from(table).select(selectCols);
  builder = applyQueryFilters(builder, query);

  const { data, error } = await builder;
  throwOnError(error);
  return data || [];
}

export async function sbInsert(table, row, { returnRow = true } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("PANEL_DB_NOT_CONFIGURED");

  let builder = supabase.from(table).insert(row);
  if (returnRow) builder = builder.select();

  const { data, error } = await builder;
  throwOnError(error);
  return data;
}

export async function sbUpdate(table, query, patch) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("PANEL_DB_NOT_CONFIGURED");

  let builder = supabase.from(table).update(patch);
  builder = applyQueryFilters(builder, query);
  builder = builder.select();

  const { data, error } = await builder;
  throwOnError(error);
  return Array.isArray(data) ? data[0] : data;
}

export async function sbDelete(table, query) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("PANEL_DB_NOT_CONFIGURED");

  let builder = supabase.from(table).delete();
  builder = applyQueryFilters(builder, query);

  const { error } = await builder;
  throwOnError(error);
}
