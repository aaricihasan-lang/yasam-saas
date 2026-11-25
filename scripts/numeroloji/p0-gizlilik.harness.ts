/**
 * NUMEROLOJİ P0 GİZLİLİK HARNESS'I — I18N-0003 (P0) + I18N-0007 (P1).
 *
 * Kanıtlanan: "Gelecek Yılları Göster" yetkisi OLMAYAN görüntüleyicide, gelecekte başlayan HİÇBİR kronolojik
 * dönem (Değişim · Zirve · Mücadele · Harflerin Yankılanışı) ve hiçbir gizli yer tutucu (999 / 9999 / -1)
 * şu çıktı yollarının HİÇBİRİNDE görünmez:
 *   API görüntüleme kopyası (redactAnalysisDataForFutureYears) · ekran düz metni (buildPlainAnalizFull) ·
 *   gerçek ekran bileşenleri (SSR: Hesap Özetsiz, Sayısal Hesaplama, Sonuç Özeti, Görsel Rapor) ·
 *   Numeroloji Word'ü (arşiv aynı kurucuyu kullanır) · danışan Word bölümü · karşılaştırma okuyucusu.
 * Karar artık METİNDEN değil yapıdan (kayıt `birth_date`) gelir; metin yalnız eski kayıt geri dönüşüdür ve
 * belirsiz / bozuk / çelişkili veride FAIL-CLOSED davranılır.
 *
 * Golden: aynı TR girdilerde taban (F1 c616c371c) kodu ile ekran düz metni, API kopyası ve ekran bileşenleri
 * BAYT-EŞİT (Türkçe çıktı birebir).
 *
 * F (R5, QA-N3-03): YENİ (kaydedilmemiş) hesap ekranları ham motorla, sunucu kopyası OLMADAN, açıkça EN ve TR katalogla çizilir;
 * motor gerçeğinden kurulan yasaklı yaş/yıl kümesi EN desenleriyle de taranır (EN'e özgü istemci gizleme hatası yakalanır).
 *
 * Yalnız SENTETİK kişi/tarih kullanılır. Ağ, DB, Roxy yok. Çalıştır:
 *   npx tsx scripts/numeroloji/p0-gizlilik.harness.ts [--out <klasör>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "./intlRender"; // I18N R5: TR katalog sağlayıcısıyla çizim (beklentiler değişmedi; taban kopyası da aynı sağlayıcıda)
import JSZip from "jszip";
import { Document, Packer } from "docx";
import { hesaplaNumeroloji, calcDegisimByYearOnly, calcDegisimByFullDate, mucadeleDonemleri } from "@/lib/numeroloji";
import { createTranslator } from "next-intl";
import { getCatalogMessages } from "@/lib/i18n/catalog";
import { currentIstanbulYear } from "@/lib/numeroloji/currentYear";
import { NUMEROLOJI_METHODOLOGY_VERSION } from "@/lib/numeroloji/methodology";
import { redactAnalysisDataForFutureYears } from "@/app/numeroloji/utils/futureYearsRedaction";
import { buildPlainAnalizFull } from "@/app/numeroloji/utils/numerolojiPlainMetin";
import { chronoLimitYear, chronoNoteText, chronoViewLimit, CHRONO_NO_LIMIT_YEAR, zirveYasGorunumu, cutoffMucadele } from "@/app/numeroloji/utils/chronoCutoff";
import { resolveChronoBirth } from "@/app/numeroloji/utils/chronoBirth";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import { extractMotorFromAnalysisJson } from "@/app/numeroloji/utils/analysisJson";
import { ChronoRecordProvider, restrictedLimitYearOf } from "@/app/numeroloji/hooks/ChronoRecordContext";
import { TabPlainAnaliz, TabAnalizOzetli, TabSonucOzeti } from "@/app/numeroloji/components/NumerolojiAnalizSonucTabs";
import { GorselRaporInfografik } from "@/app/numeroloji/components/NumerolojiGorselRaporInfografik";
import { buildNumerolojiWordChildren, packNumerolojiDocx } from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";
import { buildSavedNumerologySection, parseSavedDegisim } from "@/app/api/clients/[id]/word-report/numerologySavedSection";
import { readLegacySnapshot } from "@/lib/numeroloji-klasik/compare/legacyReader";

const ROOT = process.cwd();
const BASE = "c616c371c"; // F1 tabanı (bu dalın atası) — TR golden karşılaştırması
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
if (OUT) mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const rows: string[] = [];
function ok(cond: unknown, msg: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 600)}`); }
}
const section = (t: string) => console.log(`\n── ${t}`);

// ── Sentetik kişiler ─────────────────────────────────────────────────────────────
const PEOPLE = [
  { firstName: "Deneme Ayşe", lastName: "Örnekoğlu", birthDate: "14.02.1987", iso: "1987-02-14" },
  { firstName: "Sentetik", lastName: "Çalışkan Işık", birthDate: "29.11.1975", iso: "1975-11-29" },
  { firstName: "Test Ümit", lastName: "Güneş", birthDate: "01.01.2000", iso: "2000-01-01" },
];
const CY = currentIstanbulYear(); // SSR bileşenleri ve Numeroloji Word bu yılı kullanır
type Row = { id: string; name: string; surname: string; birth_date: string | null; created_at: string; analysis_data: unknown };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const motorOf = (p: (typeof PEOPLE)[number]) => clone(hesaplaNumeroloji({ firstName: p.firstName, lastName: p.lastName, birthDate: p.birthDate })) as Record<string, unknown>;
const rowOf = (p: (typeof PEOPLE)[number], motor: Record<string, unknown>, birth: string | null, stamp = true): Row => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: p.firstName,
  surname: p.lastName,
  birth_date: birth,
  created_at: "2026-01-01T10:00:00Z",
  analysis_data: { version: 1, motor, summary: "Sentetik kayıtlı özet.", ...(stamp ? { calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION } } : {}) },
});

// ── Metin çıkarıcılar ────────────────────────────────────────────────────────────
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const htmlLines = (html: string) =>
  unescape(html.replace(/<(br|\/p|\/div|\/li|\/tr|\/td|\/th|\/h\d|\/section|\/pre|\/span|\/header|\/article)[^>]*>/g, "\n").replace(/<[^>]+>/g, " "))
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const textLines = (t: string) => t.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
async function docxLines(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return xml.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescape(m[1]!)).join("").replace(/\s+/g, " ").trim()).filter(Boolean);
}

// ── Çıktı yolları (yetkisiz görüntüleyici akışı birebir) ─────────────────────────
type Surfaces = Record<string, string[]>;
const SECTIONS = { summary: false, plain: true, detailed: false, zamanlama: false, tas: false } as const;
const SHARED = { knowledgeRows: [], entries: [], sourceLabelById: new Map(), stoneRows: [] };
const GORSEL_PROPS = { isimGoster: "Sentetik", dogumGoster: "—", temaId: "kozmikMor", uzmanAdi: "", gorselTaslariGoster: false, tasBileklik: "", tasKolye: "", tasKutle: "" };

function ssr(C: ComponentType<never>, props: Record<string, unknown>, birthDate: string | null, analysisData: unknown): string[] {
  return htmlLines(renderToStaticMarkup(createElement(ChronoRecordProvider, { birthDate, analysisData, children: createElement(C, props as never) })));
}

/** Çıktı yolunda çökme olursa o yol "çıktı üretmedi" sayılır (veri göstermez) ve CRASHES'e yazılır. */
const CRASHES: string[] = [];
async function guard(out: Surfaces, key: string, f: () => string[] | Promise<string[]>) {
  try { out[key] = await f(); } catch (e) { CRASHES.push(`${key}: ${String(e).slice(0, 120)}`); out[key] = []; }
}
async function surfaces(row: Row, futureYears: boolean, opts: { ssr?: boolean; clientBirth?: "record" | "none" } = {}): Promise<Surfaces> {
  const out: Surfaces = {};
  // 1) API: sunucu görüntüleme kopyası (analyses GET / danışan numerology-analysis / karşılaştırma ile aynı çağrı)
  const view = redactAnalysisDataForFutureYears(row.analysis_data, { futureYears, currentYear: CY, birthDate: row.birth_date }) as Record<string, unknown>;
  out.api = [JSON.stringify(view)];
  // 2) Ekran düz metni: istemci kaydı API'den alır; kayıt doğum tarihi bağlamla gelir (ChronoRecordProvider)
  const clientBirth = opts.clientBirth === "none" ? null : row.birth_date;
  const motor = extractMotorFromAnalysisJson(view, row.name, row.surname);
  const lim = chronoViewLimit(CY, futureYears, restrictedLimitYearOf(view));
  await guard(out, "duzMetin", () => (motor ? textLines(buildPlainAnalizFull(motor as never, lim.limitYear, chronoNoteText(lim.futureYears), clientBirth)) : []));
  // 3) Gerçek ekran bileşenleri (SSR; istemci yetki önbelleği SSR'da KAPALI → yalnız yetkisiz görünüm)
  if (opts.ssr !== false && motor && !futureYears) {
    await guard(out, "ekranHesapOzetsiz", () => ssr(TabPlainAnaliz as never, { out: motor }, clientBirth, view));
    await guard(out, "ekranSayisal", () => ssr(TabAnalizOzetli as never, { out: motor, layout: "detay" }, clientBirth, view));
    await guard(out, "ekranSonucOzeti", () => ssr(TabSonucOzeti as never, { out: motor, isimGoster: "Sentetik", dogumGoster: "—", layout: "premium" }, clientBirth, view));
    await guard(out, "ekranGorselRapor", () => ssr(GorselRaporInfografik as never, { out: motor, firstName: row.name, lastName: row.surname, ...GORSEL_PROPS }, clientBirth, view));
  }
  // 4) Numeroloji Word'ü (ham kayıt + sunucu yetki kararı; arşiv aynı kurucuyu kullanır)
  await guard(out, "wordNumeroloji", async () => {
    const nw = buildNumerolojiWordChildren([row as never], SECTIONS as never, SHARED as never, new Map(), null, new Date(), futureYears);
    return docxLines(await packNumerolojiDocx(nw.children, `${row.name} ${row.surname}`, { expertName: null }));
  });
  // 5) Danışan Word bölümü
  await guard(out, "wordDanisan", async () => {
    const dw = buildSavedNumerologySection(row as never, "1e40af", { futureYears, currentYear: CY });
    return docxLines(await Packer.toBuffer(new Document({ sections: [{ children: dw as never }] })));
  });
  return out;
}

