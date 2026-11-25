/**
 * I18N — RAPOR GOLDEN HARNESS'I, grup C + D (I18N-F1-R5 RAPOR-CD).
 * Üreticiler: P16 Beslenme Word, P19 Aromaterapi Word (16 rota), P11–P15 Doğaltaş/Mineral/Kombinasyon/Bilgi Word,
 * P21 Refleksoloji Word, P22 Biyoenerji Word, P38–P40 Belge çeviri / Ders notu / Video Word.
 * (Kupa pilotu: reports-golden.harness.ts; A+B: reports-golden-ab.harness.ts — bu dosya onlara DOKUNMAZ, aynı normalizasyonu kullanır.)
 *
 * Çalıştırma (repo kökü):
 *   npx tsx scripts/i18n/reports-golden-cd.harness.ts                 → TR golden + EN dil kontrolleri
 *   … --write-golden                                                    → TR golden'ı yazar (yalnız golden YOKSA)
 *   … --write-golden --overwrite                                        → bilinçli golden güncellemesi (PR'da diff görünür)
 *   … --out <dizin>                                                     → TR + EN örnek dosyaları diske yazar (kanıt)
 *   … --only P16,P19                                                    → yalnız bu üreticiler
 *
 * KURAL: Golden, üretici değişikliğinden ÖNCE taban SHA'da üretilir. Sonraki her koşuda
 *   (1) bugünkü (parametresiz) çağrı ve (2) açık Türkçe çıktı dili → parça bazında normalize SHA golden'a EŞİT;
 *   (3) İngilizce → kullanıcı nöbetçileri AYNEN, Türkçe sistem metni = 0, sayılar TR = EN, belge dili en-GB, dosya adı İngilizce.
 * Saat dondurulur (cd/setup.ts); DB / ağ / sır YOK; tamamen sentetik fikstür.
 */
import "./reports-golden/cd/setup";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { allFixtures, type Fixture, type Mode } from "./reports-golden/cd/fixtures";
import { digest, docxParts, sha, textNodes } from "./reports-golden/normalize";

const ROOT = process.cwd();
const GOLDEN = join(ROOT, "scripts/i18n/golden/reports-cd-tr.golden.json");
const args = process.argv.slice(2);
const WRITE = args.includes("--write-golden");
const OVERWRITE = args.includes("--overwrite");
const outIdx = args.indexOf("--out");
const OUT_DIR = outIdx >= 0 ? args[outIdx + 1] : null;
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1]!.split(",")) : null;
/** Çevirisi bu dalda tamamlanan üreticiler — EN kontrolleri yalnız bunlarda zorunlu (diğerleri yalnız TR golden). */
const EN_READY = new Set((process.env.RCD_EN_READY ?? "P11,P12,P13,P14,P15,P16,P19,P21,P22,P38,P39,P40").split(",").filter(Boolean));

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string): void {
  if (cond) pass++;
  else {
    fail++;
    fails.push(msg);
  }
}

type Snap = { filename: string | null; digest: string; parts: Record<string, string> };
type GoldenFile = { baseSha: string; generator: string; fixtures: Record<string, Snap> };
type Run = { fx: Fixture; buffer: Buffer; filename: string | null; texts?: string[] };

async function runOne(fx: Fixture, mode: Mode): Promise<Run> {
  const r = await fx.run(mode);
  return { fx, buffer: r.buffer, filename: r.filename };
}

async function snap(r: Run): Promise<Snap> {
  const { parts } = await docxParts(r.buffer);
  return { filename: r.filename, digest: digest(parts), parts };
}

function compare(label: string, name: string, g: Snap | undefined, c: Snap): void {
  if (!g) {
    ok(false, `${label}: ${name} golden'da yok`);
    return;
  }
  ok(c.filename === g.filename, `${label}: ${name} dosya adı birebir (${c.filename} vs ${g.filename})`);
  const diffParts = Object.keys({ ...g.parts, ...c.parts }).filter((p) => g.parts[p] !== c.parts[p]);
  ok(diffParts.length === 0 && c.digest === g.digest, `${label}: ${name} normalize SHA birebir${diffParts.length ? ` — farklı parçalar: ${diffParts.join(", ")}` : ""}`);
}

