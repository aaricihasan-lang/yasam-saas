/**
 * I18N-F1-R3 — Refleksoloji istemci i18n sözleşme testi.
 *
 * Niyet:
 *  1. Sunucunun REF_* kodlarının HER biri REF_ERROR_CODES listesinde ve TR+EN `reflexology.errors.codes` kataloğunda.
 *  2. Senkron rozeti: lib senkron yardımcılarının (atlas + notlar) setReflexologySyncStatus'a yazdığı HER mesaj
 *     gösterim tablosunca tanınır ve TR katalog değeri lib metniyle BİREBİR (TR ekranda rozet zaten status.message
 *     gösterir; katalog yalnız diğer diller içindir). Lib mesajı değişirse bu test kırılır.
 *  3. Kaynak dil (tr) dalları birebir korunur (API hata toast'ları, yükleme hataları, rozet).
 *  4. Tarihler: varsayılan (tr-TR) çıktı eskisiyle aynı; ekran dili etiketi geçirilir.
 *  5. "Başlıksız protokol": DB'ye yazılmayan gösterim yedeği; detayda metin eşitliği yerine boş-başlık koşulu,
 *     organ kullanım listesinde sunucunun dil-bağımsız `untitled` bayrağı.
 *
 * Çalıştırma (worktree kökünden): npx tsx scripts/i18n-mod-k2/reflexology-i18n.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { REF_ERROR_CODES } from "../../app/refleksoloji/hooks/useRefCodeText";
import { syncMessageKey } from "../../app/refleksoloji/hooks/syncStatusText";
import { ATLAS_CONFLICT_MESSAGE, ATLAS_QUOTA_CONFLICT_MESSAGE } from "../../lib/refleksolojiAtlasSync";
import { formatProtocolDate } from "../../app/refleksoloji/kayitli-protokoller/lib/protocolActions";
import { formatInstantDateTime } from "../../lib/time/reportTime";

let pass = 0;
let fail = 0;
function ok(cond: unknown, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.log("FAIL", label);
  }
}
const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const tr = JSON.parse(read("messages/tr/reflexology.errors.json")).reflexology.errors;
const en = JSON.parse(read("messages/en/reflexology.errors.json")).reflexology.errors;
const fill = (s: string, v: Record<string, string> = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);

// (1) REF kodları
const used = new Set<string>();
for (const f of [...walk("app/api/refleksoloji"), ...walk("lib/refleksoloji")]) {
  for (const m of read(f).matchAll(/code: "(REF_[A-Z_]+)"/g)) used.add(m[1]);
}
const list = new Set<string>(REF_ERROR_CODES);
ok(used.size >= 20, `kullanılan REF kodu (${used.size})`);
for (const c of used) ok(list.has(c), `listede: ${c}`);
for (const c of list) {
  ok(used.has(c), `listedeki kod kullanılıyor: ${c}`);
  ok(typeof tr.codes[c] === "string" && tr.codes[c].length > 0, `TR katalog: ${c}`);
  ok(typeof en.codes[c] === "string" && !/[çğıöşüÇĞİÖŞÜ]/.test(en.codes[c]), `EN katalog (Türkçe harf yok): ${c}`);
}
ok(Object.keys(tr.codes).length === list.size && Object.keys(en.codes).length === list.size, "katalogda fazladan kod yok");

// (2) senkron mesajları — kapsam + TR birebir
const syncFiles = ["app/refleksoloji/notlar/lib/notesSync.ts", "lib/atlasStorage.ts", "lib/refleksolojiAtlasSync.ts", "lib/refleksoloji/runtimeReset.ts"];
const literals = new Set<string>();
let templates = 0;
for (const f of syncFiles) {
  const s = read(f);
  for (const call of s.matchAll(/setReflexologySyncStatus\(([\s\S]*?)\);/g)) {
    const body = call[1];
    for (const m of body.matchAll(/message:\s*\n?\s*"([^"]+)"/g)) literals.add(m[1]);
    for (const m of body.matchAll(/\?\s*"([^"]+)"\s*\n?\s*:\s*"([^"]+)"/g)) { literals.add(m[1]); literals.add(m[2]); }
    if (/message:\s*`/.test(body)) templates++;
  }
}
literals.add(ATLAS_CONFLICT_MESSAGE);
literals.add(ATLAS_QUOTA_CONFLICT_MESSAGE);
ok(literals.size >= 16, `sabit senkron mesajı sayısı (${literals.size})`);
ok(templates === 2, `sayılı şablon mesaj sayısı (${templates})`);
for (const msg of literals) {
  const k = syncMessageKey(msg);
  ok(!!k, `tablo tanıyor: "${msg}"`);
  if (k) {
    ok(fill(tr.sync[k.key] ?? "") === msg, `TR katalog birebir: ${k.key}`);
    ok(typeof en.sync[k.key] === "string" && !/[çğıöşüÇĞİÖŞÜ]/.test(en.sync[k.key]), `EN katalog: ${k.key}`);
  }
}
const ns = read("app/refleksoloji/notlar/lib/notesSync.ts");
const ov = /`\$\{plan\.oversize\.length\} (not çok büyük[^`]*)`/.exec(ns);
const rj = /`\$\{rejected\} (not eşitlenemedi \(geçersiz[^`]*)`/.exec(ns);
ok(!!ov && !!rj, "iki sayılı şablon bulundu");
if (ov && rj) {
  const s1 = `3 ${ov[1]}`;
  const s2 = `12 ${rj[1]}`;
  const k1 = syncMessageKey(s1);
  const k2 = syncMessageKey(s2);
  ok(k1?.key === "notesOversize" && k1.values?.count === "3" && fill(tr.sync.notesOversize, k1.values) === s1, "oversize şablonu → anahtar + TR birebir");
  ok(k2?.key === "notesRejected" && k2.values?.count === "12" && fill(tr.sync.notesRejected, k2.values) === s2, "rejected şablonu → anahtar + TR birebir");
}
ok(syncMessageKey("bilinmeyen mesaj") === null && syncMessageKey("") === null, "bilinmeyen mesaj → null (durum bazlı genel metin)");
for (const st of ["syncing", "synced", "error", "offline", "conflict"]) ok(typeof en.sync.state[st] === "string", `EN genel durum: ${st}`);
const hook = read("app/refleksoloji/hooks/useSyncStatusText.ts");
ok(/if \(locale === DEFAULT_LOCALE\) return status\.message;/.test(hook), "rozet: TR dalı status.message aynen");
ok(read("app/refleksoloji/components/SyncStatusBadge.tsx").includes("{statusText(status)}"), "SyncStatusBadge kancayı kullanır");
const toast = read("app/refleksoloji/bolge-haritasi/components/AtlasSaveToast.tsx");
ok(toast.includes('t("localOnly")') && toast.includes("statusText(status)") && !toast.includes('"Atlas bu cihaza kaydedildi."'), "AtlasSaveToast: yerel + çakışma metni");
ok(JSON.parse(read("messages/tr/reflexology.zoneMap.json")).reflexology.zoneMap.saveToast.localOnly === "Atlas bu cihaza kaydedildi.", "TR localOnly birebir");

// (3) TR dalları
const tPairs: [string, string][] = [
  ["app/refleksoloji/kayitli-atlas/components/KayitliAtlasLayout.tsx", 'isSourceLocale ? err.error || t("word.failed") : refCode(err, t("word.failed"))'],
  ["app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx", 'isSourceLocale ? errJson.error || t("reportFailed") : refCode(errJson, t("reportFailed"))'],
  ["app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx", 'isSourceLocale ? t("loadFailed", { detail: json?.error ?? res.statusText }) : refCode(json, t("loadFailedGeneric"))'],
  ["app/refleksoloji/kayitli-protokoller/components/KayitliProtokollerLayout.tsx", 'isSourceLocale ? err.error || t("reportFailed") : refCode(err, t("reportFailed"))'],
  ["app/refleksoloji/kayitli-protokoller/hooks/useProtocolList.ts", 'isSourceLocale ? t("loadFailed", { detail: json?.error ?? res.statusText }) : refCode(json, t("loadFailedGeneric"))'],
];
for (const [f, expr] of tPairs) ok(read(f).includes(expr), `${f.split("/").pop()}: TR dalı aynı, EN koddan`);

// (4) tarihler
const oldProto = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
};
for (const iso of ["2026-11-25T09:05:00Z", "2024-02-29T23:59:00+03:00", "geçersiz"]) {
  ok(formatProtocolDate(iso) === oldProto(iso) && formatProtocolDate(iso, "tr-TR") === oldProto(iso), `formatProtocolDate TR birebir: ${iso}`);
}
ok(formatProtocolDate("2026-11-25T14:30:00", "en-GB") !== formatProtocolDate("2026-11-25T14:30:00"), "formatProtocolDate EN farklı biçim");
ok(formatInstantDateTime("2026-11-25T09:05:00Z", { fallback: "—", locale: "tr-TR" }) === formatInstantDateTime("2026-11-25T09:05:00Z", { fallback: "—" }),
  "formatInstantDateTime tr-TR = varsayılan (birebir)");
ok(read("app/refleksoloji/kayitli-atlas/components/OrganAtlasCard.tsx").includes('formatInstantDateTime(updatedAt, { fallback: "—", locale: bcp47 })'), "OrganAtlasCard dil etiketi geçirir");
ok(read("app/refleksoloji/kayitli-protokoller/components/ProtocolListCard.tsx").includes("formatProtocolDate(protocol.created_at, bcp47)"), "ProtocolListCard dil etiketi geçirir");

// (5) başlıksız protokol
const spTr = JSON.parse(read("messages/tr/reflexology.savedProtocols.json")).reflexology.savedProtocols;
ok(spTr.card.untitled === "Başlıksız protokol", "TR card.untitled = lib yedeği birebir");
ok(/return resolveTargetProblem\(protocol, rawJson\) \|\| "Başlıksız protokol";/.test(read("app/refleksoloji/kayitli-protokoller/lib/protocolDetailContent.ts")),
  "protocolHeroTitle yedeği değişmedi (lib)");
const det = read("app/refleksoloji/kayitli-protokoller/components/KayitliProtokolDetayLayout.tsx");
ok(det.includes('return resolveTargetProblem(protocol, rawJson) || t("card.untitled");') && !det.includes('=== "Başlıksız protokol"'), "detay hero: boş-başlık koşulu (metin eşitliği yok)");
const route = read("app/api/refleksoloji/protocols/organ/route.ts");
ok(route.includes('titles: matches.map((m) => m.title ?? "Başlıksız protokol"),') && route.includes("untitled: matches.map((m) => m.title == null),"), "API: titles aynen + untitled bayrağı");
ok(read("app/refleksoloji/kayitli-atlas/components/KayitliAtlasLayout.tsx").includes("shownTitle(title, usage.untitled?.[i])"), "organ silme listesi bayrağı kullanır");

console.log(`\nreflexology-i18n: ${pass} PASS / ${fail} FAIL (REF: ${used.size}, senkron mesajı: ${literals.size} sabit + 2 sayılı şablon)`);
if (fail > 0) process.exit(1);
