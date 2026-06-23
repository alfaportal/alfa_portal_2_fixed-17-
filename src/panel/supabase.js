const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

export function panelDbConfigured() {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

export async function sbRequest(table, { method = "GET", query = "", body, prefer } = {}) {
  if (!panelDbConfigured()) {
    throw new Error("PANEL_DB_NOT_CONFIGURED");
  }
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  if (method === "GET" || method === "HEAD") delete headers["Content-Type"];

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SUPABASE_${res.status}:${text.slice(0, 200)}`);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

export async function sbSelect(table, query = "") {
  return (await sbRequest(table, { query })) || [];
}

export async function sbInsert(table, row, { returnRow = true } = {}) {
  return sbRequest(table, {
    method: "POST",
    query: returnRow ? "?select=*" : "",
    body: row,
    prefer: returnRow ? "return=representation" : "return=minimal",
  });
}

export async function sbUpdate(table, query, patch) {
  const rows = await sbRequest(table, {
    method: "PATCH",
    query: `${query}&select=*`,
    body: patch,
    prefer: "return=representation",
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function sbDelete(table, query) {
  await sbRequest(table, { method: "DELETE", query });
}