// ── EN dil kontrolleri ───────────────────────────────────────────────────────
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜâîûÂÎÛ]/;
const TR_ASCII_WORDS =
  /\b(Sayfa|Takvim|Kaynak|Bilgiler|Hazirlayan|Ocak|Mart|Nisan|Haziran|Temmuz|Ekim|Kasim|Aralik|Pazartesi|Cuma|Pazar|Genel|Sonrasi|Oncesi|gun|daha|ilk|Tarih|Rapor|Uzman|Bilgilendirme|Randevu|Randevular|Randevusu|Danisan|Kapsam|Toplam|Bekliyor|Tamamlandi|Iptal|Urun|Stok|Kategori|Tumu|Kritik|Tukenmis|Diger|Yag|Sabun|Krem|Tespih|Aksesuar|Seans|Odev|Analiz|Notlar|Burc|Kan|Mizac|Durum|Tur|Adet|adet|Ajanda|Haftalik|Aylik|Secili|Tek|Gorusme|Genel|Yolculuk|Yolculugu|Tutar|Odendi|Kayit|Besin|Ogun|Gunluk|Enerji|Miktar|Gram|Karbonhidrat|Lif|Plani|Taslak|Aktif|Arsiv|Ortalama|Hedef|Fark|Yaglar|Karisim|Karisimlar|Bitki|Bitkiler|Preparat|Preparatlar|Yontem|Yontemler|Sozluk|Kaynaklar|Tum|Secili|Katalog|Katalogu|Tas|Taslar|Mineraller|Kombinasyon|Bilgi|Kutuphane|Kutuphanesi|Dogaltas|Refleksoloji|Protokol|Bolge|Biyoenerji|Cakra|Sembol|Bilincalti|Imgelem|Ders|Notu|Ceviri|Belge|Ozet|Icindekiler|Sonuc|Guvenlik|Dogrulanmis|Onaylanmis|Revizyon|Damla|Sise|Tip)\b/;
const USER_RE = /⟦[^⟧]*⟧/g;
const NAMESPACES = ["reports.common", "reports.nutrition", "reports.aromatherapy", "reports.stones", "reports.reflexology", "reports.bioenergy", "reports.documents"];
const TR_CATALOG_FRAGMENTS: { text: string; re: RegExp; folded?: boolean }[] = (() => {
  const flat = (o: unknown, p = "", out: Record<string, string> = {}) => {
    if (o && typeof o === "object") for (const [k, v] of Object.entries(o as Record<string, unknown>)) flat(v, p ? `${p}.${k}` : k, out);
    else if (typeof o === "string") out[p] = o;
    return out;
  };
  const frags = new Set<string>();
  /** EN değerlerinin ASCII-katlanmış küçük harf hâli (ör. "VENUS"): TR'nin katlanmış hâli bunlardan biriyse sızıntı sayılmaz. */
  const enFolded = new Set<string>();
  for (const ns of NAMESPACES) {
    const f = join(ROOT, `messages/tr/${ns}.json`);
    if (!existsSync(f)) continue;
    // TR = EN aynı olan değerler (ör. "MARS", "Human Design", "Form") dil-bağımsızdır → sızıntı sayılmaz.
    const enFile = join(ROOT, `messages/en/${ns}.json`);
    const en = existsSync(enFile) ? flat(JSON.parse(readFileSync(enFile, "utf8"))) : {};
    for (const [k, v] of Object.entries(flat(JSON.parse(readFileSync(f, "utf8"))))) {
      if (typeof en[k] === "string") {
        enFolded.add(fold(en[k]!).toLowerCase());
        // C+D eki: EN değerinin parçaları da (ör. "MINERAL #{no}" → "MINERAL #") dil-bağımsız sayılır.
        for (const part of en[k]!.split(/\{[^}]*\}|·|•|\+|—|\/|\(|\)|:/)) if (part.trim()) enFolded.add(fold(part.trim()).toLowerCase());
      }
      if (en[k] === v) continue;
      for (const part of v.split(/\{[^}]*\}|·|•|\+|—|\/|\(|\)|:/)) {
        const t = part.trim();
        if (t.replace(/[^A-Za-zÇĞİÖŞÜçğıöşüâîû]/g, "").length >= 4) frags.add(t);
      }
    }
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Hem birebir hem ASCII'ye katlanmış + büyük/küçük harf duyarsız eşleşme ("ÜRÜN #" → "URUN #" sızıntısı da yakalanır).
  // C+D eki: TR parçası aynı zamanda bir EN değeriyse (ör. "Cins (Genus)" → "Genus") dil-bağımsız terimdir → sızıntı sayılmaz.
  return [...frags].filter((text) => !enFolded.has(fold(text).toLowerCase())).flatMap((text) => [
    { text, re: new RegExp(`(^|[^A-Za-zÇĞİÖŞÜçğıöşü])${esc(text)}($|[^A-Za-zÇĞİÖŞÜçğıöşü])`) },
    ...(enFolded.has(fold(text).toLowerCase()) ? [] : [{ text: `${text} (ASCII)`, re: new RegExp(`(^|[^A-Za-z])${esc(fold(text))}($|[^A-Za-z])`, "i"), folded: true }]),
  ]);
})();
/** Türkçe harfleri ASCII karşılığına katlar (büyük/küçük korunur). */
function fold(t: string): string {
  const map: Record<string, string> = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U", â: "a", Â: "A", î: "i", Î: "I", û: "u", Û: "U" };
  return t.replace(/[çÇğĞıİöÖşŞüÜâÂîÎûÛ]/g, (c) => map[c] ?? c);
}

