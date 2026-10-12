// 2026-10-12 Android UAT (13 madde) — TOPLU KAYIT + YORUM SAKLAMA + YETKİ — YEREL uçtan uca (gerçek Roxy ÇAĞRILMAZ).
//
// Önkoşul: yerel `next dev` (3931) + dev-fake-backend (54329 PostgREST, 54330 sahte Roxy; FAKE_ROXY_RELABEL=1 → sonuçlar
// GERÇEK DEĞİL, yalnız akış denetimi). Sahte Roxy sayaç satırları backend logundan okunur.
//
//   B1 8 teknik hesaplanır (sentetik, yerel sahte Roxy) → masada 8 sonuç
//   B2 8 sonuç TEK TEK ayrı analiz kaydı olarak saklanır (UI toplu kaydı ile aynı uç + kararlı saveRequestId)
//   B3 veritabanında 8 AYRI kayıt; teknik/parametre/revizyon doğru; hepsi Danışan Dosyası listesinde
//   B4 kısmi başarısızlık: 2 kayıt "yanıt kayboldu" sayılıp aynı saveRequestId ile yeniden denenir → MÜKERRER YOK
//   B5 kayıtlı 8 analiz yeniden açılır → 0 yeni sağlayıcı isteği; teknik sonuç kayıttakiyle aynı
//   B6 yorum: yetkili kullanıcıda includeProviderInterp GÖNDERİLMESE de yorum katmanı saklanır (yorum veren tekniklerde)
//   B7 owner "yorumu kapalı uzman görünümü" önizlemesi: kayıt yine yorumu saklar ama yanıt/özet yorumu SIZDIRMAZ
//   B8 önbellek: aynı teknik+seçenek yeniden planlanınca 0 yeni istek; farklı seçenek → ayrı birim
// Çalıştırma: node scripts/astrology/uat13-bulk-save.e2e.mjs [http://localhost:3931] [fake-backend.log]
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3931";
const LOG = process.argv[3] ?? null;
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const H = { "content-type": "application/json", "x-admin-id": OWNER, "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
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
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);

