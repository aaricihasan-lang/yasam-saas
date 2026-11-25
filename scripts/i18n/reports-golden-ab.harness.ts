/**
 * I18N — RAPOR GOLDEN HARNESS'I, grup A + B (I18N-F1-R5 RAPOR-AB).
 * Üreticiler: P01/P02 Danışan Yolculuğu Word, P03 Anamnez PDF, P07 Ajanda Word, P26 Ürün/Stok Word.
 * (Kupa pilotu + ortak motorlar: scripts/i18n/reports-golden.harness.ts — bu dosya ona DOKUNMAZ, aynı normalizasyonu kullanır.)
 *
 * Çalıştırma (repo kökü):
 *   npx tsx scripts/i18n/reports-golden-ab.harness.ts                 → TR golden + EN dil kontrolleri
 *   … --write-golden                                                    → TR golden'ı yazar (yalnız golden YOKSA)
 *   … --write-golden --overwrite                                        → bilinçli golden güncellemesi (PR'da diff görünür)
 *   … --out <dizin>                                                     → TR + EN örnek dosyaları diske yazar (kanıt)
 *   … --only P07,P26                                                    → yalnız bu üreticiler
 *
 * KURAL: Golden, üretici değişikliğinden ÖNCE taban SHA'da üretilir. Sonraki her koşuda
 *   (1) bugünkü (parametresiz) çağrı ve (2) açık Türkçe çıktı dili → parça bazında normalize SHA golden'a EŞİT;
 *   (3) İngilizce → kullanıcı nöbetçileri AYNEN, Türkçe sistem metni = 0, sayılar TR = EN, belge dili en-GB, dosya adı İngilizce.
 * Saat dondurulur (ab/setup.ts); DB / ağ / sır YOK; tamamen sentetik fikstür.
 */
import "./reports-golden/ab/setup";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { allFixtures, type Fixture, type Mode } from "./reports-golden/ab/fixtures";
import { digest, docxParts, sha, textNodes } from "./reports-golden/normalize";
import { capturePdfText, normalizePdf } from "./reports-golden/ab/pdf";

const ROOT = process.cwd();
const GOLDEN = join(ROOT, "scripts/i18n/golden/reports-ab-tr.golden.json");
const args = process.argv.slice(2);
const WRITE = args.includes("--write-golden");
const OVERWRITE = args.includes("--overwrite");
const outIdx = args.indexOf("--out");
const OUT_DIR = outIdx >= 0 ? args[outIdx + 1] : null;
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1]!.split(",")) : null;
/** Çevirisi bu dalda tamamlanan üreticiler — EN kontrolleri yalnız bunlarda zorunlu (diğerleri yalnız TR golden). */
const EN_READY = new Set((process.env.RAB_EN_READY ?? "P01,P02,P03,P07,P26").split(",").filter(Boolean));

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
  if (fx.kind === "pdf") {
    const { result, texts } = await capturePdfText(() => fx.run(mode));
    return { fx, buffer: result.buffer, filename: result.filename, texts };
  }
  const r = await fx.run(mode);
  return { fx, buffer: r.buffer, filename: r.filename };
}