/** P38/P39: ders notu içeriğindeki yapı işaretleri ("Soru:", "Cevap:", "Örnek:") kullanıcı/AI metninin satırlarıdır (aynen basılır). */
const CONTENT_MARKER_LINES = new Set(["Soru:", "Cevap:", "Örnek:"]);
function leakOf(t: string): string | null {
  if (CONTENT_MARKER_LINES.has(t.trim())) return null;
  // URL'ler kayıt verisidir (ör. kaynak bağlantısı) → dil denetimine girmez.
  const s = t.replace(/Yaşam Sistemi|YAŞAM SİSTEMİ/g, "").replace(/https?:\/\/\S+/g, " ");
  const frag = TR_CATALOG_FRAGMENTS.find((f) => (f.folded ? f.re.test(fold(s)) : f.re.test(s)));
  if (TR_LETTERS.test(s) || TR_ASCII_WORDS.test(s) || frag) return `«${t}»${frag ? ` (TR katalog parçası «${frag.text}»)` : ""}`;
  return null;
}

async function textsOf(r: Run): Promise<{ system: string[]; user: string[]; nums: string; xml: Record<string, string> }> {
  const { xml } = await docxParts(r.buffer);
  const parts = Object.keys(xml).filter((p) => /^word\/(document|footer\d*|header\d*)\.xml$/.test(p)).sort();
  const nodes = parts.flatMap((p) => textNodes(xml[p]!));
  const core = xml["docProps/core.xml"] ?? "";
  const meta = [...core.matchAll(/<dc:(title|description|subject)>([^<]*)<\/dc:\1>/g)].map((m) => m[2]!);
  const system = [...nodes, ...meta].map((t) => t.replace(USER_RE, " ")).filter((t) => t.trim());
  const docText = (xml["word/document.xml"] ? textNodes(xml["word/document.xml"]) : []).map((t) => t.replace(USER_RE, " ")).join(" ");
  return { system, user: parts.filter((p) => !/header/.test(p)).flatMap((p) => textNodes(xml[p]!)).flatMap((t) => t.match(USER_RE) ?? []), nums: (docText.match(/\d+/g) ?? []).sort().join(","), xml };
}