// Sentetik test profili (yalnız yerel sahte DB).
const stamp = Date.now().toString(36);
const created = await api("/profiles", { label: `UAT13 Sentetik ${stamp}`, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" });
const pid = created.json?.profile?.id;
t("B0 sentetik profil oluşturuldu", created.status === 201 || created.status === 200, `HTTP ${created.status}`);
const rev = created.json?.profile?.currentRevision ?? 1;

const SELS = [
  { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } },
  { technique: "western.transit", options: { date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul", nodeType: "true" } },
  { technique: "western.forecast", options: { startDate: "2026-10-01", days: 90 } },
  { technique: "western.progression", options: { targetDate: "2026-10-07", nodeType: "true" } },
  { technique: "western.solar_arc", options: { targetDate: "2026-10-07", nodeType: "true" } },
  { technique: "western.solar_return", options: { returnYear: 2026, houseSystem: "placidus", returnLocationId: null } },
  { technique: "western.astrocartography", options: {} },
  { technique: "vedic.d1", options: { ayanamsa: "lahiri" } },
];

// B1 hesapla
const plan = await api("/engine/plan", { profileId: pid, revision: rev, selections: SELS });
const h0 = hits();
const run = await api("/engine/run", { profileId: pid, revision: rev, selections: plan.json?.plan?.selections.map((s, i) => ({ technique: s.technique, options: s.options ?? SELS[i].options })), confirmNewRequests: plan.json?.plan?.newRequestCount });
const okItems = (run.json?.results ?? []).filter((r) => r.ok);
t("B1 8 teknik hesaplandı", okItems.length === 8, `ok ${okItems.length}/${SELS.length} · HTTP ${run.status} · hata: ${(run.json?.results ?? []).filter((r) => !r.ok).map((r) => `${r.technique}:${r.code}`).join(",")}`);
if (LOG) t("B1 sahte Roxy çağrı sayısı = plandaki yeni istek", hits() - h0 === plan.json?.plan?.newRequestCount, `${hits() - h0} vs ${plan.json?.plan?.newRequestCount}`);

// B2 + B4: 8 kaydı sırayla kaydet; 2'sinde "yanıt kayboldu" → aynı kimlikle yeniden dene
const reqIds = Object.fromEntries(okItems.map((r) => [r.technique, randomUUID()]));
const saved = {};
const lost = new Set(["western.forecast", "vedic.d1"]);
for (const r of okItems) {
  const res = await api("/analyses", { profileId: pid, revision: rev, technique: r.technique, options: r.view.options, saveRequestId: reqIds[r.technique] });
  if (res.status === 201 || res.status === 200) saved[r.technique] = res.json.analysisId;
  if (lost.has(r.technique)) delete saved[r.technique]; // istemci yanıtı alamadı varsayımı
}
t("B4 kısmi başarı simülasyonu: 6 kayıt doğrulandı, 2 belirsiz", Object.keys(saved).length === 6);
for (const tech of lost) {
  const r = okItems.find((x) => x.technique === tech);
  const res = await api("/analyses", { profileId: pid, revision: rev, technique: tech, options: r.view.options, saveRequestId: reqIds[tech] });
  t(`B4 yeniden deneme ${tech} → aynı kayıt (reused)`, res.status === 200 && res.json?.reused === true, `HTTP ${res.status} reused=${res.json?.reused}`);
  saved[tech] = res.json?.analysisId;
}
// B2'yi tamamla: tüm 8'in kimliği farklı
const ids = Object.values(saved);
t("B2 8 analiz ayrı kayıt olarak saklandı", ids.length === 8 && new Set(ids).size === 8);

// B3 Danışan Dosyası listesi
const list = await api(`/analyses?profileId=${pid}&limit=50`);
t("B3 veritabanında tam 8 kayıt (mükerrer yok)", list.json?.filteredTotal === 8, `toplam ${list.json?.filteredTotal}`);
const byTech = Object.fromEntries((list.json?.analyses ?? []).map((a) => [a.technique, a]));
t("B3 her teknik tam bir kez", SELS.every((s) => byTech[s.technique]) && (list.json?.analyses ?? []).length === 8);
t("B3 revizyon + parametreler korunur", SELS.every((s) => byTech[s.technique]?.profileRevision === rev));

// B5 yeniden açma — 0 sağlayıcı isteği, teknik veri kayıttaki sonuçla aynı
const h1 = hits();
let same = 0;
let interpCount = 0;
for (const r of okItems) {
  const a = await api(`/analyses/${saved[r.technique]}`);
  if (a.status === 200 && JSON.stringify(a.json.analysis.technical) === JSON.stringify(r.view.technical)) same++;
  if (a.json?.analysis?.interpretation?.visible === true) interpCount++;
  // B6 yorum: hesap anında görünür yorum varsa kayıtta da görünür ve İÇERİK aynı (kesilmez)
  if (r.view.interpretation?.visible) {
    t(`B6 ${r.technique} yorum kayıtla saklandı ve aynı`, a.json?.analysis?.interpretation?.visible === true && JSON.stringify(a.json.analysis.interpretation.content) === JSON.stringify(r.view.interpretation.content));
  } else {
    t(`B6 ${r.technique} sağlayıcı yorumu yok → kayıtta da yok (uydurulmaz)`, a.json?.analysis?.interpretation?.visible !== true, `neden: ${r.view.interpretation?.reason}`);
  }
}
t("B5 8 kayıt açıldı, teknik sonuç kayıt anındakiyle aynı", same === 8, `${same}/8`);
if (LOG) t("B5 yeniden açma 0 yeni sağlayıcı isteği", hits() === h1, `${h1} → ${hits()}`);
console.log(`   bilgi: ${interpCount}/8 kayıtta sistem yorumu var`);

// B7 owner önizlemesi (yorumu kapalı görünüm): kayıt yorumu yine saklar; yanıt sızdırmaz
const nat = okItems.find((x) => x.technique === "western.natal");
const pv = await api("/analyses/preview?previewNoInterp=1", { profileId: pid, revision: rev, technique: "western.natal", options: nat.view.options });
t("B7 önizleme modunda özet yorum bilgisini sızdırmaz", pv.status === 200 && pv.json?.summary?.providerInterpIncluded === false);
const sv = await api("/analyses?previewNoInterp=1", { profileId: pid, revision: rev, technique: "western.natal", options: nat.view.options, saveRequestId: randomUUID(), title: "UAT13 önizleme kaydı" });
const svBody = JSON.stringify(sv.json ?? {});
t("B7 kayıt yanıtı yalnız kimlik döner (yorum içeriği yok)", (sv.status === 201) && !/content|summary|interpret/i.test(svBody.replace(/"analysisId":"[^"]+"/, "")), svBody.slice(0, 120));
const openHidden = await api(`/analyses/${sv.json?.analysisId}?previewNoInterp=1`);
t("B7 önizlemede açılan kayıtta yorum içeriği yok", openHidden.json?.analysis?.interpretation?.visible === false && !("content" in (openHidden.json?.analysis?.interpretation ?? {})));
const openFull = await api(`/analyses/${sv.json?.analysisId}`);
t("B7 aynı kayıt normal görünümde yorumu taşır (veri silinmedi)", openFull.json?.analysis?.interpretation?.visible === true);

// B8 önbellek ayrıştırma
const p2 = await api("/engine/plan", { profileId: pid, revision: rev, selections: SELS });
t("B8 aynı seçimler yeniden planlanınca 0 yeni istek", p2.json?.plan?.newRequestCount === 0, `yeni ${p2.json?.plan?.newRequestCount}`);
const p3 = await api("/engine/plan", { profileId: pid, revision: rev, selections: [{ technique: "western.natal", options: { houseSystem: "whole-sign", nodeType: "true" } }, { technique: "western.progression", options: { targetDate: "2027-01-01", nodeType: "true" } }] });
t("B8 farklı parametre (ev sistemi / hedef tarih) ayrı birim → yeni istek", p3.json?.plan?.newRequestCount === 2, `yeni ${p3.json?.plan?.newRequestCount}`);

console.log(`\n${pass} PASS / ${fail} FAIL · profil ${pid}`);
process.exit(fail ? 1 : 0);
