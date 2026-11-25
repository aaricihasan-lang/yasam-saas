/**
 * I18N-F1-R3 — Kupa & Hacamat API hata kodları (CUP_*) sözleşme testi.
 *
 * Niyet:
 *  1. `/api/kupa/**` + lib/cupping sunucu hata yanıtlarının HER biri dil-bağımsız `code` taşır; Türkçe
 *     `error` metni AYNEN kalır (kaynak dilde istemci onu birebir gösterir).
 *  2. Kullanılan her kod `CUPPING_ERROR_CODES` listesinde ve TR+EN `cupping.errors.codes` kataloğunda var.
 *  3. 404 → "bulunamadı" ekranı artık metne değil koda bağlı: `CUP_NOT_FOUND` YALNIZ eski karşılaştırma
 *     metni ("Kayıt bu hesaba ait değil veya bulunamadı.") ile birlikte kullanılır ve o metin her yerde
 *     `CUP_NOT_FOUND` ile gelir (⇔) → davranış birebir.
 *  4. İstemci: `KupaApiError` Error alt sınıfı (TR `e.message` yolu değişmez); `useKupaErrorText` TR'de
 *     ham mesajı, EN'de kod çevirisini döndürür.
 *
 * Çalıştırma: npx tsx scripts/i18n-mod-c/cupping-error-codes.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { CUPPING_ERROR_CODES, isCuppingErrorCode } from "../../lib/cupping/errorCodes";
import { normalizeCuppingDayStyle } from "../../lib/cupping/calendarTypes";
import { KupaApiError, isKupaNotFound } from "../../app/kupa/lib/api";

let pass = 0;
let fail = 0;
function ok(cond: unknown, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.log("FAIL", label);
  }
}

const ROOT = process.cwd(); // worktree kökünden koşulur (diğer Kupa harness'ları gibi)
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const NOT_FOUND_TEXT = "Kayıt bu hesaba ait değil veya bulunamadı.";
const files = [...walk("app/api/kupa"), "lib/cupping/api.ts", "lib/cupping/usageApi.ts", "lib/cupping/calendarTypes.ts"];
const used = new Set<string>();
let callCount = 0;
for (const f of files) {
  const s = read(f);
  // (1) her cuppingError çağrısı 3 argümanlı: (status, mesaj, kod)
  const re = /cuppingError\(\s*(\d{3}),\s*("(?:[^"\\]|\\.)*"|`[^`]*`|[A-Za-z_][\w.]*)\s*,\s*("CUP_[A-Z_]+"|[A-Za-z_][\w.]*)\s*,?\s*\)/g;
  const all = s.match(/cuppingError\(\s*\d{3}/g) ?? [];
  let m: RegExpExecArray | null;
  let matched = 0;
  while ((m = re.exec(s))) {
    matched++;
    callCount++;
    const [, , msg, code] = m;
    if (code.startsWith('"')) {
      const c = code.slice(1, -1);
      used.add(c);
      // (3) ⇔: CUP_NOT_FOUND yalnız NOT_FOUND metniyle; NOT_FOUND metni yalnız CUP_NOT_FOUND ile
      const isNfText = msg === JSON.stringify(NOT_FOUND_TEXT) || msg === "NOT_FOUND";
      ok(isNfText === (c === "CUP_NOT_FOUND"), `${f}: CUP_NOT_FOUND ⇔ NOT_FOUND metni (${msg} → ${c})`);
    }
  }
  ok(matched === all.length, `${f}: tüm cuppingError çağrıları kodlu (${matched}/${all.length})`);
  // (1b) doğrudan { ok:false, error } yanıtları da kodlu
  const bare = s.match(/ok: false,\s*error:/g) ?? [];
  ok(bare.length === 0, `${f}: kodsuz { ok:false, error } yanıtı yok (${bare.length})`);
  for (const mm of s.matchAll(/code: "(CUP_[A-Z_]+)"/g)) used.add(mm[1]);
  // NOT_FOUND sabiti tanımlıysa metni birebir aynı olmalı (⇔ kanıtının dayanağı)
  const nf = /const NOT_FOUND = "([^"]*)"/.exec(s);
  if (nf) ok(nf[1] === NOT_FOUND_TEXT, `${f}: NOT_FOUND sabiti metni birebir`);
}
for (const mm of read("app/api/kupa/points/[id]/protocols/route.ts").matchAll(/notFoundCode: "(CUP_[A-Z_]+)"/g)) used.add(mm[1]);
for (const mm of read("app/api/kupa/safety/[id]/protocols/route.ts").matchAll(/notFoundCode: "(CUP_[A-Z_]+)"/g)) used.add(mm[1]);
ok(callCount > 140, `cuppingError çağrı sayısı makul (${callCount})`);

// (2) kod listesi ↔ kullanılan ↔ katalog
const trCat = JSON.parse(read("messages/tr/cupping.json")).cupping.errors.codes as Record<string, string>;
const enCat = JSON.parse(read("messages/en/cupping.json")).cupping.errors.codes as Record<string, string>;
for (const c of used) ok(isCuppingErrorCode(c), `kullanılan kod listede: ${c}`);
for (const c of CUPPING_ERROR_CODES) {
  ok(used.has(c), `listedeki kod en az bir yerde kullanılıyor: ${c}`);
  ok(typeof trCat[c] === "string" && trCat[c].length > 0, `TR katalog: ${c}`);
  ok(typeof enCat[c] === "string" && enCat[c].length > 0 && !/[çğıöşüÇĞİÖŞÜ]/.test(enCat[c]), `EN katalog (Türkçe harf yok): ${c}`);
}
ok(Object.keys(trCat).length === CUPPING_ERROR_CODES.length && Object.keys(enCat).length === CUPPING_ERROR_CODES.length,
  "katalogda fazladan kod yok");
ok(trCat.CUP_NOT_FOUND === NOT_FOUND_TEXT, "TR CUP_NOT_FOUND = sunucu metni birebir");

// gün stili doğrulaması: kod + Türkçe metin birlikte (metin değişmedi)
const r1 = normalizeCuppingDayStyle({ color_key: "mor-olmayan" });
ok(!r1.ok && r1.code === "CUP_DAY_COLOR_INVALID" && r1.error === "Geçersiz renk seçimi.", "gün stili: renk kodu + TR metin");
const r2 = normalizeCuppingDayStyle({}, { requireAtLeastOne: true });
ok(!r2.ok && r2.code === "CUP_NO_FIELDS" && r2.error === "Güncellenecek alan yok.", "gün stili: boş PATCH kodu + TR metin");
const r3 = normalizeCuppingDayStyle({}, { requireColorPresent: true });
ok(!r3.ok && r3.code === "CUP_DAY_COLOR_REQUIRED", "gün stili: renk zorunlu kodu");

// (4) istemci hata sınıfı
const e1 = new KupaApiError(NOT_FOUND_TEXT, "CUP_NOT_FOUND", 404);
ok(e1 instanceof Error && e1.message === NOT_FOUND_TEXT, "KupaApiError: Error alt sınıfı, message = sunucu metni aynen");
ok(isKupaNotFound(e1), "isKupaNotFound: CUP_NOT_FOUND → true");
ok(!isKupaNotFound(new KupaApiError("Teknik bu hesaba ait değil veya bulunamadı.", "CUP_TECHNIQUE_NOT_FOUND", 404)), "isKupaNotFound: başka kod → false");
ok(!isKupaNotFound(new Error(NOT_FOUND_TEXT)), "isKupaNotFound: kodsuz düz Error → false (metne bağlı değil)");
ok(new KupaApiError("x", "küçük harf", 400).code === null, "KupaApiError: geçersiz kod biçimi → null");

// useKupaErrorText kaynak sözleşmesi: TR dalı ham mesaj; EN'de kod → modül, sonra ortak katalog
const et = read("app/kupa/lib/errorText.ts");
ok(/if \(locale === DEFAULT_LOCALE\) return msg \?\? fallback;/.test(et), "errorText: TR dalı birebir (msg ?? fallback)");
ok(/t\.has\(`codes\.\$\{code\}`\)/.test(et) && /tCommon\.has\(`codes\.\$\{code\}`\)/.test(et), "errorText: EN kod eşlemesi (modül → ortak)");
// eski Türkçe metin karşılaştırmaları kaldırıldı
ok(!/NOT_FOUND_MSG/.test(read("app/kupa/protokoller/hooks/useProtocolDocument.ts")), "useProtocolDocument: metin karşılaştırması yok");
ok(!/\/bulunamadı\|ait değil\/i\.test\(msg\)/.test(read("app/kupa/teknikler/components/TechniqueReadView.tsx")), "TechniqueReadView: metin regex'i yok");
ok(/isKupaNotFound\(e\)/.test(read("app/kupa/teknikler/components/TechniqueReadView.tsx")), "TechniqueReadView: koda bağlı 404");

console.log(`\ncupping-error-codes: ${pass} PASS / ${fail} FAIL (kod: ${CUPPING_ERROR_CODES.length}, çağrı: ${callCount})`);
if (fail > 0) process.exit(1);