async function enChecks(tr: Run, en: Run): Promise<void> {
  const name = tr.fx.name;
  const a = await textsOf(tr);
  const b = await textsOf(en);
  const leaks = b.system.map(leakOf).filter((x): x is string => !!x);
  ok(leaks.length === 0, `EN ${name}: Türkçe sistem metni = 0${leaks.length ? ` — ${leaks.slice(0, 8).join(" | ")}${leaks.length > 8 ? ` (+${leaks.length - 8})` : ""}` : ""}`);
  ok(JSON.stringify(a.user) === JSON.stringify(b.user), `EN ${name}: kullanıcı metinleri çevrilmeden aynen (${b.user.length}/${a.user.length})`);
  ok(a.nums === b.nums, `EN ${name}: sayısal değerler TR ile aynı çoklu küme${a.nums === b.nums ? "" : ` — TR[${a.nums}] EN[${b.nums}]`}`);
  if (en.fx.kind === "docx") {
    // RAPOR-E eki: gömülü görseller (ör. Refleksoloji harita PNG'si — metinsiz) dilden bağımsız → TR = EN medya SHA'sı.
    const media = async (r: Run) => Object.entries((await docxParts(r.buffer)).parts).filter(([k]) => k.startsWith("word/media/")).map(([, v]) => v).sort().join(",");
    const [ma, mb] = [await media(tr), await media(en)];
    if (ma) ok(ma === mb, `EN ${name}: gömülü görseller TR ile birebir (${ma.split(",").length} medya)`);
    ok(/<w:lang w:val="en-GB"/.test(b.xml["word/styles.xml"] ?? ""), `EN ${name}: belge dili w:lang=en-GB`);
    ok(!/w:lang w:val="tr-TR"/.test(Object.values(b.xml).join("")), `EN ${name}: belgede tr-TR dil işareti yok`);
  } else {
    const raw = en.buffer.toString("latin1");
    ok(/\/Lang \(en-GB\)/.test(raw), `EN ${name}: PDF /Lang (en-GB)`);
  }
  if (en.filename) {
    // Kullanıcı/katalog adının slug'ı (KULLANICI_…/KATALOG_…) dosya adında aynen kalır → sistem kısmı denetiminden çıkarılır.
    const f = en.filename.replace(USER_RE, "").replace(/(KULLANICI|KATALOG)[-_][A-Za-z0-9_-]*?(?=[-_]\d{4}-\d{2}-\d{2}|\.docx$)/gi, "");
    ok(!TR_ASCII_WORDS.test(f.replace(/[-_.]/g, " ")) && !TR_LETTERS.test(f), `EN ${name}: dosya adı sistem kısmı İngilizce (${en.filename})`);
  }
}

/** Sözleşme/katman birim kontrolleri: hesap–etiket ayrımı, TR birebir sabitler, ICU, katalog tamlığı. */
async function unitChecks(): Promise<void> {
  // RAPOR-E: fikstürde görünmeyen ICU çoğul dalları (TR gruplamasız, EN tekil/çoğul).
  {
    const { reportLocaleFor } = await import("@/lib/i18n/reportLocale");
    const tr = reportLocaleFor("tr").t("reports.stones");
    const en = reportLocaleFor("en").t("reports.stones");
    ok(tr("stoneDetail.extraImagesNote", { count: 1200, shown: "1200" }) === "Bu taş kaydında toplam 1200 görsel bulunmaktadır. Sistemi ziyaret edin.", "ICU: P12 ek görsel notu TR birebir (gruplamasız)");
    ok(en("stoneDetail.extraImagesNote", { count: 1, shown: "1" }).includes("1 image in total") && en("stoneDetail.extraImagesNote", { count: 3, shown: "3" }).includes("3 images in total"), "ICU: P12 ek görsel notu EN tekil/çoğul");
    ok(tr("encyclopedia.records", { count: 1200, shown: "1200" }) === "1200 kayıt" && en("encyclopedia.records", { count: 1, shown: "1" }) === "1 record", "ICU: P11 kayıt sayısı TR/EN");
    const { EXPORT_TRUNCATED_NOTE } = await import("@/lib/biyoenerji/reportSecurity");
    const bio = reportLocaleFor("tr").t("reports.bioenergy");
    ok(bio("common.truncated", { shown: "5000" }) === EXPORT_TRUNCATED_NOTE(5000), "P22: kırpma notu katalog TR = reportSecurity.EXPORT_TRUNCATED_NOTE (birebir)");
    const ref = reportLocaleFor("en").t("reports.reflexology");
    ok(ref("map.legend", { organ: "X", count: 1, shown: "1" }) === "X — 1 zone" && ref("map.legend", { organ: "X", count: 2, shown: "2" }) === "X — 2 zones", "ICU: P21 lejant EN tekil/çoğul");
  }
  // Katalog tamlığı (EN'de eksik anahtar → sessiz TR düşüşü olmasın).
  const leaves = (o: unknown, p = ""): string[] => (o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k)) : [p]);
  for (const ns of NAMESPACES.filter((n) => n !== "reports.common")) {
    const fa = join(ROOT, `messages/tr/${ns}.json`);
    if (!existsSync(fa)) continue;
    const la = leaves(JSON.parse(readFileSync(fa, "utf8"))).sort();
    const lb = leaves(JSON.parse(readFileSync(join(ROOT, `messages/en/${ns}.json`), "utf8"))).sort();
    ok(JSON.stringify(la) === JSON.stringify(lb), `katalog: ${ns} TR/EN anahtar ağacı aynı (${la.length})`);
  }
}

