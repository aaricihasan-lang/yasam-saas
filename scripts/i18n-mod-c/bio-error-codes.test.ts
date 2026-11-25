/**
 * I18N-F1-R3 — Biyoenerji / Çakra istemci i18n sözleşme testi.
 *
 * Niyet:
 *  1. Sunucunun BIO_* kodlarının HER biri (+ istemci BIO_NETWORK/BIO_TIMEOUT/BIO_BLOCKS_MOVE_PARTIAL) TR+EN
 *     `bioenergy.errors.codes` kataloğunda var.
 *  2. Kod kaydı (secureApi) metin→kod eşlemesine dayanır → aynı sabit metin İKİ farklı kodla gönderilmemeli.
 *  3. bioApi* hata metni sözleşmesi DEĞİŞMEDİ (j.error; yoksa "HTTP <durum>") — TR ekranda birebir.
 *  4. Tarih: yeni ortak biçimleyici TR'de eski yerel `Intl.DateTimeFormat("tr-TR", …)` yardımcısıyla birebir.
 *  5. "Önizleme yok." / toplu silme ifade açıklaması / Word indirme hataları: TR değerleri lib metinleriyle birebir;
 *     yazılı onay kuralı (bulkDeletePhrase + bulkPhraseMatches) DEĞİŞMEDİ.
 *
 * Çalıştırma (worktree kökünden): npx tsx scripts/i18n-mod-c/bio-error-codes.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { bioErrorCodeFor, bioErrorText, rememberBioErrorCode, BIO_NETWORK_ERROR, BIO_TIMEOUT_ERROR } from "../../lib/biyoenerji/secureApi";
import { formatBioDateTime } from "../../app/dashboard/biyoenerji/useBioDateTime";
import { hasPreviewText } from "../../app/dashboard/biyoenerji/previewText";
import { previewSubconsciousText } from "../../lib/bioenergy/subconsciousCausesListFetch";
import { previewImaginationText } from "../../lib/bioenergy/imaginationsListFetch";
import { previewSymbolLanguageText } from "../../lib/bioenergy/symbolLanguageListFetch";
import { BULK_PHRASE_HINT } from "../../lib/ui/bulkDeleteGuard";
import { BIO_REPORT_NETWORK_ERROR } from "../../lib/biyoenerji/reportDownloadError";

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

const trCat = JSON.parse(read("messages/tr/bioenergy.json")).bioenergy;
const enCat = JSON.parse(read("messages/en/bioenergy.json")).bioenergy;

// (1)+(2) sunucu kodları ve metin→kod tekliği
const serverFiles = [...walk("app/api/biyoenerji"), ...walk("lib/biyoenerji")];
const codes = new Set<string>(["BIO_NETWORK", "BIO_TIMEOUT", "BIO_BLOCKS_MOVE_PARTIAL"]);
const msgToCodes = new Map<string, Set<string>>();
const addPair = (msg: string, code: string) => {
  if (!msgToCodes.has(msg)) msgToCodes.set(msg, new Set());
  msgToCodes.get(msg)!.add(code);
};
for (const f of serverFiles) {
  const s = read(f);
  for (const m of s.matchAll(/code: "(BIO_[A-Z_]+)"/g)) codes.add(m[1]);
  for (const m of s.matchAll(/code: "(BIO_[A-Z_]+)",\s*error: "([^"]+)"/g)) addPair(m[2], m[1]);
  for (const m of s.matchAll(/bioDbError\([^;]*?,\s*"([^"]+)"\s*\)/g)) addPair(m[1], "BIO_DB_ERROR");
}
addPair("İşlem sırasında bir hata oluştu.", "BIO_DB_ERROR"); // bioDbError varsayılanı
ok(codes.size >= 22, `kod sayısı makul (${codes.size})`);
for (const c of codes) {
  ok(typeof trCat.errors?.codes?.[c] === "string" && trCat.errors.codes[c].length > 0, `TR katalog: ${c}`);
  ok(typeof enCat.errors?.codes?.[c] === "string" && !/[çğıöşüÇĞİÖŞÜ]/.test(enCat.errors.codes[c]), `EN katalog (Türkçe harf yok): ${c}`);
}
for (const k of Object.keys(trCat.errors.codes)) ok(codes.has(k), `katalogdaki kod kullanılıyor: ${k}`);
for (const [msg, set] of msgToCodes) ok(set.size === 1, `aynı metin tek kodla: "${msg}" → ${[...set].join(",")}`);
ok(msgToCodes.size >= 25, `metin→kod çifti sayısı (${msgToCodes.size})`);

// (3) bioErrorText sözleşmesi + kayıt
ok(bioErrorText({ error: "Kayıt bulunamadı.", code: "BIO_NOT_FOUND" }, 404) === "Kayıt bulunamadı.", "bioErrorText: metin aynen");
ok(bioErrorCodeFor("Kayıt bulunamadı.") === "BIO_NOT_FOUND", "kayıt: metin → kod");
ok(bioErrorText({}, 502) === "HTTP 502", "bioErrorText: error yoksa HTTP <durum> (eski davranış)");
ok(bioErrorCodeFor("HTTP 502") === null, "kodsuz yanıt kaydedilmez");
ok(bioErrorText({ error: 42 }, 500) === "42", "bioErrorText: String(j.error) (eski davranış)");
rememberBioErrorCode("x", "küçük");
ok(bioErrorCodeFor("x") === null, "geçersiz kod biçimi kaydedilmez");
ok(bioErrorCodeFor(BIO_NETWORK_ERROR) === "BIO_NETWORK" && bioErrorCodeFor(BIO_TIMEOUT_ERROR) === "BIO_TIMEOUT", "ağ/zaman aşımı sabit kodlu");
for (let i = 0; i < 250; i++) rememberBioErrorCode(`m${i}`, "BIO_DB_ERROR");
ok(bioErrorCodeFor("m0") === null && bioErrorCodeFor("m249") === "BIO_DB_ERROR", "kayıt sınırlı (en eski düşer)");
ok(bioErrorCodeFor(BIO_NETWORK_ERROR) === "BIO_NETWORK", "ağ kodu sınırdan etkilenmez");
const sa = read("lib/biyoenerji/secureApi.ts");
ok(!/String\(j\.error \?\? `HTTP/.test(sa.replace(/export function bioErrorText[\s\S]*?\n\}/, "")), "secureApi: tüm yollar bioErrorText'ten geçer");
const eh = read("app/dashboard/biyoenerji/useBioErrorText.ts");
ok(/if \(locale === DEFAULT_LOCALE\) return msg \?\? fallback;/.test(eh), "useBioErrorText: TR dalı birebir");
ok(/bioErrorCodeFor\(msg\)/.test(eh) && /t\.has\(`codes\.\$\{code\}`\)/.test(eh), "useBioErrorText: EN kod eşlemesi");

// (4) tarih — eski yerel yardımcı ile birebir
const oldFmt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "—";
  }
};
const samples = ["2026-11-25T09:05:00Z", "2024-02-29T23:59:59+03:00", "1999-12-31T00:00:00Z", "2026-01-01", "", null, undefined, "geçersiz", "2026-13-45T00:00:00Z"];
for (const s of samples) ok(formatBioDateTime(s, "tr") === oldFmt(s), `tarih TR birebir: ${String(s)} → ${formatBioDateTime(s, "tr")}`);
ok(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/.test(formatBioDateTime("2026-11-25T14:30:00", "en")), `tarih EN en-GB 24 saat (${formatBioDateTime("2026-11-25T14:30:00", "en")})`);
const comps = ["BilincaltiSebepleri", "BilincaltiSebepleriDetail", "BiyoenerjiSeanslari", "Cakralar", "CakralarDetail", "EnerjiBedenleri", "Imajinasyonlar", "ImajinasyonlarDetail", "SembolDili", "SembolDiliDetail"];
for (const c of comps) {
  const s = read(`app/dashboard/biyoenerji/components/${c}.tsx`);
  ok(!/Intl\.DateTimeFormat\("tr-TR"/.test(s) && /const formatDate = useBioDateTime\(\);/.test(s), `${c}: sabit tr-TR yok, ortak biçimleyici`);
}

// (5) önizleme / ifade açıklaması / Word hataları
ok(trCat.list.noPreview === "Önizleme yok.", "TR noPreview = lib metni");
const partsSets: (string | null | undefined)[][] = [[], [null, undefined], ["", "  "], ["a"], [" ", "b"], ["\n\t", null, "c"], [null, "  x  "]];
for (const ps of partsSets) {
  const libEmpty3 = [previewSubconsciousText(...ps), previewImaginationText(...ps), previewSymbolLanguageText(...ps)].map((v) => v === "Önizleme yok.");
  ok(libEmpty3.every((e) => e === !hasPreviewText(...ps)), `hasPreviewText ⇔ lib yedeği (${JSON.stringify(ps)})`);
}
ok(trCat.danger.phraseHint === BULK_PHRASE_HINT, "TR phraseHint = BULK_PHRASE_HINT birebir");
const modal = read("app/dashboard/biyoenerji/components/BiyoenerjiDangerDeleteModal.tsx");
ok(/const phrase = bulkDeletePhrase\(count\);/.test(modal) && modal.includes("bulkPhraseMatches(codeInput, phrase)") && modal.includes('t("phraseHint")'),
  "yazılı onay kuralı aynı (bulkDeletePhrase + bulkPhraseMatches); yalnız açıklama katalogdan");
ok(trCat.errors.report.network === BIO_REPORT_NETWORK_ERROR, "TR report.network = lib metni");
const rh = read("app/dashboard/biyoenerji/useBioReportError.ts");
ok(/if \(locale === DEFAULT_LOCALE\) return bioReportErrorMessage\(res\);/.test(rh), "Word hata: TR dalı lib fonksiyonu (birebir)");
for (const c of ["BilincaltiSebepleriDetail", "CakralarDetail", "ImajinasyonlarDetail", "SembolDiliDetail"]) {
  const s = read(`app/dashboard/biyoenerji/components/${c}.tsx`);
  ok(s.includes("setInfoError(await reportErr.fromResponse(res));") && s.includes("setInfoError(reportErr.network());") && !s.includes("bioReportErrorMessage"),
    `${c}: Word hata metni ekran dilinde`);
}

console.log(`\nbio-i18n: ${pass} PASS / ${fail} FAIL (kod: ${codes.size}, metin→kod: ${msgToCodes.size})`);
if (fail > 0) process.exit(1);