// ── Sızıntı ölçütleri ───────────────────────────────────────────────────────────
const PLACEHOLDER_RE = /(^|[^\d])(999|9999)([^\d]|$)|konu -1|-1\. çakra|: -1(\D|$)/;
type Ref = { secret: Record<string, Set<string>>; restricted: Record<string, Set<string>>; restrictedList: Surfaces; futureDegisim: string[] };
async function referenceFor(p: (typeof PEOPLE)[number]): Promise<Ref> {
  const clean = rowOf(p, motorOf(p), p.birthDate);
  const U = await surfaces(clean, true, { ssr: false });
  const R = await surfaces(clean, false);
  const secret: Record<string, Set<string>> = {};
  const restricted: Record<string, Set<string>> = {};
  for (const k of Object.keys(R)) {
    restricted[k] = new Set(R[k]);
    if (U[k]) secret[k] = new Set(U[k]!.filter((l) => !restricted[k]!.has(l)));
  }
  const [d, m, y] = p.birthDate.split(".").map(Number);
  void d;
  const futureDegisim = calcDegisimByYearOnly(y!, m!, 5).filter((r) => r.effectStartYear > CY).map((r) => `Değişim ${r.changeYear}`);
  return { secret, restricted, restrictedList: R, futureDegisim };
}

/** Senaryo çıktısında gizli veri var mı? (boş dizi = temiz) */
function leaks(s: Surfaces, ref: Ref, trueBirthYear: number): string[] {
  const found: string[] = [];
  for (const [k, lines] of Object.entries(s)) {
    if (k === "api") continue;
    for (const l of lines) {
      if (ref.secret[k]?.has(l)) found.push(`${k}: gizli satır «${l}»`);
      if (PLACEHOLDER_RE.test(l)) found.push(`${k}: yer tutucu «${l}»`);
      for (const tok of ref.futureDegisim) if (l.includes(tok)) found.push(`${k}: gelecek Değişim «${tok}»`);
      // Yeni ZAMAN bilgisi yok: temiz (yetkisiz) referansta bulunmayan bir satır, içinde bulunulan yıldan sonraki
      // bir takvim yılı ya da doğum yılına eklendiğinde gelecekte başlayan bir yaş taşıyamaz.
      if (ref.restricted[k] && !ref.restricted[k]!.has(l)) {
        const years = Array.from(l.matchAll(/(?<!\d)(19\d\d|20\d\d|21\d\d)(?!\d)/g)).map((m) => Number(m[1]));
        if (years.some((y) => y > CY)) found.push(`${k}: referansta olmayan gelecek yıl «${l}»`);
        const ages = [...Array.from(l.matchAll(/(?<!\d)(\d{1,3}) yaş/g)), ...Array.from(l.matchAll(/yaş (\d{1,3})/g))].map((m) => Number(m[1]));
        if (ages.some((a) => trueBirthYear + a > CY)) found.push(`${k}: referansta olmayan gelecek yaş «${l}»`);
      }
    }
  }
  found.push(...apiLeaks(s.api?.[0] ?? "{}", trueBirthYear));
  return found;
}

/** API kopyası: gelecekte başlayan hiçbir gerçek dönem değeri kalmamalı; metinler yalnız doğum satırı / boş. */
function apiLeaks(json: string, by: number): string[] {
  const out: string[] = [];
  const v = JSON.parse(json) as { motor?: Record<string, unknown> };
  const m = v.motor ?? {};
  const z = (m.zirveYillari as { peaks?: Record<string, unknown>[] } | undefined)?.peaks ?? [];
  for (const pk of z) for (const k of ["yasMetot1", "yasMetot2", "age"]) {
    const a = pk[k];
    if (typeof a === "number" && a < 999 && by + a > CY && (k !== "age" || !("yasMetot1" in pk))) out.push(`api: zirve ${k}=${a} gelecekte`);
  }
  const mc = m.mucadeleYillari as Record<string, unknown> | undefined;
  if (mc && typeof mc.anaMucadeleBaslangicYasi === "number" && mc.anaMucadeleBaslangicYasi < 999 && by + (mc.anaMucadeleBaslangicYasi as number) > CY) out.push("api: ana mücadele gelecekte açık");
  for (const s of (Array.isArray(m.harflerinYankilanisi) ? m.harflerinYankilanisi : []) as Record<string, unknown>[]) {
    if (typeof s.yearStart === "number" && s.yearStart < 9999 && s.yearStart > CY) out.push(`api: harf ${s.yearStart} gelecekte`);
  }
  for (const k of ["degisimDonusumMetni", "zirveYillariMetni", "mucadeleYillariMetni", "harflerinYankilanisiMetni"]) {
    const t = m[k];
    if (typeof t === "string" && t.includes("\n")) out.push(`api: ${k} çok satırlı ham metin`);
    if (typeof t === "string" && /Değişim:|Change:|Etki|Effect|zirve|Zirve|Mücadele/.test(t)) out.push(`api: ${k} dönem içeriyor`);
  }
  return out;
}