async function main(): Promise<void> {
  const fixtures = allFixtures().filter((f) => !ONLY || ONLY.has(f.producer));
  const trRuns: Run[] = [];
  for (const fx of fixtures) trRuns.push(await runOne(fx, "base"));
  const trSnap: Record<string, Snap> = {};
  for (const r of trRuns) trSnap[r.fx.name] = await snap(r);

  if (WRITE) {
    if (existsSync(GOLDEN) && !OVERWRITE) {
      console.error(`Golden zaten var: ${GOLDEN} — bilinçli güncelleme için --overwrite.`);
      process.exit(2);
    }
    const baseSha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
    const dirty = execSync("git status --porcelain -- lib app", { cwd: ROOT }).toString().trim();
    mkdirSync(dirname(GOLDEN), { recursive: true });
    const g: GoldenFile = { baseSha: dirty ? `${baseSha}+kirli` : baseSha, generator: "scripts/i18n/reports-golden-cd.harness.ts", fixtures: trSnap };
    writeFileSync(GOLDEN, JSON.stringify(g, null, 2) + "\n");
    console.log(`Golden yazıldı: ${GOLDEN} (${Object.keys(trSnap).length} fikstür, taban ${g.baseSha})`);
    for (const fx of fixtures) compare("determinizm", fx.name, trSnap[fx.name], await snap(await runOne(fx, "base")));
  } else {
    ok(existsSync(GOLDEN), "golden dosyası mevcut");
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as GoldenFile;
    console.log(`Golden tabanı: ${golden.baseSha} · ${Object.keys(golden.fixtures).length} fikstür`);
    const enRuns: Run[] = [];
    for (const r of trRuns) {
      compare("TR(parametresiz)", r.fx.name, golden.fixtures[r.fx.name], trSnap[r.fx.name]!);
      compare("TR(açık çıktı dili)", r.fx.name, golden.fixtures[r.fx.name], await snap(await runOne(r.fx, "tr")));
      if (EN_READY.has(r.fx.producer)) {
        const en = await runOne(r.fx, "en");
        enRuns.push(en);
        await enChecks(r, en);
      }
    }
    if (!ONLY) await unitChecks();
    if (OUT_DIR) {
      for (const [lang, runs] of [["TR", trRuns], ["EN", enRuns]] as const) {
        for (const r of runs) {
          const dir = join(OUT_DIR, r.fx.producer);
          mkdirSync(dir, { recursive: true });
          const ext = r.fx.kind === "pdf" ? ".pdf" : ".docx";
          const fname = `${lang}__${r.fx.name}${r.filename ? `__${r.filename.replace(/[^\w.-]+/g, "_")}` : ext}`;
          writeFileSync(join(dir, fname.endsWith(ext) ? fname : `${fname}${ext}`), r.buffer);
        }
      }
      console.log(`Örnek dosyalar yazıldı: ${OUT_DIR}`);
    }
  }

  console.log(`\nreports-golden-cd: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("FAIL:\n  - " + fails.join("\n  - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("HARNESS ÇÖKTÜ:", e);
  process.exit(1);
});
