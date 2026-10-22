/**
 * Beslenme Plan Word — PREMIUM DÜZEN regresyon harness'ı (SAF; DB / ağ YOK).
 *
 * Aynı fixture ağacından ESKİ (origin/main kurucusu, çalışma anında kopyalanır) ve YENİ DOCX üretir:
 *  - İÇERİK BİREBİR: her besin satırı (ad/miktar/gram/enerji), her gün toplamı ve plan genel özeti
 *    değerleri eski ile aynı sıra ve metinle (hesaplama/yuvarlama değişmedi).
 *  - DÜZEN: gövdede zorunlu sayfa sonu YOK; kapak ayrı bölüm; üst+alt bilgi; logo yalnız verildiğinde
 *    ve onaylı dosyayla bayt-bayt aynı; tablolar sabit düzen ≤ basılabilir genişlik; tablo başlığı
 *    tekrarlanır; İçindekiler YOK; Türkçe karakter.
 * Sayfa sayıları Word ile ayrıca ölçülür: --out klasörüne eski/yeni DOCX yazılır.
 *
 * Çalıştır: npx tsx scripts/beslenme-word-premium/harness.ts [--out <klasör>]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";

const ROOT = process.cwd();
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : null;
if (OUT) mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(c: unknown, label: string, extra?: unknown) {
  if (c) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}

const LEGACY = path.join(ROOT, "lib", "beslenme", "word", "__legacy_planDocxBuilder.ts");

type Tree = import("../../lib/beslenme/word/planDocxBuilder").PlanDocxTree;
type Item = Tree["days"][number]["meals"][number]["items"][number];

const N = (code: string, amount: number, unit = "g") => ({ nutrient_code: code, amount, unit_code: unit });
let seq = 0;
function item(name: string, grams: number, kcal: number | null, o: { q?: number | null; portion?: string | null } = {}): Item {
  const nutrients = [N("protein", 6.5), N("carbohydrate", 12.25), N("total_fat", 3.1), N("fiber", 1.7)];
  if (kcal != null) nutrients.push(N("energy", kcal, "kcal"));
  return { id: `i${++seq}`, food_name_snapshot: name, quantity: o.q ?? null, portion_label_snapshot: o.portion ?? null, grams, sort_order: seq, nutrients };
}
function dayOf(date: string, meals: Array<[string, Item[]]>, o: { target?: number | null; note?: string | null } = {}): Tree["days"][number] {
  return {
    id: `d-${date}`, plan_date: date, energy_target_override: o.target ?? null, note: o.note ?? null,
    meals: meals.map(([label, items], mi) => ({ id: `m-${date}-${mi}`, meal_type: null, label, sort_order: mi, items })),
  };
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function plan(title: string, start: string, days: Tree["days"], o: Partial<Tree["plan"]> = {}, extra: Partial<Tree> = {}): Tree {
  return {
    plan: { id: "p1", title, note: null, start_date: start, end_date: days.length ? days[days.length - 1]!.plan_date : start, daily_energy_target: null, status: "active", revision_number: 1, ...o },
    days,
    recipientName: null,
    expertName: "Uzm. Dyt. Ayşe Örnek",
    ...extra,
  };
}

function scenarios(): Array<[string, Tree]> {
  const one = plan("test-a", "2026-10-22", [dayOf("2026-10-22", [["Kahvaltı", [item("Haşlanmış Yumurta", 100, 155, { q: 2, portion: "adet" }), item("Tam Buğday Ekmeği", 50, 247)]]])]);
  const many = plan("Çok Öğünlü Gün", "2026-10-22", [dayOf("2026-10-22", [
    ["Kahvaltı", [item("Yulaf Ezmesi", 40, 389), item("Süt (yarım yağlı)", 200, 47), item("Muz", 120, 89)]],
    ["Ara Öğün", [item("Ceviz İçi", 20, 654)]],
    ["Öğle", [item("Izgara Tavuk Göğsü", 150, 165), item("Bulgur Pilavı", 150, 83), item("Çoban Salata", 200, 20), item("Ayran", 200, 36)]],
    ["İkindi", [item("Elma", 150, 52)]],
    ["Akşam", [item("Fırında Somon", 160, 208), item("Zeytinyağlı Taze Fasulye", 200, 64), item("Yoğurt", 150, 61)]],
    ["Gece", []],
  ])]);
  const week = (n: number, title: string) => plan(title, "2026-11-01", Array.from({ length: n }, (_, i) => dayOf(addDays("2026-11-01", i), [
    ["Kahvaltı", [item("Beyaz Peynir", 40, 264), item("Domates", 100, 18)]],
    ["Öğle", [item("Mercimek Çorbası", 250, 56), item("Tam Buğday Ekmeği", 50, 247)]],
    ["Akşam", [item("Kuru Fasulye", 200, 127), item("Pirinç Pilavı", 150, 130)]],
  ])), { daily_energy_target: 1800 });
  const empty = plan("Boş Plan", "2026-10-25", [dayOf("2026-10-25", []), dayOf("2026-10-26", [])]);
  const LONG_NAME = "Ev Yapımı Zeytinyağlı Enginar Kalbi, Taze Bezelye ve Havuçlu Garnitür (Dereotu, Limon Suyu ile)";
  const LONG_NOTE = "Bu gün su tüketimine özellikle dikkat edilmeli; öğünler arasında en az 2–2,5 litre su içilmesi önerilir. ".repeat(6);
  const longTxt = plan("Uzun Adlar ve Notlar — Çiğdem Şükrü İçli", "2026-10-22", [
    dayOf("2026-10-22", [["Öğle Yemeği (Uzun Etiketli Öğün Adı Örneği)", [item(LONG_NAME, 180, 74), item("Kalorisi Girilmemiş Ev Tarifi", 90, null)]]], { note: LONG_NOTE, target: 1500 }),
    dayOf("2026-10-23", [["Kahvaltı", [item("Haşlanmış Yumurta", 100, 155, { q: 2, portion: "adet" })]]]),
  ], { note: "Plan genel notu: " + LONG_NOTE });
  const bound = plan("Danışana Bağlı Plan", "2026-10-22", [dayOf("2026-10-22", [["Kahvaltı", [item("Yulaf Ezmesi", 40, 389)]]])], { daily_energy_target: 2000 }, { recipientName: "Ayşe Gülçiçek ÖZDEMİR" });
  return [
    ["01-bir-gun-iki-besin", one],
    ["02-bir-gun-cok-ogun", many],
    ["03-yedi-gun", week(7, "Yedi Günlük Plan")],
    ["04-yirmibir-gun", week(21, "Yirmi Bir Günlük Plan")],
    ["05-bos-plan", empty],
    ["06-uzun-ad-not", longTxt],
    ["07-hedefli-bagli", bound],
  ];
}

function unescape(s: string) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
const txt = (x: string) => Array.from(x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescape(m[1]!)).join("").trim();
function tables(xml: string): string[][][] {
  return xml.split("<w:tbl>").slice(1).map((t) => t.split("</w:tbl>")[0]!.split("</w:tr>").slice(0, -1).map((tr) => tr.split("</w:tc>").slice(0, -1).map(txt)));
}
/** İçerik imzası: besin satırları + [etiket, değer] çiftleri (gün toplamları + özet). */
function signature(xml: string) {
  const items: string[][] = [];
  const pairs: [string, string][] = [];
  for (const t of tables(xml)) {
    const cols = t[0]?.length ?? 0;
    if (cols === 4 && t[0]![0] === "Besin") items.push(...t.slice(1));
    else if (cols === 2) for (const r of t) pairs.push([r[0]!, r[1]!]);
    else if (cols === 5 && t.length === 2) t[0]!.forEach((lab, i) => pairs.push([lab, t[1]![i]!]));
  }
  return { items, pairs };
}
async function open(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/"));
  const headers = Object.keys(zip.files).filter((f) => /^word\/header\d*\.xml$/.test(f));
  return { zip, xml, media, headers };
}