async function snap(r: Run): Promise<Snap> {
  if (r.fx.kind === "pdf") {
    const n = normalizePdf(r.buffer);
    return { filename: r.filename, digest: sha(n), parts: { "pdf(normalize)": sha(n) } };
  }
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
  /\b(Sayfa|Takvim|Kaynak|Bilgiler|Hazirlayan|Ocak|Mart|Nisan|Haziran|Temmuz|Ekim|Kasim|Aralik|Pazartesi|Cuma|Pazar|Genel|Sonrasi|Oncesi|gun|daha|ilk|Tarih|Rapor|Uzman|Bilgilendirme|Randevu|Randevular|Randevusu|Danisan|Kapsam|Toplam|Bekliyor|Tamamlandi|Iptal|Urun|Stok|Kategori|Tumu|Kritik|Tukenmis|Diger|Yag|Sabun|Krem|Tespih|Aksesuar|Seans|Odev|Analiz|Notlar|Burc|Kan|Mizac|Durum|Tur|Adet|adet|Ajanda|Haftalik|Aylik|Secili|Tek|Gorusme|Genel|Yolculuk|Yolculugu|Tutar|Odendi|Kayit)\b/;
const USER_RE = /⟦[^⟧]*⟧/g;
const NAMESPACES = ["reports.common", "reports.agenda", "reports.stock", "reports.clients"];
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
      if (typeof en[k] === "string") enFolded.add(fold(en[k]!).toLowerCase());
      if (en[k] === v) continue;
      for (const part of v.split(/\{[^}]*\}|·|•|\+|—|\/|\(|\)|:/)) {
        const t = part.trim();
        if (t.replace(/[^A-Za-zÇĞİÖŞÜçğıöşüâîû]/g, "").length >= 4) frags.add(t);
      }
    }
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Hem birebir hem ASCII'ye katlanmış + büyük/küçük harf duyarsız eşleşme ("ÜRÜN #" → "URUN #" sızıntısı da yakalanır).
  return [...frags].flatMap((text) => [
    { text, re: new RegExp(`(^|[^A-Za-zÇĞİÖŞÜçğıöşü])${esc(text)}($|[^A-Za-zÇĞİÖŞÜçğıöşü])`) },
    ...(enFolded.has(fold(text).toLowerCase()) ? [] : [{ text: `${text} (ASCII)`, re: new RegExp(`(^|[^A-Za-z])${esc(fold(text))}($|[^A-Za-z])`, "i"), folded: true }]),
  ]);
})();
/** Türkçe harfleri ASCII karşılığına katlar (büyük/küçük korunur). */
function fold(t: string): string {
  const map: Record<string, string> = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U", â: "a", Â: "A", î: "i", Î: "I", û: "u", Û: "U" };
  return t.replace(/[çÇğĞıİöÖşŞüÜâÂîÎûÛ]/g, (c) => map[c] ?? c);
}

function leakOf(t: string): string | null {
  const s = t.replace(/Yaşam Sistemi|YAŞAM SİSTEMİ/g, "");
  const frag = TR_CATALOG_FRAGMENTS.find((f) => (f.folded ? f.re.test(fold(s)) : f.re.test(s)));
  if (TR_LETTERS.test(s) || TR_ASCII_WORDS.test(s) || frag) return `«${t}»${frag ? ` (TR katalog parçası «${frag.text}»)` : ""}`;
  return null;
}

async function textsOf(r: Run): Promise<{ system: string[]; user: string[]; nums: string; xml: Record<string, string> }> {
  if (r.fx.kind === "pdf") {
    const all = r.texts ?? [];
    const system = all.map((t) => t.replace(USER_RE, " ")).filter((t) => t.trim());
    return { system, user: all.flatMap((t) => t.match(USER_RE) ?? []), nums: (system.join(" ").match(/\d+/g) ?? []).sort().join(","), xml: {} };
  }
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
    ok(/<w:lang w:val="en-GB"/.test(b.xml["word/styles.xml"] ?? ""), `EN ${name}: belge dili w:lang=en-GB`);
    ok(!/w:lang w:val="tr-TR"/.test(Object.values(b.xml).join("")), `EN ${name}: belgede tr-TR dil işareti yok`);
  } else {
    const raw = en.buffer.toString("latin1");
    ok(/\/Lang \(en-GB\)/.test(raw), `EN ${name}: PDF /Lang (en-GB)`);
  }
  if (en.filename) {
    const f = en.filename.replace(USER_RE, "");
    ok(!TR_ASCII_WORDS.test(f.replace(/[-_.]/g, " ")) && !TR_LETTERS.test(f), `EN ${name}: dosya adı sistem kısmı İngilizce (${en.filename})`);
  }
}

