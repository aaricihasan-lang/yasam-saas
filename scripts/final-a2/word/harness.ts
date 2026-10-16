/**
 * FINAL-A2 — Word İçindekiler (boş TOC) + Danışan tarih-aralığı alt başlığı regresyon harness'ı (2026-10-15).
 *
 * Eski `buildTOCPage()` yalnız BOŞ bir Word TOC alanı (w:sdt + `TOC \h \o "1-2"`) üretiyordu; `updateFields`
 * olmadığından Word'de (LibreOffice/mobilde hiç) İçindekiler BOŞ görünüyordu. Yeni düzen
 * (`StaticTocCollector`, lib/docx/premiumToc.ts): statik + tıklanabilir + PAGEREF girişler.
 *
 * Her etkilenen rapor GERÇEK kodla (saf oluşturucu doğrudan; route-içi oluşturucular sahte
 * kimlik/DB stub'ı ile route POST'u çağrılarak) sentetik fixture'dan üretilir ve DOCX XML'i SIKI
 * doğrulanır:
 *   - boş TOC alanı / SDT YOK,
 *   - İçindekiler giriş sayısı == H1+H2 başlık sayısı, metinler sırayla aynı,
 *   - her w:hyperlink w:anchor → başlık paragrafındaki var olan yer imi; PAGEREF aynı sırada; w:id benzersiz,
 *   - updateFields yalnız İçindekiler varken AÇIK,
 *   - başlık yoksa İçindekiler sayfası YOK; sayfa sonu sayısı ARTMAZ,
 *   - "ÖNCE" kontrolü: aynı fixture origin/main (692ed772) kodundan üretildiğinde boş TOC alanı VARDI,
 *   - veri kaybı yok: eski belgedeki her metin yeni belgede de var; alt bilgi XML'i aynı,
 *   - Danışan tarih-aralığı kapak alt başlığı: "… Arası Danışan Yolculuğu Özeti".
 * Prod'a / DB'ye SIFIR temas (sahte DB, no-op Usage360). Opsiyonel: OUT_DIR verilirse DOCX'ler yazılır.
 *
 * Çalıştır: npx tsx scripts/final-a2/word/harness.ts
 */
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import JSZip from "jszip";
import { Document as DocxDocument, Packer, Paragraph, TextRun, type Document } from "docx";
import { bodyText, buildTOCPage } from "../../../lib/docx/reportHelpers";
import { buildStaticTocPage, StaticTocCollector } from "../../../lib/docx/premiumToc";
import { NextRequest } from "next/server";

const ROOT = path.resolve(__dirname, "../../..");
const BASE_REF = process.env.BASE_REF ?? "692ed772";
const OUT_DIR = process.env.OUT_DIR;
const LEGACY_DIR = path.join(__dirname, ".legacy");

// ─── Modül stub'ları: kimlik kapısı + Usage360 (gerçek DB/oturum YOK) ───
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stubs: Record<string, string> = {
    "@/lib/auth/userGuard": path.join(__dirname, "stubs", "userGuard.cjs"),
    "@/lib/usage/trackUsage": path.join(__dirname, "stubs", "trackUsage.cjs"),
    "server-only": path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs"),
  };
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (stubs[req]) return stubs[req]!;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else { fail++; failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ─── XML yardımcıları ───
const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const runs = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => unesc(m[1]!));
const paragraphs = (xml: string) => [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>|<w:p [^>]*>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
const pText = (p: string) => runs(p).join("");
const TOC_FIELD_RE = /<w:instrText[^>]*>\s*TOC\b/;
const SDT_RE = /<w:sdt>|<w:sdt /;
const BREAK_RE = /<w:pageBreakBefore\/>|<w:pageBreakBefore w:val="(?:true|1|on)"\/>|<w:br w:type="page"\/>/g;
const OLD_NOTE = "Not: Belge düzenlenirse İçindekiler alanını Word üzerinden güncelleyebilirsiniz.";
const NEW_NOTE = "Başlığa tıklayarak ilgili bölüme gidebilirsiniz. Sayfa numaralarını Word, belge açılırken günceller.";

type Parsed = { doc: string; settings: string; footers: string[]; buf: Buffer };
async function parse(buf: Buffer): Promise<Parsed> {
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file("word/document.xml")!.async("string");
  const settings = (await zip.file("word/settings.xml")?.async("string")) ?? "";
  const names = Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f)).sort();
  const footers = await Promise.all(names.map((f) => zip.file(f)!.async("string")));
  return { doc, settings, footers, buf };
}
const docBuf = (d: Document) => Packer.toBuffer(d);

