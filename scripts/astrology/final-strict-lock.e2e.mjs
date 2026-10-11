// FINAL — sahte Roxy KATI modu + hesaplama kilidi davranışı (YEREL; gerçek Roxy ÇAĞRILMAZ).
//
// Önkoşul: yerel `next dev` (3931) + dev-fake-backend (KATI mod varsayılan; ROXY_API_KEY=local-fake-roxy-key).
//   S1 golden girdiler → gerçek golden yanıt (KP horary 108 / 2026-10-07 09:00 UTC, Vedik D1, KP chart)
//   S2 golden dışı girdi (KP ruling "şimdi") → sahte Roxy SENTETİK 501 → sonuç YOK, kayıt YOK (yeniden etiketleme yok)
//   S3 kilit: başarısız denemeden hemen sonra aynı girdi → IN_PROGRESS (yeni sağlayıcı isteği GÖNDERİLMEZ)
//   S4 ücretsiz durum kontrolü (/engine/view) → NOT_COMPUTED, sağlayıcı isteği yok
// Çalıştırma: node scripts/astrology/final-strict-lock.e2e.mjs [http://localhost:3931] [fake-backend.log yolu]
import { readFileSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3931";
const LOG = process.argv[3] ?? null;
const T = "local-owner-token-aaaaaaaaaaaa";
const H = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": T, cookie: `yasam_admin_session=${T}` };
let pass = 0;
let fail = 0;
const t = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const api = async (path, body) => {
  const r = await fetch(`${BASE}/api/admin/astroloji${path}`, { method: body ? "POST" : "GET", headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy (#\d+|SENTETİK)/gm) ?? []).filter((x) => x.startsWith("fake roxy #")).length : null);
const p = (await api("/profiles?q=Ali&limit=5")).json.profiles.find((x) => x.label.startsWith("Ali Örnek"));
const body = (technique, options) => ({ profileId: p.id, revision: p.currentRevision, selections: [{ technique, options }] });
const run = async (b) => {
  const pl = (await api("/engine/plan", b)).json?.plan;
  return { plan: pl, res: (await api("/engine/run", { ...b, confirmNewRequests: pl?.newRequestCount ?? 0 })).json };
};

// S1
const horary = body("kp.horary", { date: "2026-10-07", time: "09:00", timezone: "UTC", horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null });
const h1 = await run(horary);
t("S1 KP horary golden girdi başarılı", h1.res?.results?.[0]?.ok === true, h1.res?.results?.[0]?.ok ? "" : `${h1.res?.results?.[0]?.code}: ${h1.res?.results?.[0]?.error}`);
for (const [tech, opt] of [["vedic.d1", { ayanamsa: "lahiri" }], ["kp.chart", { ayanamsa: "kp-newcomb", nodeType: "mean" }]]) {
  const r = await run(body(tech, opt));
  t(`S1 ${tech} golden girdi başarılı`, r.res?.results?.[0]?.ok === true, r.res?.results?.[0]?.ok ? "" : `${r.res?.results?.[0]?.code}`);
}
// S2
const ruling = body("kp.ruling", { now: true, nodeType: "mean", placeLocationId: null });
const before = hits();
const r1 = await run(ruling);
const it1 = r1.res?.results?.[0];
t("S2 golden dışı KP ruling (şimdi) başarısız — yeniden etiketlenmiş sonuç YOK", it1 && it1.ok === false, it1 ? `${it1.code}: ${it1.error}` : "");
t("S2 yerel uyarı: LOCAL_FIXTURE_MISSING (gerçek servis hatası gibi gösterilmez)", it1?.code === "LOCAL_FIXTURE_MISSING" && /yerel test verisi/.test(it1?.error ?? ""), it1?.code);
t("S2 sonuç kaydedilmedi (plan hâlâ 1 yeni istek)", (await api("/engine/plan", ruling)).json?.plan?.newRequestCount === 1);
// S3
const afterFirst = hits();
const t0 = Date.now();
const r2 = await api("/engine/run", { ...ruling, confirmNewRequests: 1 });
const it2 = r2.json?.results?.[0];
t("S3 hemen yeniden deneme → IN_PROGRESS (kilit)", it2 && it2.code === "IN_PROGRESS", it2 ? `${it2.code} · ${Math.round((Date.now() - t0) / 1000)} sn` : JSON.stringify(r2.json).slice(0, 120));
t("S3 kalan süre GERÇEK pencereden (sabit 10 sn değil; 60–90 sn)", typeof it2?.retryAfterSec === "number" && it2.retryAfterSec >= 60 && it2.retryAfterSec <= 90, `retryAfterSec=${it2?.retryAfterSec}`);
t("S3 mesaj 'sürüyor' iddiası yerine durumu dürüstçe anlatır", /sürüyor olabilir ya da başarısız olmuş olabilir/.test(it2?.error ?? "") && !/şu anda sürüyor/.test(it2?.error ?? ""));
if (LOG) t("S3 kilitliyken sağlayıcıya yeni istek GİTMEDİ", hits() === afterFirst, `${before} → ${afterFirst} → ${hits()}`);
// S4
const v = await api("/engine/view", ruling);
t("S4 ücretsiz durum kontrolü: kayıtlı sonuç yok", v.json?.results?.[0]?.code === "NOT_COMPUTED", v.json?.results?.[0]?.code);
if (LOG) t("S4 durum kontrolü sağlayıcı çağırmadı", hits() === afterFirst);
// S5 kilit kendiliğinden kalkar: pencere (90 sn) dolunca yeniden deneme IN_PROGRESS DEĞİL, sağlayıcıya tek istek gider.
if (process.argv.includes("--expire")) {
  await new Promise((r) => setTimeout(r, 92_000));
  const beforeRetry = hits();
  const r3 = await api("/engine/run", { ...ruling, confirmNewRequests: 1 });
  const it3 = r3.json?.results?.[0];
  t("S5 90 sn sonra kilit kalktı (IN_PROGRESS değil)", it3 && it3.code !== "IN_PROGRESS", it3 ? `${it3.code}` : "");
  if (LOG) t("S5 yeniden denemede sağlayıcıya tam 1 istek", hits() === beforeRetry + 1, `${beforeRetry} → ${hits()}`);
}
console.log(`\nfinal strict+lock e2e: ${pass} PASS / ${fail} FAIL (gerçek Roxy çağrısı yok)`);
process.exit(fail ? 1 : 0);
