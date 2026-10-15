// 2026-10-12 UAT 2. tur (madde L) — Word/PDF TEKLİ / SEÇİLİ / TÜMÜ — YEREL uçtan uca (gerçek Roxy ÇAĞRILMAZ).
// Önkoşul: yerel `next dev` (3931) + dev-fake-backend (54329 PostgREST, 54330 sahte Roxy; FAKE_ROXY_RELABEL=1 → sonuçlar
// GERÇEK DEĞİL, yalnız akış denetimi). Sahte Roxy sayaç satırları backend logundan okunur.
//   R1 5 teknik (Natal, Transit, Progression, Sinastri, Forecast) sentetik profile kaydedilir
//   R2 tekli Word + PDF (Transit)                       → 200, 0 Roxy isteği
//   R3 seçili 3 analiz Word + PDF (Natal+Transit+Sinastri) → 200, 0 Roxy isteği
//   R4 tüm analizler Word + PDF (5)                     → 200, 0 Roxy isteği
//   R5 başka profilin analizi seçime karışırsa 400 (dosya yok); boş seçim 400; Android 200 (2026-10-15'ten beri her cihaz); yetkisiz 404
// Dosyalar OUT klasörüne yazılır; içerik denetimi: scripts/astrology/report-bulk-inspect.py
// Çalıştırma: node scripts/astrology/report-bulk.e2e.mjs [http://localhost:3931] [fake-backend.log] [out-dir]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3931";
const LOG = process.argv[3] ?? null;
const OUT = process.argv[4] ?? "report-bulk-out";
mkdirSync(OUT, { recursive: true });
const OWNER = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": "local-owner-token-aaaaaaaaaaaa", cookie: "yasam_admin_session=local-owner-token-aaaaaaaaaaaa" };
const ADMIN2 = { "x-admin-id": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b", "x-session-token": "local-admin2-token-bbbbbbbbbbb" };
let pass = 0;
let fail = 0;
const t = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const api = async (p, body) => {
  const r = await fetch(`${BASE}/api/admin/astroloji${p}`, { method: body ? "POST" : "GET", headers: OWNER, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);

const stamp = Date.now().toString(36);
const mk = async (label, date, time) => (await api("/profiles", { label, birthDate: date, birthTime: time, timeKnown: true, timeAccuracy: "exact_record", locationId: "tr-34-istanbul" })).json?.profile;
const A = await mk(`Rapor Çiğdem Şükrü ${stamp}`, "1990-07-15", "14:30");
const B = await mk(`Rapor Ömer İnci ${stamp}`, "1988-03-02", "08:15");
t("R1 iki sentetik profil", !!A?.id && !!B?.id);

const SELS = [
  { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } },
  { technique: "western.transit", options: { date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul", nodeType: "true" } },
  { technique: "western.progression", options: { targetDate: "2026-10-07", nodeType: "true" } },
  { technique: "western.synastry", options: { partnerProfileId: B.id, houseSystem: "placidus", nodeType: "true" } },
  { technique: "western.forecast", options: { startDate: "2026-10-01", days: 90 } },
];
const saved = {};
async function runAndSave(pid, sels) {
  const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: sels });
  const run = await api("/engine/run", { profileId: pid, revision: 1, selections: plan.json?.plan?.selections.map((s, i) => ({ technique: s.technique, options: s.options ?? sels[i].options })), confirmNewRequests: plan.json?.plan?.newRequestCount });
  const out = {};
  for (const r of run.json?.results ?? []) {
    if (!r.ok) continue;
    const res = await api("/analyses", { profileId: pid, revision: 1, technique: r.technique, options: r.view.options, saveRequestId: randomUUID() });
    if (res.status === 201 || res.status === 200) out[r.technique] = res.json.analysisId;
  }
  return out;
}
// Natal önce: transit çift halkası aynı revizyonun natal çerçevesini (önbellek) kullanır.
Object.assign(saved, await runAndSave(A.id, SELS.slice(0, 1)));
Object.assign(saved, await runAndSave(A.id, SELS.slice(1)));
const bNatal = (await runAndSave(B.id, SELS.slice(0, 1)))["western.natal"];
t("R1 5 teknik kaydedildi", Object.keys(saved).length === 5, Object.keys(saved).join(","));

const h0 = hits();
async function dl(url, name, headers = OWNER) {
  const r = await fetch(`${BASE}${url}`, { headers });
  const buf = Buffer.from(await r.arrayBuffer());
  if (r.status === 200 && name) writeFileSync(path.join(OUT, name), buf);
  return { status: r.status, type: r.headers.get("content-type") ?? "", disp: r.headers.get("content-disposition") ?? "", size: buf.length, text: r.status === 200 ? "" : buf.toString("utf8") };
}
const isDocx = (r) => r.status === 200 && r.type.includes("wordprocessingml") && r.size > 5000;
const isPdf = (r) => r.status === 200 && r.type.includes("pdf") && r.size > 5000;

// R2 tekli
const tr = saved["western.transit"];
let r = await dl(`/api/admin/astroloji/analyses/${tr}/report?format=docx`, "1-tekli-transit.docx");
t("R2 tekli Word (Transit)", isDocx(r), `HTTP ${r.status} ${r.size} B`);
r = await dl(`/api/admin/astroloji/analyses/${tr}/report?format=pdf`, "1-tekli-transit.pdf");
t("R2 tekli PDF (Transit)", isPdf(r), `HTTP ${r.status} ${r.size} B`);

// R3 seçili 3
const three = [saved["western.natal"], saved["western.transit"], saved["western.synastry"]];
const q3 = (f) => `/api/admin/astroloji/analyses/report?${new URLSearchParams({ profileId: A.id, format: f, ids: three.join(",") })}`;
r = await dl(q3("docx"), "2-secili-3.docx");
t("R3 seçili 3 → TEK Word", isDocx(r), `HTTP ${r.status} ${r.size} B · ${r.disp}`);
r = await dl(q3("pdf"), "2-secili-3.pdf");
t("R3 seçili 3 → TEK PDF", isPdf(r), `HTTP ${r.status} ${r.size} B`);

// R4 tümü
const qa = (f) => `/api/admin/astroloji/analyses/report?${new URLSearchParams({ profileId: A.id, format: f, all: "1" })}`;
r = await dl(qa("docx"), "3-tumu-5.docx");
t("R4 tüm analizler → TEK Word", isDocx(r) && /Tum-Analizler-5/.test(r.disp), `HTTP ${r.status} ${r.size} B · ${r.disp}`);
r = await dl(qa("pdf"), "3-tumu-5.pdf");
t("R4 tüm analizler → TEK PDF", isPdf(r), `HTTP ${r.status} ${r.size} B`);
if (LOG) t("R2–R4 rapor üretimi 0 Roxy isteği", hits() === h0, `${h0} → ${hits()}`);

// R5 güvenlik
r = await dl(`/api/admin/astroloji/analyses/report?${new URLSearchParams({ profileId: A.id, format: "docx", ids: [saved["western.natal"], bNatal].join(",") })}`, null);
t("R5 başka profilin analizi karışırsa 400 (dosya yok)", r.status === 400 && /MIXED_PROFILE/.test(r.text), `HTTP ${r.status}`);
r = await dl(`/api/admin/astroloji/analyses/report?${new URLSearchParams({ profileId: A.id, format: "pdf", ids: "" })}`, null);
t("R5 boş seçim 400", r.status === 400, `HTTP ${r.status}`);
r = await dl(`/api/admin/astroloji/analyses/report?${new URLSearchParams({ profileId: A.id, format: "html", all: "1" })}`, null);
t("R5 geçersiz biçim 400", r.status === 400, `HTTP ${r.status}`);
const android = { ...OWNER, "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36; wv" };
r = await dl(qa("docx"), null, android);
t("R5 Android Word 200 (2026-10-15: her cihazda)", r.status === 200, `HTTP ${r.status}`);
r = await dl(qa("pdf"), null, android);
t("R5 Android PDF 200 (2026-10-15: her cihazda)", r.status === 200, `HTTP ${r.status}`);
r = await dl(qa("docx"), null, ADMIN2);
t("R5 owner olmayan admin 404", r.status === 404, `HTTP ${r.status}`);
r = await dl(`/api/admin/astroloji/analyses/report?${new URLSearchParams({ profileId: A.id, format: "docx", ids: "99999999-9999-4999-8999-999999999999" })}`, null);
t("R5 var olmayan analiz 404", r.status === 404, `HTTP ${r.status}`);
if (LOG) t("R5 hiçbir denemede Roxy isteği yok", hits() === h0, `${h0} → ${hits()}`);

writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ profileA: A.label, profileB: B.label, saved, three }, null, 2));
console.log(`\nreport-bulk e2e: ${pass} PASS / ${fail} FAIL (gerçek Roxy çağrısı yok) · dosyalar: ${OUT}`);
process.exit(fail ? 1 : 0);