type Analysis = {
  headings: { level: 1 | 2; text: string; bookmarks: string[] }[];
  anchors: string[];
  pagerefs: string[];
  bmIds: string[];
  bmNames: string[];
  tocTitleCount: number;
  breaks: number;
  hasTocField: boolean;
  hasSdt: boolean;
  updateFields: boolean;
};
function analyze(p: Parsed): Analysis {
  const headings: Analysis["headings"] = [];
  for (const para of paragraphs(p.doc)) {
    const m = /<w:pStyle w:val="Heading([12])"\/>/.exec(para);
    if (!m) continue;
    headings.push({
      level: m[1] === "1" ? 1 : 2,
      text: pText(para),
      bookmarks: [...para.matchAll(/<w:bookmarkStart [^>]*w:name="([^"]+)"/g)].map((x) => x[1]!),
    });
  }
  return {
    headings,
    anchors: [...p.doc.matchAll(/<w:hyperlink [^>]*w:anchor="([^"]+)"/g)].map((x) => x[1]!),
    pagerefs: [...p.doc.matchAll(/PAGEREF ([A-Za-z0-9_]+) \\h/g)].map((x) => x[1]!),
    bmIds: [...p.doc.matchAll(/<w:bookmarkStart [^>]*w:id="([^"]+)"/g)].map((x) => x[1]!),
    bmNames: [...p.doc.matchAll(/<w:bookmarkStart [^>]*w:name="([^"]+)"/g)].map((x) => x[1]!),
    tocTitleCount: runs(p.doc).filter((t) => t === "İÇİNDEKİLER").length,
    breaks: (p.doc.match(BREAK_RE) ?? []).length,
    hasTocField: TOC_FIELD_RE.test(p.doc),
    hasSdt: SDT_RE.test(p.doc),
    updateFields: /<w:updateFields(?: w:val="(?:true|1)")?\/>/.test(p.settings),
  };
}

/** İçindekiler giriş metinleri (hyperlink içindeki run'lar, sırayla). */
function tocEntryTexts(doc: string): string[] {
  return [...doc.matchAll(/<w:hyperlink [^>]*w:anchor="[^"]+"[^>]*>([\s\S]*?)<\/w:hyperlink>/g)].map((m) => runs(m[1]!).join(""));
}

function multisetMissing(oldRuns: string[], newRuns: string[], ignore: Set<string>): string[] {
  const bag = new Map<string, number>();
  for (const t of newRuns) bag.set(t, (bag.get(t) ?? 0) + 1);
  const missing: string[] = [];
  for (const t of oldRuns) {
    if (ignore.has(t)) continue;
    const n = bag.get(t) ?? 0;
    if (n > 0) bag.set(t, n - 1); else missing.push(t);
  }
  return missing;
}

type Summary = { label: string; entries: number; headings: number; breaksOld: number; breaksNew: number; oldEmptyToc: boolean };
const summary: Summary[] = [];

/**
 * Tek bir rapor için ÖNCE/SONRA doğrulaması.
 * `expectToc=false` → başlık yok/yeni düzende İçindekiler sayfası beklenmez.
 */
async function verify(label: string, newBuf: Buffer, oldBuf: Buffer | null, opts: {
  expectToc: boolean;
  /** Eski belgede TOC hiç yoktu (ör. kompakt Ücretlendirme sekmesi) → kontrol beklenmez. */
  oldHadToc?: boolean;
  ignoreOld?: string[];
} ) {
  const p = await parse(newBuf);
  const a = analyze(p);
  if (OUT_DIR) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${label.replace(/[^A-Za-z0-9_-]+/g, "_")}.docx`), newBuf); }

  check(`${label}: boş Word TOC alanı YOK`, !a.hasTocField);
  check(`${label}: TOC SDT YOK`, !a.hasSdt);
  const entryTexts = tocEntryTexts(p.doc);
  if (opts.expectToc) {
    check(`${label}: başlık sayısı > 0`, a.headings.length > 0, `h=${a.headings.length}`);
    check(`${label}: TOC giriş sayısı == H1+H2 başlık sayısı (${a.headings.length})`, a.anchors.length === a.headings.length, `anchor=${a.anchors.length}`);
    check(`${label}: giriş metinleri = başlık metinleri (sırayla)`, JSON.stringify(entryTexts) === JSON.stringify(a.headings.map((h) => h.text)),
      `toc=${JSON.stringify(entryTexts.slice(0, 4))} h=${JSON.stringify(a.headings.slice(0, 4).map((h) => h.text))}`);
    check(`${label}: her anchor → sıradaki başlık paragrafındaki yer imi`, a.anchors.every((id, i) => a.headings[i]?.bookmarks.includes(id)));
    check(`${label}: her anchor için yer imi var (tek)`, a.anchors.every((id) => a.bmNames.filter((n) => n === id).length === 1));
    check(`${label}: PAGEREF sırası == anchor sırası`, JSON.stringify(a.pagerefs) === JSON.stringify(a.anchors));
    check(`${label}: yer imi w:id benzersiz`, new Set(a.bmIds).size === a.bmIds.length);
    check(`${label}: yer imi adları Word kuralına uygun (≤40, harfle başlar)`, a.bmNames.every((n) => n.length <= 40 && /^[A-Za-z][A-Za-z0-9_]*$/.test(n)));
    check(`${label}: tek "İÇİNDEKİLER" başlığı`, a.tocTitleCount === 1, `n=${a.tocTitleCount}`);
    check(`${label}: updateFields AÇIK`, a.updateFields);
    check(`${label}: yeni yönerge notu var, eski "alanı güncelle" notu yok`, p.doc.includes(NEW_NOTE) && !p.doc.includes("İçindekiler alanını Word"));
  } else {
    check(`${label}: başlık yok/kompakt → İçindekiler sayfası YOK`, a.tocTitleCount === 0 && a.anchors.length === 0);
    check(`${label}: updateFields KAPALI (gereksiz alan güncelleme istemi yok)`, !a.updateFields);
  }

  let breaksOld = -1;
  let oldEmptyToc = false;
  if (oldBuf) {
    const o = await parse(oldBuf);
    const oa = analyze(o);
    breaksOld = oa.breaks;
    oldEmptyToc = oa.hasTocField && oa.hasSdt && oa.anchors.length === 0;
    if (opts.oldHadToc !== false) {
      check(`${label}: (ÖNCE kontrolü) eski kod BOŞ TOC alanı üretiyordu (SDT + TOC alanı, 0 giriş, updateFields yok)`,
        oldEmptyToc && !oa.updateFields);
      // TOC sayfası korunur → aynı; başlık yoksa TOC sayfası kalkar → bir eksik.
      const expectBreaks = opts.expectToc ? oa.breaks : oa.breaks - 1;
      check(`${label}: sayfa sonu sayısı artmadı (eski=${oa.breaks}, yeni=${a.breaks})`, a.breaks === expectBreaks && a.breaks <= oa.breaks);
      check(`${label}: H1/H2 başlık metinleri eski düzenle aynı`, JSON.stringify(a.headings.map((h) => h.text)) === JSON.stringify(oa.headings.map((h) => h.text)));
    } else {
      check(`${label}: (kontrol) eski düzende de TOC yoktu`, !oa.hasTocField);
      check(`${label}: sayfa sonu sayısı aynı (eski=${oa.breaks}, yeni=${a.breaks})`, a.breaks === oa.breaks);
    }
    const ignore = new Set(["İÇİNDEKİLER", OLD_NOTE, ...(opts.ignoreOld ?? [])]);
    const missing = multisetMissing(runs(o.doc), runs(p.doc), ignore);
    check(`${label}: veri kaybı yok (eski belgedeki tüm metinler yeni belgede)`, missing.length === 0, JSON.stringify(missing.slice(0, 5)));
    check(`${label}: alt bilgi XML'i eski düzenle BİREBİR aynı`, JSON.stringify(o.footers) === JSON.stringify(p.footers));
  }
  summary.push({ label, entries: a.anchors.length, headings: a.headings.length, breaksOld, breaksNew: a.breaks, oldEmptyToc });
  return { p, a };
}

