/**
 * AŞAMA 2 / DY-005 · DY-006 — Danışana BAĞLI kayıtlı Numeroloji analizinin danışan Word bölümü (SAF).
 *
 * KURALLAR (owner kararı A, 23.10.2026):
 *  - Numeroloji motoru ÇAĞRILMAZ, hiçbir değer yeniden HESAPLANMAZ. Kayıt "Model C" ile, kaydedildiği
 *    günkü snapshot'tan okunur (`resolveRecordMotor` — Numeroloji ekranı / Word ile aynı tek kaynak).
 *  - Profesyonel hesap ayrıntıları snapshot'taki yapısal alanlardan aktarılır: temel değerler, PIN
 *    piramidi, Çakra Omurgası sütunları, Elementler, Değişim–Dönüşüm (snapshot'taki kayıtlı metinden
 *    okunur), Zirve Yılları, Mücadele Yılları, Harflerin Yankılanışı ve kayıtlı Sonuç Özeti.
 *  - Kronolojik bölümler Numeroloji Word'ü ile AYNI görünürlük kuralını (yıl sınırı / Gelecek Yıllar
 *    yetkisi) aynı yardımcılarla uygular — yalnız gösterim filtresi, hesap değil.
 *  - Snapshot'ta bulunmayan bölüm UYDURULMAZ / tamamlanmaz; yalnız eksik olduğu söylenir.
 *  - Kayıt danışana yalnız uzmanın açık bağlamasıyla gelir (route `client_id` bağını doğrular).
 */
import { AlignmentType, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType, ShadingType, BorderStyle } from "docx";
import type { ReportChild } from "@/lib/docx/reportHelpers";
import { REPORT_FONT } from "@/lib/docx/reportHelpers";
import { formatDateLoose, formatInstantDateTime } from "@/lib/time/reportTime";
import { LEGACY_METHOD_NOTE, extractSummaryFromAnalysisData, resolveRecordMotor } from "@/app/numeroloji/utils/analysisJson";
import { nrDisplay } from "@/app/numeroloji/utils/numerolojiPlainMetin";
import { parseBirthDateFlexible } from "@/app/numeroloji/utils/numerolojiInput";
import {
  chronoLimitYear,
  chronoNoteText,
  cutoffHarfSegments,
  cutoffMucadele,
  harfDisplayAgeEnd,
  harfDisplayYearEnd,
  zirveYasGorunumu,
  ZIRVE_METOT1_LABEL,
  ZIRVE_METOT2_LABEL,
} from "@/app/numeroloji/utils/chronoCutoff";
import { MUCADELE_ONCEKI_METOD_NOTU, mucadeleKonuText, type MucadeleResult, type Zirve } from "@/lib/numeroloji";
import type { HarfYankilanisiSegment } from "@/lib/numeroloji";
import { currentIstanbulYear } from "@/lib/numeroloji/timing";
import { DY_CONTENT_W, dyBody, dyDataTable, dyGap, dyKvTable, dyNote, dySubTitle } from "./clientReportLayout";

/** numerology_records satırının bu bölüm için okunan alanları (tenant + client_id doğrulaması route'ta). */
export type SavedNumerologyRow = {
  id: string;
  name?: string | null;
  surname?: string | null;
  birth_date?: string | null;
  created_at?: string | null;
  analysis_data?: unknown;
};

export const SAVED_NUMEROLOGY_COLUMNS = "id, name, surname, birth_date, created_at, analysis_data";

export type SavedNumerologyOpts = {
  /** SUNUCUDA doğrulanmış "Gelecek Yılları Göster" yetkisi (Numeroloji Word ile aynı). Varsayılan KAPALI. */
  futureYears?: boolean;
  /** Test için sabit "bu yıl" (varsayılan: İstanbul takvim yılı). */
  currentYear?: number;
};

const SNAPSHOT_UNREADABLE = "Bu kayıtlı numeroloji analizinin hesap içeriği okunamadı; değerler yeniden hesaplanmadı.";
const PIN_ELEMENT: Record<number, string> = { 1: "Hava", 5: "Hava", 2: "Su", 7: "Su", 3: "Ateş", 6: "Ateş", 4: "Toprak", 8: "Toprak", 9: "Eter / Nötr" };

const xRepeat = (n: number) => (n > 0 ? "X".repeat(Math.min(n, 12)) : "—");
const xCell = (n: number) => (n > 0 ? `${xRepeat(n)}  (${n})` : "—");
const asObj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : 0);

