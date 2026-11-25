/**
 * I18N-F1-R3 (F0 #26) — Kişisel Dijital Ofis metin eşliği. DB / ağ YOK.
 * Çalıştır: npx tsx scripts/workspace/i18n-parity.test.ts
 *
 *  1. Ana sayfa kişiselleştirme metinleri (usePwText) next-intl kataloğunda (ns home.personal): kod anahtar listesi ↔
 *     tr ↔ en birebir; eski ayrı sözlüğün sabit metinleri aynen (TR ve EN çapa değerleri).
 *  2. DesignStudio sözlüğü (studio/i18n.ts — henüz katalogda DEĞİL, ayrı sözlük): tr ↔ en yapı eşliği
 *     (aynı anahtar ağacı, dizi uzunlukları, işlev arity'leri) ve EN metinlerinde Türkçe harf yok (izinli istisnalar hariç).
 */
import fs from "node:fs";
import path from "node:path";
import { PW_TEXT_KEYS } from "../../app/_premium/home/personal/i18n";
import { studioDict } from "../../app/_premium/home/personal/studio/i18n";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const ROOT = process.cwd();
const cat = (l: string) => (JSON.parse(fs.readFileSync(path.join(ROOT, "messages", l, "home.personal.json"), "utf8")).home.personal) as Record<string, string>;
const tr = cat("tr");
const en = cat("en");

console.log("\n[1] home.personal kataloğu");
ok(JSON.stringify(Object.keys(tr)) === JSON.stringify([...PW_TEXT_KEYS]), "kod anahtar listesi = tr katalog anahtarları (sıra dahil)", Object.keys(tr));
ok(JSON.stringify(Object.keys(en)) === JSON.stringify(Object.keys(tr)), "tr ↔ en anahtar eşliği");
ok(Object.values(tr).every((v) => typeof v === "string" && v.length > 0) && Object.values(en).every((v) => typeof v === "string" && v.length > 0), "boş değer yok");
ok(tr.editWorkspace === "Çalışma Alanımı Düzenle" && tr.favorites === "Favorilerim" && tr.view_night === "Gece", "TR çapa metinleri eski sözlükle aynı");
ok(en.editWorkspace === "Edit My Workspace" && en.favorites === "My Favourites" && en.view_focus === "Focus", "EN çapa metinleri eski sözlükle aynı");
ok(!Object.values(en).some((v) => /[çğıöşüÇĞİÖŞ]/.test(v.replace(/Yaşam Sistemi/g, ""))), "EN metinlerinde Türkçe harf yok (marka hariç)");
const src = fs.readFileSync(path.join(ROOT, "app/_premium/home/personal/i18n.ts"), "utf8");
ok(!/const (TR|EN)\b/.test(src) && /useTranslations\("home\.personal"\)/.test(src), "ayrı TR/EN sözlüğü kaldırıldı; usePwText katalogdan okuyor");

console.log("\n[2] DesignStudio sözlüğü yapı eşliği (tr ↔ en)");
const sTr = studioDict("tr") as unknown as Record<string, unknown>;
const sEn = studioDict("en") as unknown as Record<string, unknown>;
const diffs: string[] = [];
const enTurkish: string[] = [];
// Kanonik / kullanıcıya ait kalıplar EN'de Türkçe kalabilir (ör. REPORT_LOGO_REF "rapor logosu (Ayarlar › Profilim)", marka).
const EN_ALLOW = /Yaşam Sistemi|rapor logosu|Ayarlar › Profilim/g;
// Bilinçli istisnalar: palNames TR'de boş eşleme (kanonik Türkçe palet adı TR'de aynen görünür; EN çeviri tablosu);
// customName = kanonik palet adı "Özel" (her iki dilde aynı; ekranda palNames ile çevrilir — kodda kullanılmıyor).
const SKIP = new Set(["palNames", "customName"]);
function walk(a: unknown, b: unknown, at: string) {
  if (typeof a !== typeof b) { diffs.push(`${at}: tip ${typeof a} ≠ ${typeof b}`); return; }
  if (typeof a === "function") {
    if ((a as (...x: unknown[]) => unknown).length !== (b as (...x: unknown[]) => unknown).length) diffs.push(`${at}: arity`);
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) { diffs.push(`${at}: dizi uzunluğu`); return; }
    a.forEach((x, i) => walk(x, (b as unknown[])[i], `${at}[${i}]`));
    return;
  }
  if (a && typeof a === "object") {
    const ka = Object.keys(a as object).sort(), kb = Object.keys(b as object).sort();
    if (JSON.stringify(ka) !== JSON.stringify(kb)) diffs.push(`${at}: anahtar farkı ${ka.filter((k) => !kb.includes(k)).concat(kb.filter((k) => !ka.includes(k))).join(",")}`);
    for (const k of ka) if (kb.includes(k) && !(at === "" && SKIP.has(k))) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at ? `${at}.${k}` : k);
    return;
  }
  if (typeof b === "string" && /[çğıöşüÇĞİÖŞ]/.test(b.replace(EN_ALLOW, ""))) enTurkish.push(`${at}: ${b}`);
}
walk(sTr, sEn, "");
ok(diffs.length === 0, "studio tr ↔ en yapı eşliği", diffs);
ok(enTurkish.length === 0, "studio EN metinlerinde Türkçe harf yok (izinli kalıplar hariç)", enTurkish);

console.log(`\nworkspace i18n parity: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