/** Sözleşme/katman birim kontrolleri: hesap–etiket ayrımı, TR birebir sabitler, ICU, katalog tamlığı. */
async function unitChecks(): Promise<void> {
  const { reportLocaleFor } = await import("@/lib/i18n/reportLocale");
  const tr = reportLocaleFor("tr");
  const en = reportLocaleFor("en");
  const now = new Date("2026-11-25T09:30:00Z");
  // P07: durum HESABI dilden bağımsız; TR etiketleri eski sabitlerle birebir.
  const A = await import("@/app/api/ajanda/word-report/buildAjandaReport");
  const cases: [string | null, string, string, string][] = [
    ["tamamlandi", "2026-11-20T09:00:00Z", "Tamamlandı", "Completed"],
    ["iptal", "2026-11-20T09:00:00Z", "İptal Edildi", "Cancelled"],
    ["bekliyor", "2026-11-20T09:00:00Z", "Sonuç girilmedi", "No outcome entered"],
    ["bekliyor", "2026-11-30T09:00:00Z", "Bekliyor", "Pending"],
  ];
  for (const [st, at, trL, enL] of cases) {
    ok(A.ajandaStatusLabel(st, at, now) === trL && A.ajandaStatusLabel(st, at, now, tr) === trL && A.ajandaStatusLabel(st, at, now, en) === enL, `P07 durum etiketi ${st}@${at.slice(0, 10)} → tr «${trL}» · en «${enL}»`);
  }
  // P26: kritik eşiği dilden bağımsız; >999 sayım TR'de gruplamasız (eski `${n} ürün`).
  const S = await import("@/lib/urun-stok/stockReportWord");
  ok(S.isCriticalStockRow({ stock: 300, unit: "ml" }) && !S.isCriticalStockRow({ stock: 301, unit: "ml" }) && S.isCriticalStockRow({ stock: 0, unit: "adet" }), "P26 kritik eşik (ml 300 / adet 5) değişmedi");
  const st = tr.t("reports.stock");
  const se = en.t("reports.stock");
  ok(st("summary.productCount", { count: 1200, shown: "1200" }) === "1200 ürün", `P26 TR sayım gruplamasız: ${st("summary.productCount", { count: 1200, shown: "1200" })}`);
  ok(se("summary.productCount", { count: 1, shown: "1" }) === "1 product" && se("summary.productCount", { count: 3, shown: "3" }) === "3 products", "P26 EN çoğul (ICU)");
  // P01: metin katmanı — kanonik kod → etiket; TR eski sabitlerle birebir.
  const { dyText } = await import("@/app/api/clients/[id]/word-report/clientReportText");
  const xt = dyText();
  const xe = dyText(en);
  ok(xt.money(1500) === "1.500 ₺" && xt.money(350.5) === "350,50 ₺" && xe.money(1500) === "₺1,500" && xe.money(350.5) === "₺350.50", `P01 para TRY sabit, biçim dile göre — ${xt.money(350.5)} · ${xe.money(350.5)}`);
  ok(xt.temperament("sovdavi") === "Sovdavi" && xe.temperament("Sovdavi") === "Melancholic" && xe.temperament("serbest metin") === "serbest metin", "P01 mizaç: kanonik kod → etiket; serbest metin aynen");
  ok(xt.homeworkStatus("devam") === "Devam Ediyor" && xe.homeworkStatus("gecikti") === "Overdue" && xe.homeworkStatus("ozel") === "ozel" && xt.homeworkStatus(null) === "Bilinmiyor", "P01 ödev durumu etiketi (bilinmeyen → ham / Bilinmiyor)");
  ok(xt.paymentStatus("paid") === "Ödendi" && xe.paymentStatus(null) === "Not specified", "P01 ödeme durumu etiketi");
  ok(xt.analysisType("planet") === "Çakra-Gezegen Analizi" && xe.analysisType("x") === "Analysis", "P01 analiz türü etiketi");
  // Katalog tamlığı (EN'de eksik anahtar → sessiz TR düşüşü olmasın).
  const leaves = (o: unknown, p = ""): string[] => (o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k)) : [p]);
  for (const ns of ["reports.agenda", "reports.stock", "reports.clients"]) {
    const la = leaves(JSON.parse(readFileSync(join(ROOT, `messages/tr/${ns}.json`), "utf8"))).sort();
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
    const g: GoldenFile = { baseSha: dirty ? `${baseSha}+kirli` : baseSha, generator: "scripts/i18n/reports-golden-ab.harness.ts", fixtures: trSnap };
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

  console.log(`\nreports-golden-ab: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("FAIL:\n  - " + fails.join("\n  - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("HARNESS ÇÖKTÜ:", e);
  process.exit(1);
});