async function main() {
  writeFileSync(LEGACY, execFileSync("git", ["show", "origin/main:lib/beslenme/word/planDocxBuilder.ts"], { cwd: ROOT, encoding: "utf8" }));
  try {
    const NEW = await import("../../lib/beslenme/word/planDocxBuilder");
    // Eski kurucu çalışma anında kopyalanır → statik tip çözümüne girmez (build tip kontrolü).
    const OLD = (await import(pathToFileURL(LEGACY).href)) as typeof NEW;
    const logo = readFileSync(path.join(ROOT, "public/assets/yasam-sistemi-chart-logo.png"));
    const logoSha = createHash("sha256").update(logo).digest("hex");

    for (const [name, tree] of scenarios()) {
      console.log(`\n[${name}]`);
      const before = JSON.stringify(tree);
      const o = await OLD.buildPlanDocxFromTree(tree);
      const n = await NEW.buildPlanDocxFromTree({ ...tree, logo });
      ok(o.ok && n.ok, "eski + yeni DOCX üretildi");
      if (!o.ok || !n.ok) continue;
      ok(JSON.stringify(tree) === before, "girdi ağacı değişmedi");
      ok(n.filename === o.filename, "dosya adı aynı", [o.filename, n.filename]);
      if (OUT) {
        writeFileSync(path.join(OUT, `${name}__ESKI.docx`), o.buffer);
        writeFileSync(path.join(OUT, `${name}__YENI.docx`), n.buffer);
      }
      const A = await open(o.buffer);
      const B = await open(n.buffer);
      const sa = signature(A.xml);
      const sb = signature(B.xml);
      ok(JSON.stringify(sa.items) === JSON.stringify(sb.items) && sb.items.length === tree.days.reduce((s, d) => s + d.meals.reduce((x, m) => x + m.items.length, 0), 0),
        `besin satırları BİREBİR (${sb.items.length} satır: ad/miktar/gram/enerji)`, { o: sa.items.slice(0, 2), n: sb.items.slice(0, 2) });
      ok(JSON.stringify(sa.pairs) === JSON.stringify(sb.pairs), `gün toplamları + genel özet değerleri BİREBİR (${sb.pairs.length} çift)`,
        { o: sa.pairs.filter((p, i) => JSON.stringify(p) !== JSON.stringify(sb.pairs[i])).slice(0, 3), n: sb.pairs.filter((p, i) => JSON.stringify(p) !== JSON.stringify(sa.pairs[i])).slice(0, 3) });
      const tB = txt(B.xml.replace(/<\/w:p>/g, "\n"));
      for (const d of tree.days) {
        const label = new Date(`${d.plan_date}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
        if (!tB.includes(label)) { ok(false, `gün başlığı ${label}`); break; }
      }
      ok(true, "tüm gün başlıkları mevcut");
      ok(!B.xml.includes("<w:pageBreakBefore/>") && !/<w:br w:type="page"\/>/.test(B.xml), "gövdede ZORUNLU sayfa sonu YOK", (B.xml.match(/<w:pageBreakBefore\/>/g) ?? []).length);
      ok((A.xml.match(/<w:pageBreakBefore\/>/g) ?? []).length >= 2, "ÖNCE: eski kurucu zorunlu sayfa sonları üretiyordu", (A.xml.match(/<w:pageBreakBefore\/>/g) ?? []).length);
      ok((B.xml.match(/<w:sectPr/g) ?? []).length === 2 && B.headers.length >= 1, "kapak ayrı bölüm + gövdede üst bilgi");
      const mediaSha = await Promise.all(B.media.map(async (m) => createHash("sha256").update(await B.zip.file(m)!.async("nodebuffer")).digest("hex")));
      ok(B.media.length === 1 && mediaSha[0] === logoSha, "tek görsel = onaylı logo (bayt-bayt aynı)");
      ok(!/İÇİNDEKİLER|TOC \\/.test(B.xml) && !B.xml.includes("w:sdt"), "İçindekiler YOK");
      const tbls = B.xml.split("<w:tbl>").slice(1);
      const grid = tbls.map((t) => Array.from((t.split("</w:tblGrid>")[0] ?? "").matchAll(/<w:gridCol w:w="(\d+)"/g)).reduce((s, m) => s + Number(m[1]), 0));
      ok(tbls.every((t) => t.includes('<w:tblLayout w:type="fixed"/>')) && Math.max(0, ...grid) <= 9638, "tablolar sabit düzen, ≤ basılabilir genişlik", grid);
      const dataT = tbls.filter((t) => t.includes(">Besin<"));
      ok(dataT.every((t) => t.includes("<w:tblHeader/>")) && dataT.every((t) => (t.match(/<w:cantSplit\/>/g) ?? []).length >= 2), "besin tablolarında başlık tekrarı + satır bölünmez");
      ok(tB.includes("Bilgilendirme") && tB.includes("Plan Genel Özeti"), "özet + bilgilendirme mevcut");
      if (tree.recipientName) ok(tB.includes(tree.recipientName), "bağlı danışan adı kapakta");
      else ok(!tB.includes("Danışan:"), "bağlı olmayan planda danışan satırı yok");
    }

    console.log("\n[logo yoksa]");
    const [, one] = scenarios()[0]!;
    const noLogo = await NEW.buildPlanDocxFromTree(one);
    if (noLogo.ok) {
      const C = await open(noLogo.buffer);
      ok(C.media.length === 0 && C.xml.includes("YAŞAM SİSTEMİ"), "logo verilmezse görsel ÜRETİLMEZ, yazı ile marka");
    }

    console.log("\n[kaynak kapıları]");
    const lay = readFileSync(path.join(ROOT, "lib/beslenme/word/planDocxLayout.ts"), "utf8");
    for (const tok of ["fetchImageBuffer", "fetch(", "axios", "http.get", "https.get", "embedImageParagraph"]) ok(!lay.includes(tok), `planDocxLayout: '${tok}' YOK`);
    ok((lay.match(/new ImageRun\(/g) ?? []).length === 1 && /data: logo/.test(lay), "planDocxLayout: tek ImageRun = parametre logo");
    const bld = readFileSync(path.join(ROOT, "lib/beslenme/word/planDocxBuilder.ts"), "utf8");
    ok(!/pageBreakBefore/.test(bld), "kurucuda pageBreakBefore yok");
    ok(!/reportHelpers"[\s\S]*buildPremiumCover/.test(bld), "ortak kapak yerine Beslenme kapağı");
  } finally {
    if (existsSync(LEGACY)) rmSync(LEGACY);
  }
}

main()
  .catch((e) => { fail++; fails.push(String(e)); console.error(e); })
  .finally(() => {
    console.log(`\nBeslenme Word premium harness: ${pass} PASS / ${fail} FAIL`);
    if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
    process.exit(fail ? 1 : 0);
  });