// ── Senaryo dönüştürücüleri ──────────────────────────────────────────────────────
const TEXT_KEYS = ["degisimDonusumMetni", "zirveYillariMetni", "mucadeleYillariMetni", "elementlerMetni", "harflerinYankilanisiMetni"];
function mapTexts(m: Record<string, unknown>, f: (s: string) => string) {
  for (const k of TEXT_KEYS) if (typeof m[k] === "string") m[k] = f(m[k] as string);
  return m;
}
const toEnglish = (s: string) =>
  s.replace(/Doğum Tarihi/g, "Date of Birth")
    .replace(/2\) GÜN VE AY DAHİL/g, "2) INCLUDING DAY AND MONTH")
    .replace(/Etki Dönemi \(yaklaşık\)/g, "Effect Period (approx.)")
    .replace(/Etki Dönemi/g, "Effect Period")
    .replace(/Değişim/g, "Change")
    .replace(/Çakra/g, "Chakra")
    .replace(/ yılının /g, " year, ")
    .replace(/\. ayından /g, ". month to ")
    .replace(/\. ayına kadar/g, ". month")
    .replace(/ tarihinden /g, " to ")
    .replace(/ tarihine kadar/g, "");
const stripBirthLines = (s: string) => s.split("\n").filter((l) => !/Doğum Tarihi\s*:/.test(l)).join("\n");

type Scenario = { id: string; title: string; build: (p: (typeof PEOPLE)[number]) => Row; clientBirth?: "record" | "none"; expect: "golden" | "closed" | "any" };
const SCENARIOS: Scenario[] = [
  { id: "S01", title: "Türkçe ESKİ kayıt (metodoloji damgası yok, TR başlıklar)", expect: "golden", build: (p) => rowOf(p, motorOf(p), p.birthDate, false) },
  { id: "S02", title: "İngilizce YENİ kayıt (EN başlıklar + ISO doğum tarihi)", expect: "golden", build: (p) => rowOf(p, mapTexts(motorOf(p), toEnglish), p.iso) },
  { id: "S03", title: "Eksik başlık (metinde doğum satırı yok) + kayıt alanı var", expect: "golden", build: (p) => rowOf(p, mapTexts(motorOf(p), stripBirthLines), p.birthDate) },
  { id: "S04", title: "Eksik başlık + kayıt alanı istemciye gelmiyor (yalnız metin yolu)", expect: "any", clientBirth: "none", build: (p) => rowOf(p, mapTexts(motorOf(p), stripBirthLines), p.birthDate) },
  { id: "S05", title: "Yanlış başlık (\"Dogum Tarihi\" / \"Geburtsdatum\") + kayıt alanı var", expect: "golden", build: (p) => rowOf(p, mapTexts(motorOf(p), (s) => s.replace(/Doğum Tarihi/, "Dogum Tarihi").replace(/Doğum Tarihi/g, "Geburtsdatum")), p.birthDate) },
  { id: "S06", title: "Yanlış başlık + kayıt alanı yok", expect: "closed", build: (p) => rowOf(p, mapTexts(motorOf(p), (s) => s.replace(/Doğum Tarihi/g, "Geburtsdatum")), null) },
  { id: "S07", title: "Farklı tarih biçimi: GG/AA/YYYY", expect: "golden", build: (p) => rowOf(p, motorOf(p), p.birthDate.replace(/\./g, "/")) },
  { id: "S08", title: "Farklı tarih biçimi: YYYY-AA-GG (ISO)", expect: "golden", build: (p) => rowOf(p, motorOf(p), p.iso) },
  { id: "S09", title: "Farklı tarih biçimi: GG-AA-YYYY + boşluklu", expect: "golden", build: (p) => rowOf(p, motorOf(p), ` ${p.birthDate.replace(/\./g, "-")} `) },
  {
    id: "S10", title: "Bozuk kayıt (çöp metin, sayı olmayan yaşlar, bozuk segmentler)", expect: "any",
    build: (p) => {
      const m = mapTexts(motorOf(p), () => "Doğum Tarihi: abc\n1. Değişim: 2099 → Çakra: 9. Çakra");
      m.elementlerMetni = "Doğum Tarihi: abc"; // kronolojik olmayan metin: yalnız bozuk doğum satırı
      (m.zirveYillari as Record<string, unknown>).peaks = [{ index: 1, age: "x", yasMetot1: null, yasMetot2: "otuz", topic: 3 }, null, 5];
      m.mucadeleYillari = { method1: [{ index: 1, cutoffAge: "?", topic: 2 }, "bozuk"], anaMucadele: "x" };
      m.harflerinYankilanisi = [{ letter: "A", chakra: 1, ageStart: "0" }, { yearStart: "2090" }, 7];
      return rowOf(p, m, null);
    },
  },
  { id: "S11", title: "Eksik doğum tarihi (kayıt alanı null, metinlerde satır yok)", expect: "closed", build: (p) => rowOf(p, mapTexts(motorOf(p), stripBirthLines), null) },
  { id: "S12", title: "Geçersiz doğum tarihi (31.02) — snapshot metni + harf yılı birbirini doğruluyor", expect: "golden", build: (p) => rowOf(p, motorOf(p), "31.02." + p.birthDate.slice(6)) },
  { id: "S13", title: "Geçersiz doğum tarihi (00.00.0000) + metin satırı yok", expect: "closed", build: (p) => rowOf(p, mapTexts(motorOf(p), stripBirthLines), "00.00.0000") },
  { id: "S14", title: "Çelişkili kayıt: kayıt alanı 12 yıl ÖNCE (eski kodda gelecek dönemler açılırdı)", expect: "closed", build: (p) => rowOf(p, motorOf(p), p.birthDate.slice(0, 6) + String(Number(p.birthDate.slice(6)) - 12)) },
  { id: "S15", title: "Çelişkili kayıt: metinler arası farklı doğum tarihleri", expect: "closed", build: (p) => { const m = motorOf(p); m.zirveYillariMetni = String(m.zirveYillariMetni).replace(/Doğum Tarihi: [^\n]+/, "Doğum Tarihi: 01.01.1950"); return rowOf(p, m, null); } },
  { id: "S16", title: "Gelecek yıl bilgisi metne gömülü (sahte \"2099\" Değişim satırı + eksik doğum)", expect: "closed", build: (p) => { const m = mapTexts(motorOf(p), stripBirthLines); m.degisimDonusumMetni = String(m.degisimDonusumMetni) + "\n9. Değişim: 2099  → Çakra: 9. Çakra\n   Etki Dönemi (yaklaşık): 2098 yılının 1. ayından 2099 yılının 1. ayına kadar."; return rowOf(p, m, null); } },
  { id: "S17", title: "Arşivden açılan ESKİ kayıt (damgasız, eski zirve biçimi: yasMetot yok)", expect: "any", build: (p) => { const m = motorOf(p); for (const pk of ((m.zirveYillari as { peaks?: Record<string, unknown>[] }).peaks ?? [])) { delete pk.yasMetot1; delete pk.yasMetot2; } return rowOf(p, m, p.birthDate, false); } },
];