// ─── Eski (origin/main) kaynakları — ÖNCE kontrolü için geçici kopyalar ───
function legacyCopy(rel: string, name: string): string {
  const src = execSync(`git show ${BASE_REF}:"${rel}"`, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  fs.mkdirSync(LEGACY_DIR, { recursive: true });
  const out = path.join(LEGACY_DIR, `${name}.ts`);
  fs.writeFileSync(out, src);
  return out;
}

/** Mutlak yol ile CJS yükleme (tsx; stub çözümlemesi `_resolveFilename` üzerinden uygulanır). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (abs: string) => require(abs);

// ─── Sahte Supabase istemcisi (yalnız okuma; eq/in filtre + range sayfalama) ───
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let range: [number, number] | null = null;
    let single = false;
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
            const data = range ? rows.slice(range[0], range[1] + 1) : rows;
            const out = single ? { data: data[0] ?? null, error: null } : { data, error: null, count: rows.length };
            return Promise.resolve(out).then(res, rej);
          };
        }
        if (prop === "eq") return (c: string, v: unknown) => { rows = rows.filter((r) => !(c in r) || r[c] === v); return b; };
        if (prop === "in") return (c: string, vs: unknown[]) => { rows = rows.filter((r) => !(c in r) || vs.includes(r[c])); return b; };
        if (prop === "range") return (f: number, t: number) => { range = [f, t]; return b; };
        if (prop === "single" || prop === "maybeSingle") return () => { single = true; return b; };
        return () => b;
      },
    });
    return b;
  };
  return { from, storage: { from: () => ({ download: async () => ({ data: null, error: { message: "yok" } }) }) } };
}

const TENANT = "00000000-0000-4000-8000-0000000000a2";
function setGuard(tables: Record<string, Row[]>) {
  (globalThis as Record<string, unknown>).__FA2_GUARD__ = {
    ok: true, db: fakeDb(tables), tenantId: TENANT, userId: "00000000-0000-4000-8000-0000000000b2",
    email: "zz.final.a2@example.test", is_demo_account: false,
    profile: { full_name: "ZZ_Uzman Ş", name: "ZZ_Uzman Ş" },
  };
}
function req(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130" },
    body: JSON.stringify(body),
  });
}
async function callRoute(mod: { POST: (r: NextRequest) => Promise<Response> }, url: string, body: unknown): Promise<Buffer> {
  const { __resetRateLimitForTest } = await import("../../../lib/security/rateLimit");
  __resetRateLimitForTest();
  const res = await mod.POST(req(url, body));
  if (res.status !== 200) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// 1×1 PNG (yatay analiz görsel sayfası için).
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const TR = "ĞÜŞİÖÇ ğüşıöç";
const NOW = new Date("2026-10-15T09:00:00.000Z");
const iso = (d: number, h = 9) => new Date(Date.UTC(2026, 9, d, h, 0, 0)).toISOString();
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function main() {
  try {
    // ════════ 1) AJANDA (saf oluşturucu) ════════
    {
      const NEW = await import("../../../app/api/ajanda/word-report/buildAjandaReport");
      const OLD = load(legacyCopy("app/api/ajanda/word-report/buildAjandaReport.ts", "buildAjandaReport.legacy"));
      const appointments = [
        { id: uid(1), title: `Görüşme A ${TR}`, notes: "Not A", appointment_date: iso(10), created_at: iso(1), client_id: uid(90), status: "tamamlandi" },
        { id: uid(2), title: "Görüşme B", notes: null, appointment_date: iso(10, 13), created_at: iso(1), client_id: null, status: "bekliyor" },
        { id: uid(3), title: "Görüşme C", notes: null, appointment_date: iso(12), created_at: iso(1), client_id: uid(90), status: "iptal" },
        { id: uid(4), title: null, notes: "Gece", appointment_date: "2026-10-14T22:30:00.000Z", created_at: iso(1), client_id: null, status: "bekliyor" },
      ];
      const input = { appointments, clientMap: new Map([[uid(90), `ZZ Danışan ${TR}`]]), exportMode: "all" as const, now: NOW, expertName: "ZZ_Uzman" };
      await verify("Ajanda · 4 randevu/3 gün", await docBuf(NEW.buildAjandaReportDoc(input).doc), await docBuf(OLD.buildAjandaReportDoc(input).doc), { expectToc: true });
      const one = { ...input, appointments: appointments.slice(0, 1), exportMode: "single" as const };
      await verify("Ajanda · tek randevu", await docBuf(NEW.buildAjandaReportDoc(one).doc), await docBuf(OLD.buildAjandaReportDoc(one).doc), { expectToc: true });
    }

    // ════════ 2) BİYOENERJİ SEANS (saf oluşturucu) ════════
    {
      const NEW = await import("../../../app/api/biyoenerji/session-report/buildSessionReport");
      const OLD = load(legacyCopy("app/api/biyoenerji/session-report/buildSessionReport.ts", "buildSessionReport.legacy"));
      const sessions = Array.from({ length: 3 }, (_, i) => ({
        id: uid(100 + i), tenant_id: TENANT, title: `ZZ Seans ${i + 1} ${TR}`, content: `İçerik ${i}`, category: "Kategori Ç",
        source: "Kaynak", note: i === 0 ? "Not" : null, created_at: iso(5 + i),
      }));
      const input = { sessions, exportMode: "all" as const, now: NOW, expertName: "ZZ_Uzman", truncatedNote: "ZZ kesildi notu" };
      await verify("Biyoenerji · Seans (3)", await docBuf(NEW.buildBioSessionReportDoc(input).doc), await docBuf(OLD.buildBioSessionReportDoc(input).doc), { expectToc: true });
    }

    // ════════ 3) DOĞALTAŞ TEK TAŞ (saf oluşturucu) ════════
    {
      const NEW = await import("../../../app/api/dogaltas/stones/[id]/word-report/buildStoneReport");
      const OLD = load(legacyCopy("app/api/dogaltas/stones/[id]/word-report/buildStoneReport.ts", "buildStoneReport.legacy"));
      type StoneRow = Parameters<typeof NEW.buildStoneReportDoc>[0]["stone"];
      const full: StoneRow = {
        id: uid(200), tenant_id: TENANT, stone_name: `ZZ Ametist ${TR}`, short_description: "Kısa", general_info: "Genel", source_note: "Kaynak notu",
        physical_effects: "Fiziksel", spiritual_effects: "Ruhsal", other_effects: "Diğer", warning_text: "Uyarı", warning_tags: ["Hamilelik"],
        feng_shui: "Feng", meditation: "Medit", care: "Bakım", application: "Uygulama", chakras: ["Kalp Çakrası"],
        assignments: { Burçlar: [["Koç"], ["Boğa"]] }, images: null, created_at: iso(1), updated_at: null, primary_source_name: "Birincil Kaynak",
      };
      const extra = [{ name: "Ek Kaynak Ü", fields: { general_info: "Ek genel", physical_effects: "Ek fiziksel", chakras: ["Taç"] } }];
      const mk = (m: typeof NEW, stone: StoneRow, ex: typeof extra) =>
        m.buildStoneReportDoc({ stone, imageBuf: null, isLibrary: false, expertName: "ZZ_Uzman", now: NOW, extraSources: ex as never }).doc;
      // Tek kaynaklı (adlı birincil) taş: yeni kurucu ESKİ düzenle birebir.
      await verify("Doğaltaş · tek taş (dolu, tek kaynak)", await docBuf(mk(NEW, full, [])), await docBuf(mk(OLD as typeof NEW, full, [])), { expectToc: true });
      // Manuel test Madde 14: çok kaynaklı taşta düzen BİLİNÇLİ değişti (kaynak başına bölüm → alan içinde
      // "Kaynak: <ad>" blokları) → eskiyle başlık eşitliği beklenmez; yapı kontrolleri + İÇERİK KAYBI YOK.
      const multiBuf = await docBuf(mk(NEW, full, extra));
      await verify("Doğaltaş · tek taş (dolu + ek kaynak)", multiBuf, null, { expectToc: true });
      {
        const txt = paragraphs((await parse(multiBuf)).doc).map(pText).join("\n");
        const must = ["Kısa", "Genel", "Kaynak notu", "Fiziksel", "Ruhsal", "Diğer", "Uyarı", "Hamilelik", "Feng", "Medit", "Bakım", "Uygulama",
          "Kalp Çakrası", "Koç", "Ek genel", "Ek fiziksel", "Taç", "Kaynak: Birincil Kaynak", "Kaynak: Ek Kaynak Ü"];
        const missing = must.filter((m) => !txt.includes(m));
        check("Doğaltaş · tek taş (dolu + ek kaynak): veri kaybı yok (tüm kaynak metinleri + kaynak etiketleri var)", missing.length === 0, JSON.stringify(missing));
        const iP = txt.indexOf("•  Fiziksel\nKaynak: Birincil Kaynak"), iE = txt.indexOf("•  Ek fiziksel\nKaynak: Ek Kaynak Ü");
        check("Doğaltaş · tek taş (dolu + ek kaynak): Fiziksel Etkiler altında iki kaynak ayrı ve sıralı", iP >= 0 && iE > iP, JSON.stringify({ iP, iE }));
      }
      const empty: StoneRow = { ...full, short_description: null, general_info: null, source_note: null, physical_effects: null, spiritual_effects: null,
        other_effects: null, warning_text: null, warning_tags: null, feng_shui: null, meditation: null, care: null, application: null,
        chakras: null, assignments: null, primary_source_name: null };
      await verify("Doğaltaş · tek taş (boş alanlar → yalnız 4 bölüm başlığı)", await docBuf(mk(NEW, empty, [])), await docBuf(mk(OLD as typeof NEW, empty, [])), { expectToc: true });
    }

    // ════════ 4) DANIŞAN YOLCULUĞU — sekme + tarih aralığı (saf oluşturucu) ════════
    {
      const NEW = await import("../../../app/api/clients/[id]/word-report/clientReportBuilder");
      const OLD = load(legacyCopy("app/api/clients/[id]/word-report/clientReportBuilder.ts", "clientReportBuilder.legacy"));
      const client = { id: uid(300), ad: `ZZ Ayşe ${TR}`, soyad: "Yılmaz", telefon: "0555", dogum: "1990-01-02", gorusme: "2026-10-01", mizac: "sicak" };
      const notes = { saglik_notu: "Sağlık", adres: "Adres", oneriler: "Öneri", notlar: "Not metni" };
      const appointments = [{ id: uid(301), title: "görüşme bir", notes: "N", appointment_date: iso(3), status: "tamamlandi" }, { id: uid(302), title: null, appointment_date: iso(4), status: null }];
      const stones = [{ id: uid(311), stone_name: "ametist", stone_type: "Kolye", usage_area: "Kullan", note: "Not", stone_date: "2026-10-03", created_at: iso(3) }];
      const sessions = [{ id: uid(321), session_date: "2026-10-04", session_type: "reiki", duration_minutes: 45, session_note: "SN", suggestions: "Ö", created_at: iso(4) }];
      const charges = [
        { id: uid(331), charge_date: "2026-10-04", category: "session", detail: "Seans", amount: 500, payment_status: "paid", created_at: iso(4) },
        { id: uid(332), charge_date: "2026-10-05", category: "other", detail: null, amount: 100, payment_status: "unpaid", created_at: iso(5) },
      ];
      const homeworks = [{ id: uid(341), title: "nefes", homework_type: "Günlük", description: "D", start_date: "2026-10-04", end_date: "2026-10-10", status: "devam", expert_note: "GİZLİ", created_at: iso(4) }];
      const analyses = [
        { id: uid(351), analysis_type: "cakra", analysis_data: null, note: "Görsel analiz notu", created_at: iso(5), image_url: "x" },
        { id: uid(352), analysis_type: "gezegen", analysis_data: null, note: null, created_at: iso(6) },
      ];
      const ctx = { now: NOW, expertName: "ZZ_Uzman" };
      const tabRows: Record<string, Record<string, unknown>[]> = {
        genel: [], notlar: [], randevular: appointments, taslar: stones, seanslar: sessions,
        ucretlendirme: charges, odevler: homeworks, analizler: analyses,
      };
      for (const tab of NEW.CLIENT_REPORT_TABS) {
        const input = { tab, client, notes, rows: tabRows[tab]!, analysisImages: tab === "analizler" ? [PNG_1x1, null] : undefined };
        const compact = tab === "ucretlendirme";
        await verify(`Danışan sekme · ${tab}`, await docBuf(NEW.buildClientTabReport(input as never, ctx).doc),
          await docBuf(OLD.buildClientTabReport(input as never, ctx).doc), { expectToc: !compact, oldHadToc: !compact });
      }
      // Boş sekme (kayıt yok) → yalnız bölüm H1'i; İçindekiler yine dolu (1 giriş).
      await verify("Danışan sekme · randevular (boş)", await docBuf(NEW.buildClientTabReport({ tab: "randevular", client, notes, rows: [] }, ctx).doc),
        await docBuf(OLD.buildClientTabReport({ tab: "randevular", client, notes, rows: [] }, ctx).doc), { expectToc: true });

      const data = { client, notes, appointments, stones, sessions, homeworks, analyses, charges };
      const drIn = { data: data as never, drStart: "2026-10-01", drEnd: "2026-10-31", profileImg: null, analysisImages: [PNG_1x1, null] };
      const OLD_SUB = "1 Ekim 2026 — 31 Ekim 2026 Arası Danışan Takip Özeti";
      const NEW_SUB = "1 Ekim 2026 — 31 Ekim 2026 Arası Danışan Yolculuğu Özeti";
      const drNew = await docBuf(NEW.buildClientDateRangeReport(drIn, ctx).doc);
      const drOld = await docBuf(OLD.buildClientDateRangeReport(drIn, ctx).doc);
      const { p, a } = await verify("Danışan tarih aralığı (yatay analiz sayfalı)", drNew, drOld, { expectToc: true, ignoreOld: [OLD_SUB] });
      const o = await parse(drOld);
      // TASK 3: kapak alt başlığı
      check("Tarih aralığı: kapak alt başlığı 'Danışan Yolculuğu Özeti'", runs(p.doc).includes(NEW_SUB), JSON.stringify(runs(p.doc).filter((t) => /Arası/.test(t))));
      check("Tarih aralığı: eski 'Danışan Takip Özeti' YOK", !p.doc.includes("Danışan Takip"));
      check("Tarih aralığı: (ÖNCE kontrolü) eski kod 'Danışan Takip Özeti' yazıyordu", runs(o.doc).includes(OLD_SUB));
      // Yatay (landscape) analiz sayfası İçindekiler eklenince KAYMADI: yatay bölümden hemen önceki
      // paragraf metni eski/yeni aynı + yatay bölüm sayısı aynı.
      const lsBefore = (xml: string) => {
        const idx = xml.indexOf('w:orient="landscape"');
        const head = xml.slice(0, idx);
        const sectEnd = head.lastIndexOf("<w:sectPr");
        const prevSect = head.lastIndexOf("<w:sectPr", sectEnd - 1);
        const ps = paragraphs(xml.slice(0, prevSect)).map(pText).filter(Boolean);
        return ps[ps.length - 1] ?? "";
      };
      const lsCount = (xml: string) => (xml.match(/w:orient="landscape"/g) ?? []).length;
      check("Tarih aralığı: yatay analiz sayfası sayısı aynı", lsCount(p.doc) === lsCount(o.doc) && lsCount(p.doc) === 1, `${lsCount(o.doc)}→${lsCount(p.doc)}`);
      check("Tarih aralığı: yatay sayfa aynı içerikten sonra (indeks kayması yok)", lsBefore(p.doc) === lsBefore(o.doc) && lsBefore(p.doc) !== "", `${lsBefore(o.doc)} | ${lsBefore(p.doc)}`);
      check("Tarih aralığı: uzman notu varsayılan HARİÇ (FA-26 korunur)", !p.doc.includes("GİZLİ"));
      check("Tarih aralığı: ücret H2 başlıkları İçindekiler'de", tocEntryTexts(p.doc).some((t) => /^1\. Seans/.test(t)));
      check("Tarih aralığı: analiz H2 başlıkları İçindekiler'de", a.headings.filter((h) => h.level === 2).length >= 8);
    }

    // ════════ 5) ROUTE-İÇİ OLUŞTURUCULAR (sahte kimlik + sahte DB ile gerçek POST) ════════
    const routeCase = async (label: string, rel: string, name: string, url: string, body: unknown, tables: Record<string, Row[]>, opts: { expectToc: boolean }) => {
      setGuard(tables);
      const NEW = load(path.join(ROOT, rel));
      const OLD = load(legacyCopy(rel, name));
      const nb = await callRoute(NEW, url, body);
      setGuard(tables);
      const ob = await callRoute(OLD, url, body);
      return verify(label, nb, ob, opts);
    };
    const bioRows = (n: number, f: (i: number) => Row) => Array.from({ length: n }, (_, i) => ({ id: uid(400 + i), tenant_id: TENANT, created_at: iso(2 + i), ...f(i) }));

    await routeCase("Biyoenerji · Sembol", "app/api/biyoenerji/symbol-report/route.ts", "symbol.legacy", "/api/biyoenerji/symbol-report", { exportMode: "all" },
      { bioenergy_symbols: bioRows(3, (i) => ({ symbol: `ZZ Sembol ${i} ${TR}`, title: null, category: "Kat", meaning: "Anlam", source: "K" })) }, { expectToc: true });
    await routeCase("Biyoenerji · Bilinçaltı", "app/api/biyoenerji/subconscious-report/route.ts", "subconscious.legacy", "/api/biyoenerji/subconscious-report", { exportMode: "all" },
      { bioenergy_subconscious_causes: bioRows(2, (i) => ({ title: `ZZ Sebep ${i}`, category: "Kat", content: "İçerik", note_text: "Not", source_uid: null })) }, { expectToc: true });
    await routeCase("Biyoenerji · İmajinasyon", "app/api/biyoenerji/imagination-report/route.ts", "imagination.legacy", "/api/biyoenerji/imagination-report", { exportMode: "all" },
      { bioenergy_imaginations: bioRows(2, (i) => ({ title: `ZZ İmaj ${i}`, category: "Kat", text: "Metin", notes: "Not", source: "K", source_id: null })) }, { expectToc: true });
    await routeCase("Biyoenerji · Enerji Bedeni", "app/api/biyoenerji/energy-body-report/route.ts", "energybody.legacy", "/api/biyoenerji/energy-body-report", { exportMode: "all" },
      { bioenergy_energy_bodies: bioRows(2, (i) => ({ source_uid: `ZZ Beden ${i}`, genel_tanim: "Tanım", gorevi: "Görev", bozulma: "Boz", onerilen_taslar: "Taş", not_text: "Not" })) }, { expectToc: true });
    await routeCase("Biyoenerji · Çakra", "app/api/biyoenerji/chakra-report/route.ts", "chakra.legacy", "/api/biyoenerji/chakra-report", { exportMode: "all" },
      { bioenergy_chakras: bioRows(2, (i) => ({ name: `ZZ Çakra ${i}`, organs: "Kalp", glands: "Timus", color: "Yeşil", stones: "Ametist", causes: "Sebep", physical: "F", mental: "Z", notes: "N", source_uid: null })),
        bioenergy_chakra_blocks: [] }, { expectToc: true });

    const inv = {
      dogaltas_inventory: [{ tenant_id: TENANT, name: "ZZ Ametist", type: "Ham", adet: 2, unit_cost_try: 10, total_cost_try: 20, adet_price: 0 }],
      oil_inventory: [{ tenant_id: TENANT, name: "ZZ Lavanta", oil_type: "Uçucu", base_unit: "ml", stock_base: 1000, cost_per_base: 1 }],
      soap_cream_inventory: [], accessory_inventory: [{ tenant_id: TENANT, name: "ZZ Tespih", product_group: "Tespih", product_model: "33", stock_qty: 0, cost_per_unit: 5 }],
      other_inventory: [],
    };
    await routeCase("Ürün & Stok · tümü", "app/api/urun-stok/stock-report/route.ts", "stock.legacy", "/api/urun-stok/stock-report", { exportMode: "all" }, inv, { expectToc: true });
    await routeCase("Ürün & Stok · kritik", "app/api/urun-stok/stock-report/route.ts", "stock.legacy", "/api/urun-stok/stock-report", { exportMode: "critical" }, inv, { expectToc: true });

    await routeCase("Numeroloji Bilgi Bankası", "app/api/numeroloji/knowledge-report/route.ts", "numkb.legacy", "/api/numeroloji/knowledge-report", { exportMode: "all" },
      {
        numerology_knowledge_records: [
          { id: uid(501), tenant_id: TENANT, analysis_type: "hayat_yolu", value: "1", title: `ZZ Yorum ${TR}`, content: "İçerik", created_at: iso(2) },
          { id: uid(502), tenant_id: TENANT, analysis_type: "ifade", value: "3", title: "ZZ Yorum 2", content: "İçerik 2", created_at: iso(2) },
        ],
        numerology_stone_assignments: [{ id: uid(511), tenant_id: TENANT, analysis_type: "hayat_yolu", value: "1", stones: ["Ametist"], created_at: iso(2) }],
      }, { expectToc: true });

    const stoneRow = (i: number) => ({ id: uid(600 + i), tenant_id: TENANT, primary_source_name: null, stone_name: `ZZ Taş ${i} ${TR}`, short_description: "Kısa", general_info: "Genel",
      source_note: null, physical_effects: "F", spiritual_effects: null, other_effects: null, feng_shui: null, meditation: null, care: null, application: null,
      chakras: ["Kalp Çakrası"], assignments: null, warning_text: null, warning_tags: null, images: null });
    const dgTables = {
      stones: [stoneRow(1), stoneRow(2)],
      minerals: [{ id: uid(611), tenant_id: TENANT, name: "ZZ Magnezyum", aciklama: "A", kategori: "Makro", fiziksel: ["X"], zihinsel: null, fizyoloji: null, eksiklik_belirtileri: null, fazlalik_belirtileri: null, doz_asimi: null, iceren_taslar: ["Ametist"], organ_etkileri: null, cakralar: null }],
      combinations: [{ id: uid(621), tenant_id: TENANT, issue: "ZZ Uyku", description: "Amaç", source: "K", stones_text: "Ametist", notes_text: "Not", notes_text_2: null, notes_text_3: null }],
      combination_stones: [], stone_sources: [],
      stone_knowledge_articles: [
        { id: uid(631), tenant_id: TENANT, is_active: true, title: "ZZ Makale 1", content: "## Alt\nMetin", category: "Kristal", sub_category: null, source: "K", source_section: null, notes: null, tags: ["a"], related_stones: null, related_minerals: null, created_at: iso(2) },
        { id: uid(632), tenant_id: TENANT, is_active: true, title: "ZZ Makale 2", content: "Metin 2", category: "Enerji", sub_category: "Alt", source: null, source_section: null, notes: "Not", tags: null, related_stones: null, related_minerals: null, created_at: iso(3) },
      ],
    };
    await routeCase("Doğaltaş Ansiklopedisi (toplu, 5 bölüm)", "app/api/dogaltas/word-report/route.ts", "dogaltasbulk.legacy", "/api/dogaltas/word-report",
      { sections: { stones: true, minerals: true, combinations: true, knowledge: true, analytics: true }, includeImages: false }, dgTables, { expectToc: true });
    await routeCase("Doğaltaş Ansiklopedisi (mineral + analiz)", "app/api/dogaltas/word-report/route.ts", "dogaltasbulk.legacy", "/api/dogaltas/word-report",
      { sections: { minerals: true, analytics: true }, includeImages: false }, dgTables, { expectToc: true });
    await routeCase("Taş Bilgi Kütüphanesi", "app/api/dogaltas/knowledge-report/route.ts", "dogaltaskb.legacy", "/api/dogaltas/knowledge-report", { exportMode: "all" }, dgTables, { expectToc: true });

    // ════════ 6) Paylaşılan yardımcı — boş giriş → sayfa YOK ════════
    {
      const c = new StaticTocCollector("zz");
      check("Collector: giriş yoksa page() boş, documentOptions() boş", c.page().length === 0 && Object.keys(c.documentOptions()).length === 0);
      c.h2("   "); // boş başlık kaydedilmez
      check("Collector: boş başlık metni İçindekiler'e girmez", c.entries.length === 0);
      c.h1Colored("1. Bölüm", "000000", true); c.h2("Alt");
      check("Collector: 2 giriş, seviyeler 1/2, benzersiz id", c.entries.length === 2 && c.entries[0]!.level === 1 && c.entries[1]!.level === 2 && c.entries[0]!.id !== c.entries[1]!.id);
      check("buildStaticTocPage([]) → []", buildStaticTocPage([]).length === 0);

      // Belge düzeyi: başlıksız gövde → İçindekiler sayfası + sayfa sonu YOK (eski: boş TOC sayfası vardı).
      const cover = () => new Paragraph({ children: [new TextRun("ZZ Kapak")] });
      const empty = new StaticTocCollector("zze");
      const newDoc = new DocxDocument({ ...empty.documentOptions(), sections: [{ children: [cover(), ...empty.page(), bodyText("ZZ gövde (başlıksız)")] }] });
      const oldDoc = new DocxDocument({ sections: [{ children: [cover(), ...buildTOCPage(), bodyText("ZZ gövde (başlıksız)")] }] });
      await verify("Başlıksız gövde (sentetik)", await docBuf(newDoc), await docBuf(oldDoc), { expectToc: false });
    }

    // ════════ 7) Kaynak kapıları: buildTOCPage artık yalnız kapsam dışı/eski kopyalarda ════════
    {
      const files = [
        "app/api/ajanda/word-report/buildAjandaReport.ts", "app/api/biyoenerji/symbol-report/route.ts", "app/api/biyoenerji/subconscious-report/route.ts",
        "app/api/biyoenerji/imagination-report/route.ts", "app/api/biyoenerji/energy-body-report/route.ts", "app/api/biyoenerji/chakra-report/route.ts",
        "app/api/biyoenerji/session-report/buildSessionReport.ts", "app/api/urun-stok/stock-report/route.ts", "app/api/numeroloji/knowledge-report/route.ts",
        "app/api/dogaltas/word-report/route.ts", "app/api/dogaltas/stones/[id]/word-report/buildStoneReport.ts", "app/api/dogaltas/knowledge-report/route.ts",
        "app/api/clients/[id]/word-report/clientReportBuilder.ts",
      ];
      for (const f of files) {
        const src = fs.readFileSync(path.join(ROOT, f), "utf8");
        check(`kaynak: ${f} buildTOCPage/TableOfContents kullanmıyor`, !/buildTOCPage|TableOfContents/.test(src));
        check(`kaynak: ${f} StaticTocCollector + documentOptions`, /StaticTocCollector/.test(src) && /toc\.documentOptions\(\)/.test(src));
      }
    }
  } finally {
    fs.rmSync(LEGACY_DIR, { recursive: true, force: true });
  }

  console.log("\n┌─ Rapor özeti (giriş / başlık / sayfa sonu eski→yeni / eski boş TOC)");
  for (const s of summary) {
    console.log(`│ ${s.label.padEnd(52)} giriş=${String(s.entries).padStart(3)} başlık=${String(s.headings).padStart(3)} sayfaSonu=${s.breaksOld}→${s.breaksNew} eskiBoşTOC=${s.oldEmptyToc ? "EVET" : "hayır"}`);
  }
  console.log(`└─ final-a2/word: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL:", failures.join(" | ")); process.exit(1); }
}

main().catch((e) => { fs.rmSync(LEGACY_DIR, { recursive: true, force: true }); console.error(e); process.exit(1); });
