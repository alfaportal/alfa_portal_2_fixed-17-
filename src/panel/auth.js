import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.PANEL_JWT_SECRET || process.env.JWT_SECRET || "alfaportal-vip-panel-change-me";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function signPanelToken(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      ...payload,
      exp: Date.now() + TOKEN_TTL_MS,
    }),
  );
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyPanelToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function hashAdminPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyAdminPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export function panelAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = verifyPanelToken(token);
  if (!payload) {
    res.status(401).json({ gabim: "Sesioni skadoi — hy përsëri." });
    return;
  }
  req.panelUser = payload;
  next();
}