// ── PIN piramidi (4 · 3 · 1 · 1; sabit düzen, ortalı) ────────────────────────
function pinRow(vals: string[], color: string): Table {
  const w = 900;
  return new Table({
    alignment: AlignmentType.CENTER,
    width: { size: w * vals.length, type: WidthType.DXA },
    columnWidths: vals.map(() => w),
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({
      cantSplit: true,
      children: vals.map((v) => new TableCell({
        width: { size: w, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 40, right: 40 },
        shading: { fill: "eef2ff", type: ShadingType.CLEAR, color: "auto" },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 8, color },
          bottom: { style: BorderStyle.SINGLE, size: 8, color },
          left: { style: BorderStyle.SINGLE, size: 8, color },
          right: { style: BorderStyle.SINGLE, size: 8, color },
        },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: v, bold: true, size: 26, font: REPORT_FONT, color })] })],
      })),
    })],
  });
}
function pinPyramid(pin: unknown, color: string): ReportChild[] {
  const p = asObj(pin);
  if (!p) return [];
  const g = (k: string) => (p[k] == null || p[k] === "" ? "—" : String(p[k]));
  const out: ReportChild[] = [];
  for (const keys of [["k1", "k2", "k3", "k4"], ["k5", "k6", "k7"], ["k8"], ["k9"]]) {
    out.push(pinRow(keys.map(g), color), new Paragraph({ spacing: { after: 40 } }));
  }
  const parts: string[] = [];
  for (const k of ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"]) {
    const d = Number(p[k]);
    if (Number.isFinite(d) && PIN_ELEMENT[d]) parts.push(`${d} → ${PIN_ELEMENT[d]}`);
  }
  if (parts.length) out.push(dyNote(`PIN element karşılıkları: ${parts.join("  ·  ")}`));
  return out;
}

// ── Değişim–Dönüşüm: snapshot'taki KAYITLI metinden okunur (hesap YOK) ───────────
type DegisimRow = { index: number; changeYear: number; chakra: number; effectStartYear: number; period: string };
export function parseSavedDegisim(text: unknown): { yearOnly: DegisimRow[]; fullDate: DegisimRow[] } | null {
  if (typeof text !== "string" || !text.includes("Değişim")) return null;
  const parts = text.split(/2\)\s*GÜN VE AY DAH[İI]L/i);
  const read = (chunk: string | undefined, full: boolean): DegisimRow[] => {
    if (!chunk) return [];
    const out: DegisimRow[] = [];
    const re = full
      ? /(\d+)\.\s*Değişim:\s*(\d{4})\s*→\s*Çakra:\s*(\d+)\.\s*Çakra\s*\n\s*Etki Dönemi:\s*(\d{4}) yılının (\d{2})\.(\d{2}) tarihinden (\d{4}) yılının \d{2}\.\d{2} tarihine kadar/g
      : /(\d+)\.\s*Değişim:\s*(\d{4})\s*→\s*Çakra:\s*(\d+)\.\s*Çakra\s*\n\s*Etki Dönemi \(yaklaşık\):\s*(\d{4}) yılının (\d+)\. ayından (\d{4}) yılının \d+\. ayına kadar/g;
    for (const m of chunk.matchAll(re)) {
      const [index, changeYear, chakra, start] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
      const period = full ? `${m[4]}.${m[5]}.${m[6]} – ${m[7]}.${m[5]}.${m[6]}` : `${m[4]}–${m[6]} (${m[5]}. ay)`;
      out.push({ index, changeYear, chakra, effectStartYear: start, period });
    }
    return out;
  };
  const yearOnly = read(parts[0], false);
  const fullDate = read(parts[1], true);
  return yearOnly.length || fullDate.length ? { yearOnly, fullDate } : null;
}

