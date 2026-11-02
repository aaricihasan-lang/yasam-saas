// KAMPANYA MERKEZİ e2e — test Next sunucusu için ağ koruması (node --require). YALNIZ yerel / CI testinde kullanılır.
// Neden: Klasik Numeroloji istemcisi resmî sağlayıcı kökünü sabit kullanır (ROXY_API_BASE_URL yalnız resmî host'a eşitse kabul).
// Bu önyükleme, sunucu sürecindeki fetch'i sarar:
//   - https://roxyapi.com/api/v2/...  → KAMPANYA_E2E_FAKE_ROXY (yerel HTTPS sahte sağlayıcı) — gerçek sağlayıcıya istek GİTMEZ;
//   - 127.0.0.1 / localhost           → olduğu gibi;
//   - diğer tüm dış adresler           → reddedilir (sayılır; test sonunda 0 beklenir).
"use strict";
const fs = require("node:fs");
const FAKE = process.env.KAMPANYA_E2E_FAKE_ROXY;
const LOG = process.env.KAMPANYA_E2E_NET_LOG;
if (!FAKE) throw new Error("e2e-net-guard: KAMPANYA_E2E_FAKE_ROXY gerekli");
const REAL = "https://roxyapi.com/api/v2";
const orig = globalThis.fetch;
const note = (kind, url) => {
  if (LOG) try { fs.appendFileSync(LOG, JSON.stringify({ kind, url: String(url).slice(0, 200) }) + "\n"); } catch { /* yok say */ }
};
globalThis.fetch = async function guardedFetch(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(REAL)) {
    note("yonlendirildi", url);
    const to = FAKE.replace(/\/+$/, "") + url.slice(REAL.length);
    return orig(typeof input === "string" || input instanceof URL ? to : new Request(to, input), init);
  }
  let host = "";
  try { host = new URL(url).hostname; } catch { /* göreli */ }
  if (!host || host === "127.0.0.1" || host === "localhost" || host === "::1") return orig(input, init);
  note("engellendi", url);
  throw new TypeError(`e2e-net-guard: dış istek engellendi (${host})`);
};