// ── Taban (F1) kodu: TR golden ───────────────────────────────────────────────────
type BaseMods = {
  plain: typeof import("../../app/numeroloji/utils/numerolojiPlainMetin");
  red: typeof import("../../app/numeroloji/utils/futureYearsRedaction");
  tabs: typeof import("../../app/numeroloji/components/NumerolojiAnalizSonucTabs");
  gorsel: typeof import("../../app/numeroloji/components/NumerolojiGorselRaporInfografik");
  saved: typeof import("../../app/api/clients/[id]/word-report/numerologySavedSection");
};
// Taban kopyası proje İÇİNDE geçici klasöre açılır (tsconfig'in JSX/yol ayarları uygulansın diye); taban
// dosyalarındaki "@/app/numeroloji/…" ve danışan Word içe aktarımları TABAN kopyasına yönlendirilir (sadık golden),
// "@/lib/…" gibi diğerleri bu dala çözülür (lib/numeroloji değişmedi). Klasör çıkışta silinir.
const BASE_DIR = path.join(ROOT, "scripts", "numeroloji", `taban-gecici-${process.pid}`);
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}
async function loadBase(): Promise<BaseMods> {
  mkdirSync(BASE_DIR, { recursive: true });
  const tar = execFileSync("git", ["archive", "--format=tar", BASE, "app/numeroloji", "app/api/clients/[id]/word-report"], { cwd: ROOT, maxBuffer: 128 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", BASE_DIR.split(path.sep).join("/")], { input: tar });
  for (const f of walk(BASE_DIR).filter((x) => /\.(ts|tsx)$/.test(x))) {
    const src = readFileSync(f, "utf8");
    const rel = (target: string) => {
      const r = path.relative(path.dirname(f), path.join(BASE_DIR, target)).split(path.sep).join("/");
      return r.startsWith(".") ? r : `./${r}`;
    };
    const next = src
      .replace(/(["'])@\/app\/numeroloji\//g, (_m, q: string) => `${q}${rel("app/numeroloji")}/`)
      .replace(/(["'])@\/app\/api\/clients\/\[id\]\/word-report\//g, (_m, q: string) => `${q}${rel("app/api/clients/[id]/word-report")}/`);
    if (next !== src) writeFileSync(f, next);
  }
  const imp = (rel: string) => import(pathToFileURL(path.join(BASE_DIR, rel)).href);
  return {
    plain: await imp("app/numeroloji/utils/numerolojiPlainMetin.ts"),
    red: await imp("app/numeroloji/utils/futureYearsRedaction.ts"),
    tabs: await imp("app/numeroloji/components/NumerolojiAnalizSonucTabs.tsx"),
    gorsel: await imp("app/numeroloji/components/NumerolojiGorselRaporInfografik.tsx"),
    saved: await imp("app/api/clients/[id]/word-report/numerologySavedSection.ts"),
  };
}
function cleanupBase() {
  // Yalnız bu koşunun oluşturduğu klasör (adı pid içerir) silinir.
  if (BASE_DIR.startsWith(path.join(ROOT, "scripts", "numeroloji", "taban-gecici-")) && existsSync(BASE_DIR)) rmSync(BASE_DIR, { recursive: true, force: true });
}

async function main() {
  console.log(`NUMEROLOJİ P0 GİZLİLİK — referans yıl ${CY}`);
  const base = await loadBase();

  // ── A) TR GOLDEN: taban kodla bayt-eşit ──────────────────────────────────────
  section("A) Türkçe golden (taban F1 kodu ile bayt-eşit)");
  for (const p of PEOPLE) {
    const r = rowOf(p, motorOf(p), p.birthDate);
    const motor = (r.analysis_data as { motor: unknown }).motor;
    for (const fy of [false, true]) {
      const a = JSON.stringify(redactAnalysisDataForFutureYears(r.analysis_data, { futureYears: fy, currentYear: CY, birthDate: r.birth_date }));
      const b = JSON.stringify(base.red.redactAnalysisDataForFutureYears(r.analysis_data, { futureYears: fy, currentYear: CY, birthDate: r.birth_date }));
      ok(a === b, `A ${p.birthDate} API kopyası (yetki ${fy ? "AÇIK" : "KAPALI"}) taban ile birebir`);
    }
    for (const y of [CY, 2030, 2050, CHRONO_NO_LIMIT_YEAR]) {
      for (const lim of [y, chronoLimitYear(y, true)]) {
        const a = buildPlainAnalizFull(motor as never, lim, chronoNoteText(lim >= CHRONO_NO_LIMIT_YEAR), r.birth_date);
        const b = base.plain.buildPlainAnalizFull(motor as never, lim, chronoNoteText(lim >= CHRONO_NO_LIMIT_YEAR));
        ok(a === b, `A ${p.birthDate} düz metin sınır ${lim} taban ile birebir`);
      }
    }
    const red = redactAnalysisDataForFutureYears(r.analysis_data, { futureYears: false, currentYear: CY, birthDate: r.birth_date });
    const vm = extractMotorFromAnalysisJson(red, r.name, r.surname);
    const pairs: [string, ComponentType<never>, ComponentType<never>, Record<string, unknown>][] = [
      ["Hesap Özetsiz", TabPlainAnaliz as never, base.tabs.TabPlainAnaliz as never, { out: vm }],
      ["Sayısal Hesaplama", TabAnalizOzetli as never, base.tabs.TabAnalizOzetli as never, { out: vm, layout: "detay" }],
      ["Sonuç Özeti", TabSonucOzeti as never, base.tabs.TabSonucOzeti as never, { out: vm, isimGoster: "Sentetik", dogumGoster: "—", layout: "premium" }],
      ["Görsel Rapor", GorselRaporInfografik as never, base.gorsel.GorselRaporInfografik as never, { out: vm, firstName: r.name, lastName: r.surname, ...GORSEL_PROPS }],
    ];
    for (const [name, Cur, Old, props] of pairs) {
      const a = renderToStaticMarkup(createElement(ChronoRecordProvider, { birthDate: r.birth_date, analysisData: red, children: createElement(Cur, props as never) }));
      const b = renderToStaticMarkup(createElement(Old, props as never));
      ok(a === b, `A ${p.birthDate} ekran «${name}» (yetkisiz, sunucu kopyası) taban ile birebir HTML`);
    }
    const dwA = JSON.stringify(buildSavedNumerologySection(r as never, "1e40af", { futureYears: false, currentYear: CY }));
    const dwB = JSON.stringify(base.saved.buildSavedNumerologySection(r as never, "1e40af", { futureYears: false, currentYear: CY }));
    ok(dwA === dwB, `A ${p.birthDate} danışan Word bölümü (yetki KAPALI) taban ile birebir`);
    const dwA2 = JSON.stringify(buildSavedNumerologySection(r as never, "1e40af", { futureYears: true, currentYear: CY }));
    const dwB2 = JSON.stringify(base.saved.buildSavedNumerologySection(r as never, "1e40af", { futureYears: true, currentYear: CY }));
    ok(dwA2 === dwB2, `A ${p.birthDate} danışan Word bölümü (yetki AÇIK) taban ile birebir`);
    ok(JSON.stringify(parseSavedDegisim((motor as Record<string, unknown>).degisimDonusumMetni)) === JSON.stringify(base.saved.parseSavedDegisim((motor as Record<string, unknown>).degisimDonusumMetni)), `A ${p.birthDate} kayıtlı Değişim ayrıştırması taban ile birebir`);
  }

  // ── B) NEGATİF SENARYOLAR ─────────────────────────────────────────────────────
  section("B) Negatif senaryolar — gizli hiçbir veri hiçbir çıktı yolunda görünmemeli");
  for (const p of PEOPLE) {
    const ref = await referenceFor(p);
    const by = Number(p.birthDate.slice(6));
    const secretCount = Object.values(ref.secret).reduce((s, x) => s + x.size, 0);
    ok(secretCount > 0, `B ${p.birthDate} referansta gizlenecek gelecek veri VAR (${secretCount} satır, ${ref.futureDegisim.length} gelecek Değişim) — test anlamlı`);
    for (const sc of SCENARIOS) {
      let s: Surfaces;
      try {
        s = await surfaces(sc.build(p), false, { clientBirth: sc.clientBirth });
      } catch (e) {
        ok(false, `${sc.id} ${p.birthDate} ${sc.title}: ÇÖKTÜ`, String(e));
        rows.push(`| ${sc.id} | ${sc.title} | ${p.birthDate} | ÇÖKTÜ | FAIL |`);
        continue;
      }
      const l = leaks(s, ref, by);
      ok(l.length === 0, `${sc.id} ${p.birthDate} ${sc.title}: sızıntı yok (${Object.keys(s).length} çıktı yolu)`, l.slice(0, 5));
      let expectOk = true;
      let expectNote = "";
      if (sc.expect === "golden") {
        // Aşırı gizleme de yok: yetkisiz temiz referansla aynı satırlar (düz metin + Word'ler)
        // Word'lerde yalnız kronolojik satırlar karşılaştırılır (kayıt meta satırı tarih biçimini aynen gösterir).
        // Not: Numeroloji Word'ü ISO `birth_date` kaydında Değişim bölümünü hiç üretmez (taban davranışı, değiştirilmedi).
        const CHRONO_LINE = /Değişim|Zirve|zirve|Mücadele|yaş|Etki|Yıl:/;
        const isoRecord = sc.id === "S02" || sc.id === "S08" || sc.id === "S12"; // Word Değişim kayıt alanını aynen okur (ISO/geçersiz → bölüm yok = daha az gösterim)
        for (const k of ["duzMetin", "wordDanisan", "wordNumeroloji"]) {
          if (k === "wordNumeroloji" && isoRecord) continue;
          const pick = (xs: string[]) => (k === "duzMetin" ? xs : xs.filter((x) => CHRONO_LINE.test(x)));
          const a = pick(s[k] ?? []).join("\n");
          const b = pick(ref.restrictedList[k] ?? []).join("\n");
          if (a !== b) { expectOk = false; expectNote += `${k} referanstan farklı; `; }
        }
      } else if (sc.expect === "closed") {
        const chrono = (s.duzMetin ?? []).filter((x) => /Değişim \d{4}|zirve — yaş|· konu/.test(x));
        if (chrono.length) { expectOk = false; expectNote = `kronoloji açık kaldı: ${chrono[0]}`; }
      }
      ok(expectOk, `${sc.id} ${p.birthDate} beklenen davranış (${sc.expect === "golden" ? "temiz referansla aynı" : sc.expect === "closed" ? "fail-closed: kronoloji gizli" : "çökmeden, sızıntısız"})`, expectNote || undefined);
      rows.push(`| ${sc.id} | ${sc.title} | ${p.birthDate} | ${l.length === 0 ? "sızıntı 0" : `SIZINTI ${l.length}`} · ${expectOk ? sc.expect : "BEKLENMEYEN"} | ${l.length === 0 && expectOk ? "PASS" : "FAIL"} |`);
      if (OUT && p === PEOPLE[0]) writeFileSync(path.join(OUT, `${sc.id}.json`), JSON.stringify(s, null, 2));
    }
  }

  // ── C) Kök neden kanıtı: taban kod çelişkili kayıtta gelecek dönemi AÇIYORDU ──────
  section("C) Kök neden kanıtı (taban kod) ve yeni kodun kapattığı açıklar");
  {
    const p = PEOPLE[0]!;
    const ref = await referenceFor(p);
    const conflict = rowOf(p, motorOf(p), p.birthDate.slice(0, 6) + String(Number(p.birthDate.slice(6)) - 12));
    const oldLines = await docxLines(await Packer.toBuffer(new Document({ sections: [{ children: base.saved.buildSavedNumerologySection(conflict as never, "1e40af", { futureYears: false, currentYear: CY }) as never }] })));
    const newLines = await docxLines(await Packer.toBuffer(new Document({ sections: [{ children: buildSavedNumerologySection(conflict as never, "1e40af", { futureYears: false, currentYear: CY }) as never }] })));
    const oldLeak = oldLines.filter((l) => ref.secret.wordDanisan?.has(l));
    const newLeak = newLines.filter((l) => ref.secret.wordDanisan?.has(l));
    ok(oldLeak.length > 0, `C1 taban kod: kayıt alanı snapshot'la çelişince danışan Word'ü gelecek dönem gösteriyordu (${oldLeak.length} satır) — kök neden doğrulandı`, oldLeak.slice(0, 2));
    ok(newLeak.length === 0, "C2 yeni kod: aynı kayıtta sızıntı 0 (fail-closed)");
    // I18N-0007: taban düz metin yedeği doğum satırı yoksa Değişim satırlarını FİLTRESİZ basıyordu.
    const m = mapTexts(motorOf(p), stripBirthLines);
    const oldDeg = base.plain.degisimBoundedText(m as never, CY);
    const newDeg = buildPlainAnalizFull(m as never, CY, chronoNoteText(false), null);
    ok(ref.futureDegisim.some((t) => oldDeg.includes(t.replace("Değişim ", "Değişim: "))), "C3 taban kod (I18N-0007): doğum satırı yokken gelecek Değişim satırları filtresiz basılıyordu — kök neden doğrulandı");
    ok(!ref.futureDegisim.some((t) => newDeg.includes(t) || newDeg.includes(t.replace("Değişim ", "Değişim: "))), "C4 yeni kod: aynı durumda gelecek Değişim yok (fail-closed)");
    // İstemci önbelleği "yetkili" dese de sunucu kısıtlı kopya gönderdiyse sınır genişlemez (yer tutucu / yeniden hesap yok).
    const r = rowOf(p, motorOf(p), p.birthDate);
    const red = redactAnalysisDataForFutureYears(r.analysis_data, { futureYears: false, currentYear: CY, birthDate: r.birth_date });
    const v = chronoViewLimit(CY, true, restrictedLimitYearOf(red));
    ok(v.limitYear === CY && v.futureYears === false, "C5 sunucu kısıtı varken istemci yetki önbelleği (true) sınırı genişletemez");
    const vm = extractMotorFromAnalysisJson(red, r.name, r.surname)!;
    const oldWide = base.plain.buildPlainAnalizFull(vm as never, CHRONO_NO_LIMIT_YEAR);
    const newWide = buildPlainAnalizFull(vm as never, CHRONO_NO_LIMIT_YEAR, chronoNoteText(true), r.birth_date);
    ok(PLACEHOLDER_RE.test(oldWide), "C6 taban kod: kısıtlı kopya + geniş sınırda yer tutucu (999) ekrana basılıyordu — kök neden doğrulandı");
    ok(!PLACEHOLDER_RE.test(newWide), "C7 yeni kod: yer tutucular hiçbir sınırda basılmaz");
    ok(restrictedLimitYearOf({ futureYearsView: { restricted: true } }) === 0 && restrictedLimitYearOf({ futureYearsView: { restricted: "true" } }) === null && restrictedLimitYearOf(null) === null, "C8 kısıt bilgisi bozuksa sınır 0 (hiçbir dönem açılmaz); yalnız gerçek true kısıt sayılır");
    // Değişim ayrıştırması EN başlıklarla da çalışır (bölüm sessizce kaybolmaz) ve tutarsız satırı reddeder.
    const en = mapTexts(motorOf(p), toEnglish).degisimDonusumMetni;
    const tr = motorOf(p).degisimDonusumMetni;
    ok(JSON.stringify(parseSavedDegisim(en)) === JSON.stringify(parseSavedDegisim(tr)) && parseSavedDegisim(tr) !== null, "C9 danışan Word Değişim ayrıştırması EN başlıklarla TR ile aynı satırları verir (bölüm kaybolmaz)");
    const tampered = String(tr).replace(/2\. Değişim: (\d{4})/, "2. Değişim: 1900");
    ok(parseSavedDegisim(tampered) === null, "C10 tutarsız Değişim satırı (değişim yılı ≠ etki bitişi) → bölüm fail-closed");
  }

  // ── D) Tek çözücü birim testleri ───────────────────────────────────────────────
  section("D) resolveChronoBirth (yapı birincil, metin geri dönüş, fail-closed)");
  {
    const p = PEOPLE[0]!;
    const m = motorOf(p);
    const r = (motor: unknown, rec?: unknown) => resolveChronoBirth(motor, rec);
    const okY = (x: ReturnType<typeof r>, y: number, src: string) => x.ok && x.year === y && x.source === src;
    ok(okY(r(m, p.birthDate), 1987, "record"), "D1 kayıt alanı birincil (source=record)");
    ok(okY(r(m, p.iso), 1987, "record"), "D2 ISO kayıt alanı");
    ok(okY(r(m), 1987, "legacy-text"), "D3 kayıt alanı yok → eski kayıt metin geri dönüşü");
    ok(okY(r(mapTexts(motorOf(p), toEnglish)), 1987, "legacy-text"), "D4 EN etiket (Date of Birth) tanınır");
    ok(okY(r(mapTexts(motorOf(p), stripBirthLines), p.birthDate), 1987, "record"), "D5 metin yok + kayıt alanı → record");
    ok(!r(mapTexts(motorOf(p), stripBirthLines)).ok, "D6 metin yok + kayıt yok → missing (harf yılı tek başına tarih vermez)");
    ok((r(m, "14.02.1975") as { reason?: string }).reason === "conflict", "D7 kayıt ↔ metin çelişkisi → conflict");
    ok((r(mapTexts(motorOf(p), stripBirthLines), "14.02.1975") as { reason?: string }).reason === "conflict", "D8 kayıt ↔ harf yılı çelişkisi (metin yokken bile) → conflict");
    ok(okY(r(m, "31.02.1987"), 1987, "legacy-text"), "D9 geçersiz kayıt alanı + metin ve harf birbirini doğruluyor → snapshot tarihi");
    ok(!r(mapTexts(motorOf(p), stripBirthLines), "31.02.1987").ok, "D10 geçersiz kayıt alanı + doğrulama yok → invalid");
    ok(!r(mapTexts(motorOf(p), (s) => s.replace(/Doğum Tarihi: [^\n]+/, "Doğum Tarihi: abc"))).ok, "D11 metinde bozuk tarih → invalid");
    ok(!r(null, null).ok && !r("çöp", "").ok && !r({ harflerinYankilanisi: "x" }, undefined).ok, "D12 bozuk girdi türleri → çökmez, fail-closed");
    const zg = zirveYasGorunumu((m.zirveYillari as { peaks: never }).peaks, null, CY);
    ok(!!zg && zg.format === "iki-metot" && zg.metot1.length === 0 && zg.metot2.length === 0, "D13 Zirve: doğum yılı yokken yetki KAPALI → hiçbiri (eskiden tümü)");
    const mc = cutoffMucadele(m.mucadeleYillari as never, null, CY);
    ok(!!mc && mc.format === "kitap2" && mc.periods.length === 0 && mc.ana === null, "D14 Mücadele: doğum yılı yokken yetki KAPALI → hiçbiri (eskiden tümü)");
    const zAll = zirveYasGorunumu((m.zirveYillari as { peaks: never }).peaks, null, CHRONO_NO_LIMIT_YEAR);
    ok(!!zAll && zAll.format === "iki-metot" && zAll.metot1.length === 4, "D15 yetki AÇIK (sınırsız) → doğum yılı olmasa da tümü (önceki davranış)");
  }

  // ── E) Yetki / kullanıcı / tenant / rota (mevcut kontroller) ───────────────────
  section("E) Yetkisiz erişim, farklı kullanıcı ve tenant (rota seviyesi)");
  {
    const prof = (role: string, perms: Record<string, unknown> | null) => ({ role, module_permissions: perms });
    const A = prof("expert", { numerology: true, numerology_future_years: true });
    const B = prof("expert", { numerology: true });
    ok(canSeeNumerologyFutureYears(A) && !canSeeNumerologyFutureYears(B), "E1 uzman A yetkili, uzman B yetkisiz (kullanıcı bazlı)");
    ok(!canSeeNumerologyFutureYears(prof("expert", { numerology: true, numerology_future_years: "true" })) && !canSeeNumerologyFutureYears(null), "E2 string \"true\" / profil yok → KAPALI");
    const p = PEOPLE[0]!;
    const r = rowOf(p, motorOf(p), p.birthDate);
    const vA = JSON.stringify(redactAnalysisDataForFutureYears(r.analysis_data, { futureYears: canSeeNumerologyFutureYears(A), currentYear: CY, birthDate: r.birth_date }));
    const vB = JSON.stringify(redactAnalysisDataForFutureYears(r.analysis_data, { futureYears: canSeeNumerologyFutureYears(B), currentYear: CY, birthDate: r.birth_date }));
    ok(vA === JSON.stringify(r.analysis_data) && vB !== vA && apiLeaks(vB, 1987).length === 0, "E3 aynı kayıt: A tam, B süzülmüş ve sızıntısız");
    const src = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
    const ROUTES: [string, RegExp, RegExp][] = [
      ["app/api/numeroloji/analyses/route.ts", /requireModuleAccess\(req, "numerology"\)/, /redactAnalysisDataForFutureYears\(row\.analysis_data, \{ futureYears, currentYear, birthDate:/],
      ["app/api/clients/[id]/numerology-analysis/route.ts", /requireModuleAccess\(req, "clients"\)/, /redactAnalysisDataForFutureYears\(record\.analysis_data, \{ futureYears, currentYear: currentIstanbulYear\(\), birthDate: record\.birth_date \}\)/],
      ["app/api/numeroloji/word-report/route.ts", /requireModuleAccess\(req, "numerology"\)/, /const futureYears = canSeeNumerologyFutureYears\(guard\.profile\)/],
      ["app/api/clients/[id]/word-report/route.ts", /guard/, /numerologyFutureYears: numerologyRecord \? canSeeNumerologyFutureYears\(guard\.profile\) : false/],
      ["lib/archive/server/reports.ts", /ctx\.profile/, /canSeeNumerologyFutureYears\(ctx\.profile\)/],
      ["app/api/numeroloji-klasik/karsilastirma/hizala/route.ts", /guard/, /futureYears: canSeeNumerologyFutureYears\(guard\.profile\)/],
    ];
    for (const [f, guardRe, decRe] of ROUTES) {
      const s = src(f);
      const futLines = s.split("\n").filter((l) => /futureYears/i.test(l));
      const fromClient = futLines.some((l) => /body\.|searchParams|req\.json|query\./.test(l));
      ok(guardRe.test(s) && decRe.test(s) && !fromClient, `E4 ${f}: yetki SUNUCUDA doğrulanmış profilden; istemci girdisi yetki sayılmaz`);
    }
    const an = src("app/api/numeroloji/analyses/route.ts");
    ok((an.match(/\.eq\("tenant_id", tenantId\)/g) ?? []).length >= 5, "E5 analyses: tüm okuma/yazmalar oturum tenant'ına bağlı (çapraz tenant 404)");
    ok(/compareService/.test(src("app/api/numeroloji-klasik/karsilastirma/hizala/route.ts")) && /redactAnalysisDataForFutureYears\(legacy\.analysisData, \{ futureYears: ctx\.futureYears === true/.test(src("lib/numeroloji-klasik/server/compareService.ts")), "E6 karşılaştırma: Bütüncül kayıt aynı süzgeçten geçer");
    const hook = src("app/numeroloji/hooks/useNumerolojiFutureYears.ts");
    ok(/uid !== state\.userId/.test(hook) && /getServerSnapshot = \(\) => false/.test(hook), "E7 istemci yetki önbelleği kullanıcı değişince sıfırlanır; varsayılan KAPALI");
    // Karşılaştırma okuyucusu: yer tutucu "-1" değer gibi gösterilmez.
    const red = redactAnalysisDataForFutureYears(rowOf(PEOPLE[2]!, motorOf(PEOPLE[2]!), PEOPLE[2]!.birthDate).analysis_data, { futureYears: false, currentYear: CY, birthDate: PEOPLE[2]!.birthDate });
    const L = readLegacySnapshot(red);
    const ana = L.mucadele.periods.find((x) => x.position === 3);
    const shown = JSON.stringify(L);
    ok(ana && !ana.read.ok && (ana.read as { reason?: string }).reason === "future_hidden" && !/"display":"-1"/.test(shown), "E8 karşılaştırma: gizli ana mücadele «future_hidden» (\"-1\" gösterilmez)");
  }

  await newCalcEnPrivacy();

  cleanupBase();
  if (CRASHES.length) console.log(`\nÇöken çıktı yolları (veri göstermedi; bozuk kayıt dayanıklılığı bulgusu): ${CRASHES.length}\n  ` + Array.from(new Set(CRASHES)).join("\n  "));
  console.log(`\nNUMEROLOJİ P0 GİZLİLİK HARNESS: ${pass} PASS / ${fail} FAIL`);
  if (OUT) {
    writeFileSync(path.join(OUT, "negatif-tablo.md"), ["| Senaryo | Açıklama | Kişi | Sonuç | Durum |", "|---|---|---|---|---|", ...rows].join("\n") + "\n");
  }
  process.exit(fail ? 1 : 0);
}

// ── F) YENİ (kaydedilmemiş) HESAP ekranları — EN (+TR) istemci gizlemesi (QA-N3-03, R5) ─────────────────────────────
// Kaydedilmiş kayıtta sunucu kopyası gizli dönemleri yer tutucuya çevirir ve istemci hatasını MASKELER (B senaryoları EN'e özgü
// istemci gizleme hatasını yakalamaz). Yeni hesapta sunucu kopyası YOK: ham motor istemcide süzülür. Bu bölüm ham motoru
// 4 ekranda (Hesap Özetsiz · Sayısal · Sonuç Özeti · Görsel Rapor) AÇIKÇA "en" ve "tr" kataloglarıyla çizer ve MOTOR GERÇEĞİNDEN
// (gerçek doğum tarihi) kurulan yasaklı yaş / yıl kümesiyle tarar. EN desenleri: age(s) N, ages N–M, after N, until (age) N,
// transition boundary N, N years old, aged N ve liste yaşları ("33 · 42 · 51"), her öğe ayrı. Yöntem: QA-N3 bağımsız testi.
type NPerson = { tag: string; fn: string; ln: string; d: number; m: number; y: number };
type Truth = { FY: Set<number>; VY: Set<number>; FA: Set<number>; VA: Set<number>; hiddenAny: boolean };
const nTr = (p: NPerson) => `${String(p.d).padStart(2, "0")}.${String(p.m).padStart(2, "0")}.${p.y}`;
const nIso = (p: NPerson) => `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
const nMotor = (p: NPerson) => clone(hesaplaNumeroloji({ firstName: p.fn, lastName: p.ln, birthDate: nTr(p) })) as Record<string, unknown>;

function truthFor(birth: { d: number; m: number; y: number }, mo: Record<string, unknown>): Truth {
  const HY = new Set<number>(), VY = new Set<number>(), HA = new Set<number>(), VA = new Set<number>();
  const y = birth.y;
  for (const r of [...calcDegisimByYearOnly(y, birth.m, 5), ...calcDegisimByFullDate(birth.d, birth.m, y, 5)]) {
    const tgt = r.effectStartYear > CY ? HY : VY;
    tgt.add(r.effectStartYear); tgt.add(r.changeYear); tgt.add(r.effectEndYear);
  }
  for (const s of (mo.harflerinYankilanisi as { yearStart: number; yearEnd: number; ageStart: number; ageEnd: number }[] | undefined) ?? []) {
    const hidden = s.yearStart > CY;
    (hidden ? HY : VY).add(s.yearStart); (hidden ? HY : VY).add(s.yearEnd);
    (hidden ? HA : VA).add(s.ageStart); (hidden ? HA : VA).add(s.ageEnd);
  }
  for (const pk of (mo.zirveYillari as { peaks?: Record<string, unknown>[] } | undefined)?.peaks ?? []) {
    for (const k of ["yasMetot1", "yasMetot2", "age"]) {
      const a = pk[k];
      if (typeof a !== "number") continue;
      const hidden = y + a > CY;
      (hidden ? HA : VA).add(a); (hidden ? HY : VY).add(y + a);
    }
  }
  const md = mucadeleDonemleri(mo.mucadeleYillari);
  if (md && md.format === "kitap2") {
    for (const q of md.periods) {
      const hidden = y + q.startAge > CY;
      (hidden ? HA : VA).add(q.startAge); (hidden ? HA : VA).add(q.cutoffAge);
      (hidden ? HY : VY).add(y + q.startAge); (hidden ? HY : VY).add(y + q.cutoffAge);
    }
    if (md.ana) { const hidden = y + md.ana.startAge > CY; (hidden ? HA : VA).add(md.ana.startAge); (hidden ? HY : VY).add(y + md.ana.startAge); }
  }
  for (let a = 0; a <= Math.max(CY - y, 0); a++) VA.add(a);
  const FY = new Set([...HY].filter((v) => v > CY && !VY.has(v)));
  const FA = new Set([...HA].filter((v) => !VA.has(v)));
  return { FY, VY, FA, VA, hiddenAny: FY.size > 0 || FA.size > 0 };
}

const YEAR_RE = /(?<![\d.])(1[89]\d\d|2[01]\d\d)(?![\d])/g;
const AGE_RES = [
  /(?<![\d.])(?<!çakra\s)(?<!Çakra\s)(\d{1,3})\s*(?:yaş|yaşına|yaşından|yaşında)/g, /(?:yaş|Yaş|YAŞ|age|Age)\s*[:\-]?\s*(\d{1,3})(?![\d.])/g,
  /yaş\s*\d{1,3}\s*[–-]\s*(\d{1,3})/g, /geçiş sınırı\s*(\d{1,3})/g, /(?<![\d.])(\d{1,3})\s*sonrası/g,
  // EN: "age {age}", "ages {start}–{end}", "after {age}", "until (age) {age}", "transition boundary {age}", "N years old", "aged N"
  /\bages?\s+(\d{1,3})(?![\d.])/gi, /\bages?\s+\d{1,3}\s*[–-]\s*(\d{1,3})/gi, /\bafter\s+(?:age\s+)?(\d{1,3})(?![\d.])/gi,
  /transition boundary\s*(\d{1,3})/gi, /\buntil\s+(?:age\s+)?(\d{1,3})(?![\d.])/gi, /(\d{1,3})\s*(?:years?[ -]old)/gi, /\baged\s+(\d{1,3})/gi,
];
// Liste yaşları ("33 · 42 · 51 yaş" / "age(s) 33 · 42 · 51"): her öğe ayrı denetlenir.
const AGE_LIST_RES = [/((?:\d{1,3}\s*·\s*)+\d{1,3})\s*yaş/g, /\bages?\s+((?:\d{1,3}\s*·\s*)+\d{1,3})/gi];
const PH_RE = /(?<![\d.,])(999|9999)(?![\d])|(?<![\w\d.−-])-1(?![\d])/g;
const near = (text: string, i: number) => text.slice(Math.max(0, i - 50), i + 30).replace(/\s+/g, " ");
function leaksIn(text: string, t: Truth): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(YEAR_RE)) {
    const y = Number(m[1]);
    if (t.FY.has(y)) out.push(`gizli yıl ${y} ‹${near(text, m.index ?? 0)}›`);
    else if (y > CY && !t.VY.has(y)) out.push(`açıklanamayan gelecek yıl ${y} ‹${near(text, m.index ?? 0)}›`);
  }
  for (const re of AGE_RES) for (const m of text.matchAll(re)) { const a = Number(m[1]); if (t.FA.has(a)) out.push(`gizli yaş ${a} ‹${near(text, m.index ?? 0)}›`); }
  for (const re of AGE_LIST_RES) for (const m of text.matchAll(re)) for (const part of (m[1] ?? "").split("·")) { const a = Number(part.trim()); if (t.FA.has(a)) out.push(`gizli yaş (liste) ${a} ‹${near(text, m.index ?? 0)}›`); }
  for (const m of text.matchAll(PH_RE)) out.push(`yer tutucu ‹${near(text, m.index ?? 0)}›`);
  return [...new Set(out)];
}

/** Sınır kişisini MOTORDAN ara (gizli dönemin başlangıcı tam CY+1 vb.). */
function findPerson(tag: string, pred: (mo: Record<string, unknown>, y: number, mth: number) => boolean, d = 1, mth = 3): NPerson {
  for (const mm of [mth, 1, 6, 9, 12]) for (let y = 1930; y <= CY - 1; y++) {
    const p: NPerson = { tag, fn: "Sınır", ln: `Örnek${tag}`, d, m: mm, y };
    if (pred(nMotor(p), y, mm)) return p;
  }
  throw new Error("sınır kişisi bulunamadı: " + tag);
}
function newCalcPeople(): NPerson[] {
  const degNear = (() => {
    for (const k of [1, 2, 3]) {
      try {
        return findPerson("DEG", (_mo, y, mth) => calcDegisimByYearOnly(y, mth, 5).some((r) => r.effectStartYear === CY + k) && calcDegisimByYearOnly(y, mth, 5).some((r) => r.effectStartYear <= CY));
      } catch { /* sonraki k */ }
    }
    throw new Error("sınır kişisi bulunamadı: DEG");
  })();
  return [
    { tag: "ARTIK", fn: "Şubat Gülçin", ln: "Artıkyıl", d: 29, m: 2, y: 1996 },
    { tag: "YILSONU", fn: "Aralık", ln: "Sonyılcı", d: 31, m: 12, y: 1999 },
    { tag: "YILBASI", fn: "Ocak İlkay", ln: "Başoğlu", d: 1, m: 1, y: 2001 },
    { tag: "COKESKI", fn: "Eski Zühre", ln: "Asırlık", d: 15, m: 8, y: 1931 },
    { tag: "COKGENC", fn: "Bebek", ln: "Yenidoğan", d: 15, m: 6, y: CY - 1 },
    { tag: "BUYIL", fn: "Bu Yıl", ln: "Doğan", d: 2, m: 1, y: CY },
    degNear,
    findPerson("DEG0", (_mo, y, mth) => calcDegisimByYearOnly(y, mth, 5).some((r) => r.effectStartYear === CY)),
    findPerson("HARF", (mo) => ((mo.harflerinYankilanisi as { yearStart: number }[] | undefined) ?? []).some((s) => s.yearStart === CY + 1)),
    findPerson("ZIRVE", (mo, y) => ((mo.zirveYillari as { peaks?: { yasMetot1: number; yasMetot2: number }[] }).peaks ?? []).some((pk) => y + pk.yasMetot1 === CY + 1 || y + pk.yasMetot2 === CY + 1)),
    findPerson("MUC", (mo, y) => {
      const d = mucadeleDonemleri(mo.mucadeleYillari);
      return !!d && d.format === "kitap2" && (d.periods.some((q) => y + q.startAge === CY + 1) || (!!d.ana && y + d.ana.startAge === CY + 1));
    }),
  ];
}

async function newCalcEnPrivacy() {
  section("F) YENİ HESAP (kaydedilmemiş) ekranları — ham motor, sunucu kopyası YOK; EN ve TR istemci gizlemesi (QA-N3-03)");
  const people = newCalcPeople();
  ok(people.filter((p) => truthFor(p, nMotor(p)).hiddenAny).length >= 8, `F0 kişilerin çoğunda gizlenecek gelecek yaş/yıl VAR (test anlamlı; ${people.length} kişi)`);
  for (const locale of ["en", "tr"] as const) {
    for (const p of people) {
      const mo = nMotor(p);
      const t = truthFor(p, mo);
      const motor = extractMotorFromAnalysisJson({ version: 1, motor: clone(mo) }, p.fn, p.ln);
      // Yeni hesap: kayıt yok (analysisData null) → sınır yalnız istemci yetkisinden (SSR'da KAPALI) + doğum tarihinden.
      const draw = (C: ComponentType<never>, props: Record<string, unknown>) =>
        htmlLines(renderToStaticMarkup(createElement(ChronoRecordProvider, { birthDate: nIso(p), analysisData: null, children: createElement(C, props as never) }), locale)).join("\n");
      const screens: [string, () => string][] = motor
        ? [
            ["Hesap Özetsiz", () => draw(TabPlainAnaliz as never, { out: motor })],
            ["Sayısal", () => draw(TabAnalizOzetli as never, { out: motor, layout: "detay" })],
            ["Sonuç Özeti", () => draw(TabSonucOzeti as never, { out: motor, isimGoster: "Sentetik", dogumGoster: "—", layout: "premium" })],
            ["Görsel Rapor", () => draw(GorselRaporInfografik as never, { out: motor, firstName: p.fn, lastName: p.ln, ...GORSEL_PROPS })],
          ]
        : [];
      const found: string[] = motor ? [] : ["motor çıkarılamadı"];
      let gorsel = "";
      for (const [name, f] of screens) {
        let txt = "";
        try { txt = f(); } catch (e) { found.push(`${name}: ÇÖKTÜ ${String(e).slice(0, 120)}`); continue; }
        if (!txt) found.push(`${name}: BOŞ`);
        if (name === "Görsel Rapor") gorsel = txt;
        for (const l of leaksIn(txt, t)) found.push(`${name}: ${l}`);
      }
      ok(found.length === 0, `F ${locale.toUpperCase()} yeni hesap ${p.tag} ${nTr(p)}: 4 ekranda gizli yaş/yıl/yer tutucu YOK`, found.slice(0, 6));
      if (locale === "en" && p === people[0]) ok(/Pinnacle|Challenge/.test(gorsel), "F EN Görsel Rapor gerçekten EN şablonla çiziliyor (Pinnacle/Challenge)");
    }
  }
  // Dedektör pozitif kontrolü: gerçek EN katalog şablonlarıyla üretilen gizli yaş/yıl içeren satırlar YAKALANMALI.
  const en = getCatalogMessages("en");
  type Tv = (k: string, v?: Record<string, string>) => string;
  const tv = createTranslator({ locale: "en", messages: en as never, namespace: "numerology.tabs.visual" as never }) as unknown as Tv;
  const trs = createTranslator({ locale: "en", messages: en as never, namespace: "numerology.result.tabs" as never }) as unknown as Tv;
  const T: Truth = { FY: new Set([CY + 7]), VY: new Set(), FA: new Set([51]), VA: new Set([0, 9, 33]), hiddenAny: true };
  const samples: [string, string][] = [
    ["peakLine", tv("peakLine", { i: "3", age: "51", topic: "4" })],
    ["ages(liste)", tv("ages", { ages: "33 · 42 · 51" })],
    ["challengeFirst", tv("challengeFirst", { age: "51", topic: "2" })],
    ["challengeNext", tv("challengeNext", { i: "2", age: "51", topic: "2" })],
    ["challengeMain", tv("challengeMain", { age: "51", topic: "2" })],
    ["challengePrev", tv("challengePrev", { i: "2", age: "51", topic: "2" })],
    ["changeLine(yıl)", tv("changeLine", { i: "2", year: String(CY + 7), chakra: "3", start: String(CY + 6), end: String(CY + 7) })],
    ["ageSingle", trs("ageSingle", { age: "51" })],
    ["ageRange", trs("ageRange", { start: "42", end: "51" })],
    ["harfLine", trs("harfLine", { i: "2", letter: "A", chakra: "1", start: "42", end: "51" })],
    ["years old (serbest)", "Main challenge: 51 years old"],
    ["aged (serbest)", "Phase opens aged 51"],
  ];
  for (const [k, s] of samples) ok(leaksIn(s, T).length > 0, `F EN dedektör pozitif: «${s}» (${k}) gizli belirteci yakalanıyor`);
  ok(leaksIn(tv("peakLine", { i: "1", age: "33", topic: "4" }), T).length === 0, "F EN dedektör negatif: görünür yaş (33) yanlış pozitif DEĞİL");
}

main().catch((e) => { console.error(e); cleanupBase(); process.exit(1); });
