# Alfa Portal VIP — Panel në Supabase

Paneli `alfa-panel.html` tani ruan agjentët, lojtarët dhe bastet në **Supabase** përmes API-së `/api/panel` (Railway `server.mjs`), jo më në `localStorage`.

## 1. Supabase — SQL

1. Hap [Supabase Dashboard](https://supabase.com/dashboard) → projekti i faqes (p.sh. `rzpiurlabidtvrcumsta`).
2. **SQL Editor** → **New query**.
3. Kopjo dhe ekzekuto gjithë skedarin `supabase/panel-schema.sql`.
4. Nëse ke ekzekutuar skemën më parë dhe `/api/panel/health` kthen `db: false` me `permission denied`, ekzekuto edhe `supabase/panel-rls-fix.sql`.
5. Verifiko: **Table Editor** → duhet të shohësh `panel_settings`, `panel_agents`, `panel_players`, `panel_bets`.

Tabela `panel_settings` krijohet bosh; fjalëkalimi i parë i adminit (`admin123`) vendoset automatikisht nga API në login-in e parë.

## 2. Railway — variabla mjedisi

Në shërbimin që ekzekuton `server.mjs` (alfaportal-vip.com):

| Variabël | Vlera |
|----------|--------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Settings → API → service_role) |
| `PANEL_JWT_SECRET` | String i gjatë i rastësishëm (p.sh. 32+ karaktere) |

**Mos** e vendos service role key në frontend — vetëm në Railway.

Pas ndryshimit → **Redeploy**.

## 3. Login default

| Rol | Fusha | Vlera fillestare |
|-----|-------|------------------|
| Admin | Secret link | `alfa-vip2024` |
| Admin | Password | `admin123` |
| Agent | Code | kodi që i jep admini |

Ndrysho secret/password nga **Settings** në panel pas login-it.

## 4. URL

- Panel: `https://alfaportal-vip.com/alfa-panel.html`
- Alias: `/panel` dhe `/admin` → ridrejtojnë te paneli

## 5. Test

```bash
curl https://alfaportal-vip.com/api/panel/health
# {"ok":true,"configured":true,"db":true,"settingsRows":0}

curl -X POST https://alfaportal-vip.com/api/panel/login \
  -H "Content-Type: application/json" \
  -d '{"role":"admin","secret":"alfa-vip2024","password":"admin123"}'
```

Nëse `configured: false` → mungojnë `SUPABASE_URL` ose `SUPABASE_SERVICE_ROLE_KEY` në Railway.

Nëse `configured: true` por `db: false` → shiko fushën `error` / `hint`:
- **permission denied** → përdor **service_role** key (jo `anon`), pastaj ekzekuto `panel-rls-fix.sql`.
- **relation does not exist** → ekzekuto `panel-schema.sql`.

## Shënim

Të dhënat e vjetra në `localStorage` të shfletuesit **nuk** migrohen automatikisht. Shto përsëri agjentët në panel të ri ose eksporto manualisht nga shfletuesi i vjetër.