export function buildSavedNumerologySection(row: SavedNumerologyRow, color: string, opts: SavedNumerologyOpts = {}): ReportChild[] {
  const fullName = [row.name, row.surname].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  const savedAt = row.created_at ? formatInstantDateTime(row.created_at) : "";
  const { motor, legacy } = resolveRecordMotor(row);
  const summary = extractSummaryFromAnalysisData(row.analysis_data);
  const futureYears = opts.futureYears === true;
  const cutoff = chronoLimitYear(opts.currentYear ?? currentIstanbulYear(), futureYears);
  const birthYear = parseBirthDateFlexible(row.birth_date)?.year ?? null;
  const chrono = () => dyNote(chronoNoteText(futureYears));

  const out: ReportChild[] = [];
  out.push(dyNote(
    `Numeroloji modülündeki kayıtlı analizden, kaydedildiği haliyle aktarılmıştır${savedAt ? ` (kayıt: ${savedAt})` : ""}. ` +
    "Analiz bu danışana uzman tarafından bağlanmıştır; değerler yeniden hesaplanmamıştır.",
  ));
  const meta = dyKvTable([
    ["Analizdeki Ad Soyad", fullName],
    ["Analizdeki Doğum Tarihi", row.birth_date ? formatDateLoose(row.birth_date, { fallback: row.birth_date }) : ""],
  ].filter(([, v]) => !!v) as [string, string][], { cols: 2, labelColor: color });
  if (meta) out.push(meta, dyGap());
  if (legacy) out.push(dyNote(LEGACY_METHOD_NOTE));

  if (!motor) {
    out.push(dyNote(SNAPSHOT_UNREADABLE));
    if (summary) { out.push(dySubTitle("Sonuç Özeti (kayıtlı metin)", color)); for (const b of summary.split(/\n{2,}/)) if (b.trim()) out.push(dyBody(b.trim())); }
    return out;
  }
  const m = motor as unknown as Record<string, unknown>;

  // 1) Temel değerler
  const core = ([
    ["Ana Kulvar", nrDisplay(motor.anaKulvar)],
    ["Yan Kulvar", nrDisplay(motor.yanKulvar)],
    ["İfade Sayısı", nrDisplay(motor.ifadeSayisi)],
    ["Hayat Yolu / DM", nrDisplay(motor.hayatYolu)],
  ] as [string, string][]).filter(([, v]) => v && v !== "—");
  out.push(dySubTitle("Temel Numeroloji Değerleri", color));
  const coreTable = dyKvTable(core, { cols: 4, labelColor: color });
  if (coreTable) out.push(coreTable, dyGap());

  // 2) PIN Kodu
  const pin = pinPyramid(m.pinKodu, color);
  if (pin.length) { out.push(dySubTitle("PIN Kodu", color), ...pin, dyGap(80)); }

  // 3) Çakra Omurgası (sol: sayı desteği · çakra · sağ: isim/harf desteği)
  const cak = asObj(m.cakraOmurgasi);
  if (cak) {
    const sayilar = asObj(cak.sayilar) ?? {};
    const harfler = asObj(cak.harfler) ?? {};
    const rows: string[][] = [];
    for (let n = 10; n >= 1; n -= 1) rows.push([xCell(num(sayilar[n])), `${n}. çakra`, xCell(num(harfler[n]))]);
    out.push(dySubTitle("Çakra Omurgası", color));
    out.push(dyNote("Sol sütun sayı desteğini, sağ sütun isim/harf desteğini gösterir."));
    out.push(dyDataTable(
      [{ header: "Sol Destek (Sayı)", pct: 38, align: "right" }, { header: "Çakra", pct: 24, align: "center" }, { header: "Sağ Destek (Harf)", pct: 38 }],
      rows, { headerFill: color },
    ), dyGap());
  }

  // 4) Elementler
  const el = asObj(m.elementler);
  if (el) {
    const counts = asObj(el.counts) ?? {};
    const order = ["Hava", "Su", "Ateş", "Toprak"];
    const dominant = typeof el.key === "string" ? el.key.trim() : "";
    out.push(dySubTitle("Elementler", color));
    out.push(dyDataTable(
      order.map((e) => ({ header: e, pct: 25, align: "center" as const })),
      [order.map((e) => ({ text: xCell(num(counts[e])), bold: e === dominant }))],
      { headerFill: color },
    ));
    const extra: string[] = [];
    if (dominant) extra.push(`Baskın element: ${dominant}`);
    if (num(el.neutralCount) > 0) extra.push(`Eter / Nötr: ${num(el.neutralCount)}`);
    out.push(extra.length ? dyNote(extra.join("  ·  ")) : dyGap());
  }

  // 5) Değişim–Dönüşüm (kayıtlı metinden; başlamamış dönem gizli — Numeroloji Word kuralı)
  const deg = parseSavedDegisim(m.degisimDonusumMetni);
  if (deg) {
    const y = deg.yearOnly.filter((r) => r.effectStartYear <= cutoff);
    const f = deg.fullDate.filter((r) => r.effectStartYear <= cutoff);
    if (y.length || f.length) {
      out.push(dySubTitle("Değişim — Dönüşüm", color));
      const cols = [{ header: "Değişim", pct: 18 }, { header: "Yıl", pct: 16, align: "center" as const }, { header: "Çakra", pct: 18, align: "center" as const }, { header: "Etki Dönemi", pct: 48 }];
      const toRows = (rs: DegisimRow[]) => rs.map((r) => [`${r.index}. Değişim`, String(r.changeYear), `${r.chakra}. çakra`, r.period]);
      if (y.length) { out.push(dyNote("Doğum yılına göre")); out.push(dyDataTable(cols, toRows(y), { headerFill: color })); }
      if (f.length) { out.push(dyNote("Gün ve ay dâhil")); out.push(dyDataTable(cols, toRows(f), { headerFill: color })); }
      out.push(chrono());
    }
  }

  // 6) Zirve Yılları
  const z = zirveYasGorunumu((asObj(m.zirveYillari)?.peaks as Zirve[] | undefined) ?? null, birthYear, cutoff);
  if (z) {
    const zCols = [{ header: "Zirve", pct: 25 }, { header: "Yaş", pct: 25, align: "center" as const }, { header: "Sayı / Çakra", pct: 50, align: "center" as const }];
    const zRows = (rs: { index: number; age: number; topic: number; display?: string }[]) =>
      rs.map((pk) => [`${pk.index}. Zirve`, `${pk.age} yaş`, pk.display && pk.display.includes("/") ? `${pk.display} (${pk.topic}. çakra)` : `${pk.topic}. çakra`]);
    const blocks: ReportChild[] = [];
    if (z.format === "kayitli") { if (z.peaks.length) blocks.push(dyDataTable(zCols, zRows(z.peaks), { headerFill: color })); }
    else {
      for (const [label, rs] of [[ZIRVE_METOT1_LABEL, z.metot1], [ZIRVE_METOT2_LABEL, z.metot2]] as const) {
        if (!rs.length) continue;
        blocks.push(dyNote(label), dyDataTable(zCols, zRows(rs), { headerFill: color }));
      }
    }
    if (blocks.length) out.push(dySubTitle("Zirve Yılları", color), ...blocks, chrono());
  }

  // 7) Mücadele Yılları
  const c = cutoffMucadele(m.mucadeleYillari as MucadeleResult | null, birthYear, cutoff);
  if (c) {
    const rows: string[][] = c.format === "onceki"
      ? c.points.map((pt) => [`${pt.index}. Mücadele`, `${pt.age} yaş`, mucadeleKonuText(pt.topic)])
      : [
          ...c.periods.map((pd) => [`${pd.index}. Mücadele`, pd.index === 1 ? `${pd.cutoffAge} yaşına kadar` : `sonraki 27 yıl · geçiş sınırı ${pd.cutoffAge}`, mucadeleKonuText(pd.topic)]),
          ...(c.ana ? [["Ana Mücadele", `${c.ana.startAge} sonrası`, mucadeleKonuText(c.ana.topic)]] : []),
        ];
    if (rows.length) {
      out.push(dySubTitle("Mücadele Yılları", color));
      out.push(dyDataTable([{ header: "Mücadele", pct: 28 }, { header: "Dönem", pct: 40 }, { header: "Konu", pct: 32 }], rows, { headerFill: color }));
      if (c.format === "onceki") out.push(dyNote(MUCADELE_ONCEKI_METOD_NOTU));
      out.push(chrono());
    }
  }

  // 8) Harflerin Yankılanışı
  const hy = m.harflerinYankilanisi as HarfYankilanisiSegment[] | undefined;
  if (Array.isArray(hy) && hy.length) {
    const cut = cutoffHarfSegments(hy, cutoff);
    if (cut.length) {
      out.push(dySubTitle("Harflerin Yankılanışı", color));
      out.push(dyDataTable(
        [{ header: "Sıra", pct: 12, align: "center" }, { header: "Harf", pct: 14, align: "center" }, { header: "Çakra", pct: 20, align: "center" }, { header: "Yaş Aralığı", pct: 27, align: "center" }, { header: "Yıl Aralığı", pct: 27, align: "center" }],
        cut.map((s, i) => {
          const ye = harfDisplayYearEnd(s);
          return [String(i + 1), s.letter, `${s.chakra}. çakra`, `${s.ageStart}–${harfDisplayAgeEnd(s)}`, s.yearStart != null && ye != null ? `${s.yearStart}–${ye}` : "—"];
        }),
        { headerFill: color },
      ));
      out.push(chrono());
    }
  }

  // 9) Kayıtlı Sonuç Özeti metni (kesme yok)
  if (summary) {
    out.push(dySubTitle("Sonuç Özeti (kayıtlı metin)", color));
    for (const b of summary.split(/\n{2,}/)) if (b.trim()) out.push(dyBody(b.trim()));
  }
  return out;
}

/** Test/harness: tablo genişliği sınırı (layout ile aynı). */
export const SAVED_NUMEROLOGY_MAX_WIDTH = DY_CONTENT_W;
