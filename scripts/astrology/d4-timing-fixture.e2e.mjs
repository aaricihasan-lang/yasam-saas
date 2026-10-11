// D4 — Solar Arc / Secondary Progression YEREL sahte Roxy testi (gerçek Roxy ÇAĞRILMAZ).
//
// Önkoşul: yerel `next dev` (3931) + dev-fake-backend (54329 PostgREST, 54330 sahte Roxy; ROXY_API_KEY=local-fake-roxy-key).
// Golden fixture'lar yalnız 2026-10-07 hedef tarihi için GERÇEK yanıttır; başka tarih → sahte Roxy açıkça SENTETİK 501.
//
//   T1 hata işleme : golden dışı tarih → sonuç ok:false, kayıt YOK (plan hâlâ 1 yeni istek), kayıtlı analiz önizlemesi reddedilir
//   T2 fixture     : golden tarih (2026-10-07) → ok:true, yanıt hedef tarihi 2026-10-07
//   T3 görüntüleme : /engine/view (yalnız önbellek) gerçek sonucu döndürür
//   T4 kayıt       : analiz kaydı oluşur; parametre/teknik doğru; başarısız tarih için kayıt oluşmaz
//
// Çalıştırma: node scripts/astrology/d4-timing-fixture.e2e.mjs [http://localhost:3931]
const BASE = process.argv[2] ?? "http://localhost:3931";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const H = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
const GOLDEN = "2026-10-07";
const OTHER = "2026-10-09";

let pass = 0;
let fail = 0;
const t = (name, cond, extra = "") => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
};
const api = async (path, body, method = body ? "POST" : "GET") => {
  const r = await fetch(`${BASE}/api/admin/astroloji${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const prof = await api("/profiles?q=Ali&limit=10");
const p = prof.json?.profiles?.find((x) => x.label.startsWith("Ali Örnek"));
if (!p) {
  console.log("FAIL önkoşul: 'Ali Örnek' profili bulunamadı", prof.status);
  process.exit(1);
}
const sel = (technique, date) => ({ profileId: p.id, revision: p.currentRevision, selections: [{ technique, options: { targetDate: date, nodeType: "true" } }] });
const plan = async (b) => (await api("/engine/plan", b)).json?.plan;
const run = async (b) => {
  const pl = await plan(b);
  return (await api("/engine/run", { ...b, confirmNewRequests: pl?.newRequestCount ?? 0 })).json;
};
const analysesOf = async () => ((await api(`/analyses?profileId=${p.id}&limit=50`)).json?.analyses ?? []).filter((a) => a.technique === "western.solar_arc" || a.technique === "western.progression");

for (const tech of ["western.solar_arc", "western.progression"]) {
  const before = (await analysesOf()).length;
  // T1
  const bad = await run(sel(tech, OTHER));
  const it = bad?.results?.[0];
  t(`${tech} T1 golden dışı tarih reddedilir`, it && it.ok === false, it ? `${it.code}: ${it.error}` : JSON.stringify(bad).slice(0, 120));
  t(`${tech} T1 sağlayıcı yanıtı kaydedilmedi (plan hâlâ yeni istek)`, (await plan(sel(tech, OTHER)))?.newRequestCount === 1);
  const pv = await api("/analyses/preview", { ...sel(tech, OTHER).selections[0], profileId: p.id, revision: p.currentRevision, includeProviderInterp: false });
  t(`${tech} T1 başarısız sonuçtan analiz kaydı oluşturulamaz`, pv.status >= 400, `HTTP ${pv.status}`);
  // T2
  const ok = await run(sel(tech, GOLDEN));
  const r2 = ok?.results?.[0];
  const td = r2?.ok ? String(r2.view?.options?.targetDate ?? "") : "";
  t(`${tech} T2 golden tarih başarılı`, r2?.ok === true, r2?.ok ? `reused=${r2.reused}` : `${r2?.code}: ${r2?.error}`);
  t(`${tech} T2 hedef tarih ${GOLDEN}`, td === GOLDEN, td);
  // T3
  const v = await api("/engine/view", sel(tech, GOLDEN));
  const r3 = v.json?.results?.[0];
  t(`${tech} T3 önbellek görünümü gerçek sonucu gösterir`, r3?.ok === true && !!r3.view?.technical);
  // T4
  const prev = await api("/analyses/preview", { profileId: p.id, revision: p.currentRevision, technique: tech, options: r3?.view?.options, includeProviderInterp: false });
  const save = prev.json?.summary
    ? await api("/analyses", { profileId: p.id, revision: p.currentRevision, technique: tech, options: r3?.view?.options, includeProviderInterp: false, title: prev.json.summary.title, saveRequestId: crypto.randomUUID() })
    : null;
  const id = save?.json?.analysisId;
  t(`${tech} T4 analiz kaydedildi`, !!id, save ? `HTTP ${save.status}` : `önizleme HTTP ${prev.status}`);
  if (id) {
    const a = (await api(`/analyses/${id}`)).json?.analysis;
    t(`${tech} T4 kayıt tekniği ve tarihi doğru`, a?.technique === tech && String(a?.params?.targetDate ?? "") === GOLDEN, `${a?.technique} ${a?.params?.targetDate}`);
  }
  const after = (await analysesOf()).length;
  t(`${tech} T4 yalnız başarılı sonuç için kayıt (+1)`, after === before + (id ? 1 : 0), `${before} → ${after}`);
}
console.log(`\nd4 timing fixture e2e: ${pass} PASS / ${fail} FAIL (gerçek Roxy çağrısı yok; sahte Roxy golden'ı yalnız ${GOLDEN})`);
process.exit(fail ? 1 : 0);
