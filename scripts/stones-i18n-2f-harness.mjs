/**
 * Stones (Doğaltaş) i18n — AŞAMA 2F: Stone Detail empty-state residue closure gate.
 *
 * 2E'de kapatılan Stone Detail crash sonrası owner UAT'ında görülen tek residue:
 * `shortPreview()` helper'ı boş içerik alanlarında hardcoded Türkçe "Henüz bilgi
 * girilmedi." döndürüyordu (EN'de bile). 2F bunu locale-aware `t("noInfoYet")`
 * üzerinden çözer. Salt-okunur; exit 1. Çalıştır: node scripts/stones-i18n-2f-harness.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@formatjs/icu-messageformat-parser";

const ROOT = process.cwd();
let fail = 0;
const err = (m) => { console.log("  ❌ " + m); fail++; };
const ok = (m) => console.log("  ✅ " + m);
const rd = (p) => JSON.parse(readFileSync(join(ROOT, "messages", p), "utf8"));
const src = (p) => readFileSync(join(ROOT, p), "utf8");
const count = (s, sub) => s.split(sub).length - 1;

const DETAIL = "app/dogaltas/dogaltas-listesi/[id]/page.tsx";
const detSrc = src(DETAIL);

// ── GATE A: empty-state message values (EN native / TR korunur) ──────────────
console.log("[GATE A] noInfoYet message values");
const enDetail = rd("en/stones.list.json").stones.detail;
const trDetail = rd("tr/stones.list.json").stones.detail;
enDetail.noInfoYet === "No information added yet."
  ? ok('EN stones.detail.noInfoYet = "No information added yet."') : err(`EN noInfoYet beklenmedik: "${enDetail.noInfoYet}"`);
trDetail.noInfoYet === "Henüz bilgi girilmedi."
  ? ok('TR stones.detail.noInfoYet = "Henüz bilgi girilmedi." (korundu)') : err(`TR noInfoYet beklenmedik: "${trDetail.noInfoYet}"`);
// mineral detail empty-state (aynı sınıf, zaten t()'li) — parity teyidi
const enMinNoInfo = rd("en/stones.minerals.json").stones.minerals.detail.noInfo;
const trMinNoInfo = rd("tr/stones.minerals.json").stones.minerals.detail.noInfo;
(enMinNoInfo === "No information added yet." && trMinNoInfo === "Henüz bilgi girilmedi.")
  ? ok("mineral detail noInfo EN/TR tutarlı") : err("mineral detail noInfo EN/TR tutarsız");

// ── GATE B: EN render path Türkçe sistem fallback DÖNMÜYOR ───────────────────
console.log("\n[GATE B] Stone Detail render path — no hardcoded Turkish fallback");
count(detSrc, "Henüz bilgi girilmedi") === 0
  ? ok("[id] page: 'Henüz bilgi girilmedi' literal YOK") : err(`[id] page: 'Henüz bilgi girilmedi' literal hâlâ ${count(detSrc, "Henüz bilgi girilmedi")} kez`);
// shortPreview boş içerikte "" döner (locale fallback çağırana bırakılır)
detSrc.includes('if (!text || !text.trim()) return "";')
  ? ok("shortPreview boş içerikte '' döndürüyor (Türkçe literal kaldırıldı)") : err("shortPreview hâlâ hardcoded fallback döndürüyor");
// her empty-capable render sitesi t("noInfoYet") kullanıyor (|| veya : ile)
const noInfoYetUses = count(detSrc, 't("noInfoYet")');
noInfoYetUses >= 4
  ? ok(`t("noInfoYet") ${noInfoYetUses} render sitesinde (empty-state localize)`) : err(`t("noInfoYet") beklenenden az: ${noInfoYetUses}`);
// çıplak `shortPreview(...)` empty-fallback sitesi kalmadı: her shortPreview ya
// non-empty guard'lı (? :) ya da `|| t("noInfoYet")` ile korunuyor.
!/:\s*shortPreview\([^)]*\)\s*}/.test(detSrc)
  ? ok("çıplak ': shortPreview(...)' empty-branch kalmadı (t('noInfoYet')'e çevrildi)") : err("hâlâ ': shortPreview(...)' empty-branch (Türkçe/boş dönebilir)");

// ── GATE C: canonical / user / catalog content DOKUNULMADI ──────────────────
console.log("\n[GATE C] canonical / user / catalog preserved");
// canonical facet/assignment değerleri hâlâ orada (query-coupled)
["Kök Çakra", "Sakral Çakra", "Çakra Atama", "Kan Grupları"].every((c) => detSrc.includes(`"${c}"`))
  ? ok("canonical chakra/assignment değerleri korunmuş") : err("canonical facet/assignment değeri kaybolmuş");
// data-normalization fallback (İsimsiz Taş) veri katmanında DEĞİŞMEDEN duruyor
detSrc.includes('|| "İsimsiz Taş"')
  ? ok("toSafeStone 'İsimsiz Taş' data fallback dokunulmadı (veri katmanı)") : err("toSafeStone data fallback DEĞİŞMİŞ");
// stone_name/content çevirisi eklenmedi (sadece display fallback wiring değişti)
!/toSafeStone[\s\S]{0,600}t\(/.test(detSrc)
  ? ok("toSafeStone içinde t() yok — data mapping'e dokunulmadı") : err("toSafeStone data mapping'e t() sızmış");

// ── GATE D: 2E crash-fix KORUNDU ────────────────────────────────────────────
console.log("\n[GATE D] 2E crash-fix preserved");
const idxHook = detSrc.indexOf("useSignedStoneImageUrls(imageFilePaths)");
const idxLoadingReturn = detSrc.indexOf("if (loading) {");
(idxHook > -1 && idxLoadingReturn > -1 && idxHook < idxLoadingReturn)
  ? ok("hook (useSignedStoneImageUrls) erken return'lerden ÖNCE (rules-of-hooks korundu)") : err("hook-order fix BOZULMUŞ");
detSrc.includes('if (Number.isNaN(parsed.getTime())) return "-";')
  ? ok("formatDate Invalid Date guard korundu") : err("formatDate Invalid Date guard KAYBOLMUŞ");

// ── GATE E: ICU parse (stones.list EN+TR — değişen namespace) ────────────────
console.log("\n[GATE E] ICU parse integrity (touched namespace)");
let icuBad = 0, icuCount = 0;
const walk = (obj) => { for (const v of Object.values(obj)) { if (typeof v === "string") { icuCount++; try { parse(v); } catch (e) { icuBad++; err(`ICU: ${e.message}`); } } else if (v && typeof v === "object") walk(v); } };
for (const f of ["en/stones.list.json", "tr/stones.list.json"]) walk(rd(f));
icuBad === 0 ? ok(`ICU parse: ${icuCount} string sağlam`) : err(`ICU parse: ${icuBad} hata`);

console.log("\n=== SONUÇ ===");
console.log(fail === 0 ? "✅ TÜM 2F KAPILARI GEÇTİ" : `❌ ${fail} HATA`);
process.exit(fail === 0 ? 0 : 1);
