// Analiz Arşivi / Danışan Dosyası — YEREL uçtan uca güvenceler (gerçek Roxy ÇAĞRILMAZ).
// Önkoşul: yerel `next dev` (3931) + dev-fake-backend (54329/54330).
//   A1 kayıtlı analiz açmak sağlayıcı çağırmaz (sahte Roxy sayaç değişmez) ve saklanmış sonuç döner
//   A2 Danışan Yolculuğu aday araması: doğum tarihi İSTEĞE BAĞLI daraltıcı (tarihsiz → ad ile bulur; başka tarih → gizler)
//   A3 Türkçe / büyük-küçük / ASCII / kısmi ad araması; başka tenant'ın danışanı ASLA dönmez
//   A4 yetkisiz erişim: owner olmayan admin ve astrolojisi kapalı uzman başkasının profilini / analizini açamaz (404)
//   A5 eşleştirmeyi kaldırmak profil, analizler ve danışan kaydını SİLMEZ
// Çalıştırma: node scripts/astrology/archive-file.e2e.mjs [http://localhost:3931] [fake-backend.log]
import { readFileSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3931";
const LOG = process.argv[3] ?? null;
const OWNER = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": "local-owner-token-aaaaaaaaaaaa", cookie: "yasam_admin_session=local-owner-token-aaaaaaaaaaaa" };
const ADMIN2 = { "x-admin-id": "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b", "x-session-token": "local-admin2-token-bbbbbbbbbbb" };
const EXPERT = { "x-user-id": "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e", "x-session-token": "local-expert-token-eeeeeeeeeee" };
let pass = 0;
let fail = 0;
const t = (n, c, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const get = async (path, h = OWNER) => {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);

const prof = (await get("/api/admin/astroloji/profiles?q=Ali&limit=5")).json.profiles.find((x) => x.label.startsWith("Ali Örnek"));
const list = (await get(`/api/admin/astroloji/analyses?profileId=${prof.id}&limit=50`)).json.analyses.filter((a) => !/Sentetik/.test(a.title ?? ""));

// A1
const h0 = hits();
const a = list.find((x) => x.technique === "western.natal") ?? list[0];
const opened = await get(`/api/admin/astroloji/analyses/${a.id}`);
t("A1 kayıtlı analiz açılır (saklanmış sonuç)", opened.status === 200 && !!opened.json?.analysis?.technical, `${a.technique} · HTTP ${opened.status}`);
if (LOG) t("A1 kayıtlı analiz açmak sağlayıcı çağırmaz", hits() === h0, `${h0} → ${hits()}`);
t("A1 kayıt, kayıt anındaki doğum revizyonunu taşır", typeof opened.json?.analysis?.profile?.revision?.revision === "number");

// A2
const cand = async (q) => (await get(`/api/admin/astroloji/clients/candidates?${new URLSearchParams(q)}`)).json?.candidates?.map((c) => c.name) ?? [];
t("A2 tarihsiz ad araması bulur (Ayşe)", (await cand({ name: "ayşe" })).includes("Ayşe Deneme"));
t("A2 başka profilin doğum tarihi eklenirse kayıt GİZLENİR (filtre VE koşulu)", (await cand({ name: "Ayşe", birthDate: "1990-07-15" })).length === 0);
t("A2 doğru doğum tarihi ile daraltma çalışır (Ali + 15.07.1990)", (await cand({ name: "ali", birthDate: "1990-07-15" })).includes("Ali Örnek"));
t("A2 olmayan ad → boş (RAMBUŞ yerel veride yok)", (await cand({ name: "RAMBUŞ" })).length === 0);
// A3
t("A3 Türkçe büyük harf (ÖRNEK)", (await cand({ name: "ÖRNEK" })).includes("Ali Örnek"));
t("A3 ASCII yazım (ornek)", (await cand({ name: "ornek" })).includes("Ali Örnek"));
t("A3 kısmi ad (al)", (await cand({ name: "al" })).includes("Ali Örnek"));
t("A3 başka tenant'ın danışanı dönmez (Uzman Danışanı)", (await cand({ name: "Uzman Danışanı" })).length === 0);

// A4
t("A4 owner olmayan admin profil açamaz", (await get(`/api/admin/astroloji/profiles/${prof.id}`, ADMIN2)).status === 404);
t("A4 owner olmayan admin analiz açamaz", (await get(`/api/admin/astroloji/analyses/${a.id}`, ADMIN2)).status === 404);
t("A4 astrolojisi kapalı uzman profil açamaz", (await get(`/api/astroloji/profiles/${prof.id}`, EXPERT)).status === 404);
t("A4 var olmayan profil kimliği → 404", (await get("/api/admin/astroloji/profiles/99999999-9999-4999-8999-999999999999")).status === 404);

// A5
const before = (await get(`/api/admin/astroloji/analyses?profileId=${prof.id}&limit=50`)).json.filteredTotal;
const ali = (await (await fetch(`${BASE}/api/admin/astroloji/clients/candidates?name=Ali`, { headers: OWNER })).json()).candidates.find((c) => c.name === "Ali Örnek");
const cur = (await get(`/api/admin/astroloji/profiles/${prof.id}`)).json.profile.clientId ?? null;
const put = async (clientId, expected, confirmRelink = false) =>
  (await fetch(`${BASE}/api/admin/astroloji/profiles/${prof.id}/client`, { method: "PUT", headers: OWNER, body: JSON.stringify({ clientId, expectedClientId: expected, confirmRelink }) })).status;
if (cur !== ali.id) await put(ali.id, cur, true);
t("A5 eşleştirme kuruldu", (await get(`/api/admin/astroloji/profiles/${prof.id}`)).json.profile.clientId === ali.id);
const del = (await fetch(`${BASE}/api/admin/astroloji/profiles/${prof.id}/client?expectedClientId=${ali.id}`, { method: "DELETE", headers: OWNER })).status;
t("A5 eşleştirme kaldırıldı", del < 300 && ((await get(`/api/admin/astroloji/profiles/${prof.id}`)).json.profile.clientId ?? null) === null, `HTTP ${del}`);
t("A5 profil duruyor", (await get(`/api/admin/astroloji/profiles/${prof.id}`)).status === 200);
t("A5 kayıtlı analizler değişmedi", (await get(`/api/admin/astroloji/analyses?profileId=${prof.id}&limit=50`)).json.filteredTotal === before);
t("A5 Danışan Yolculuğu kaydı duruyor", (await cand({ name: "Ali Örnek" })).includes("Ali Örnek"));
console.log(`\narchive-file e2e: ${pass} PASS / ${fail} FAIL (gerçek Roxy çağrısı yok)`);
process.exit(fail ? 1 : 0);
