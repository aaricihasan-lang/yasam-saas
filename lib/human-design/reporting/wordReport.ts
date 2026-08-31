/**
 * HD FAZ 2 — Profesyonel Word/DOCX · SAF BELGE KURUCUSU
 * =====================================================
 *
 * Girdi: DONMUŞ HdReportSnapshot (DB'den okunmuş). Çıktı: docx Document / Buffer.
 * DB / auth / ağ YOK (fixture ile test edilebilir; §49). Görsel getirme AYRI adapter'ın
 * işidir — bu kurucu yalnız hazır bir Buffer alır (opsiyonel).
 *
 * Mevcut lib/docx/reportHelpers toolkit'i REUSE edilir (ikinci Word toolkit YOK; §7).
 * Canonical prose → semantic bloklar için Premium Reader'ın SAF parser'ı
 * (parseReaderBlocks + promotePlainHeadings) REUSE edilir; React renderer DEĞİL (§8/§29).
 *
 * Bölüm sırası: Kapak → Danışan/Harita → Temel Kimlik → Tanımlı Kanallar →
 * Aktif/Bağımsız Kapılar → Asılı Kapı Bağlamları → Kapanış. (İçindekiler kullanıcı
 * kararıyla kaldırıldı; Word HeadingLevel yapısı korunur.)
 */

import { Document, Packer, Paragraph, TextRun } from "docx";
import {
  buildFooter,
  buildHeader,
  buildPremiumCover,
  bodyText,
  divider,
  embedImageParagraph,
  getImgDimensions,
  h1,
  h2,
  h3,
  muted,
  sanitizeXmlText,
  spacer,
  twoColTable,
  REPORT_FONT,
  C_DARK,
  C_MID,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import {
  parseReaderBlocks,
  promotePlainHeadings,
  type ReaderBlock,
} from "@/components/common/reader/formatReaderText";
import {
  AUTHORITY_FIELD_ORDER,
  CHANNEL_FIELD_ORDER,
  composeFields,
  GATE_FIELD_ORDER,
  type ContentFieldKey,
} from "./reportCompose";
import type {
  FrozenCanonicalContent,
  FrozenIdentitySection,
  HdReportSnapshot,
} from "./reportSnapshot";

const REPORT_NAME = "Human Design Raporu · Yaşam Sistemi";
const HEADER_TEXT = "Human Design · Yaşam Sistemi";

// ── Prose (inline canonical metin) → docx paragrafları ──────────────────────────
// Field ETİKETİ zaten H3'tür; prose İÇİNDEKİ ##/### başlıklar H3'ün ALTINDA kalmalı →
// Word heading STİLİ DEĞİL, koyu (bold) paragraf olarak render edilir (TOC/nav kirlenmez,
// hiyerarşi ters dönmez, RAW ## GÖRÜNMEZ). Listeler gerçek madde-imi; paragraflar bodyText.
function inProseHeading(text: string, level: number): Paragraph {
  const size = level <= 2 ? 24 : 22;
  return new Paragraph({
    children: [new TextRun({ text: sanitizeXmlText(text), bold: true, size, font: REPORT_FONT, color: C_DARK })],
    spacing: { before: 200, after: 100 },
    keepNext: true,
    widowControl: true,
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text: sanitizeXmlText(text), size: 22, font: REPORT_FONT, color: C_MID })],
    spacing: { after: 60 },
    widowControl: true,
  });
}

/** Canonical prose değeri → docx blokları (SAF parser reuse; RAW markdown YOK). */
function renderProse(value: string): Paragraph[] {
  const blocks: ReaderBlock[] = promotePlainHeadings(parseReaderBlocks(sanitizeXmlText(value)));
  const out: Paragraph[] = [];
  for (const b of blocks) {
    if (b.type === "heading") {
      out.push(inProseHeading(b.text, b.level));
    } else if (b.type === "list") {
      for (const item of b.items) out.push(bulletParagraph(item));
    } else {
      for (const line of b.lines) out.push(bodyText(sanitizeXmlText(line)));
    }
  }
  return out;
}

/** Bir canonical içerik → (per-kind sıra) H3 alan başlığı + prose. */
function renderContentFields(
  content: FrozenCanonicalContent,
  order: readonly (keyof FrozenCanonicalContent)[],
): ReportChild[] {
  const out: ReportChild[] = [];
  for (const f of composeFields(content, order)) {
    out.push(h3(f.label, { keepNext: true }));
    out.push(...renderProse(f.value));
  }
  return out;
}

// ── Kimlik (Tip / Otorite) ──────────────────────────────────────────────────────
function renderIdentity(
  section: FrozenIdentitySection | null,
  kindLabel: "Tip" | "Otorite",
  order: readonly (keyof FrozenCanonicalContent)[],
  emptyText: string,
): ReportChild[] {
  if (!section) {
    // Chart'ta değer yok → sade empty-state (canonical-unpublished mesajı DEĞİL; §24/§57).
    return [h2(kindLabel, { keepNext: true }), bodyText(emptyText)];
  }
  return [
    h2(`${kindLabel} — ${section.displayName}`, { keepNext: true }),
    ...renderContentFields(section.content, order),
  ];
}

// ── Tip özel sunumu (editoryal tekrar konsolidasyonu) ────────────────────────────
// Genel Açıklama + Kaynaklandırılmış Ana Metin TAM prose; Strateji / İmza /
// Kendinden-Olmayan Tema ise AYRI üç uzun bölüm yerine tek "Temel Göstergeler"
// başlığı altında etiketli toplanır. Canonical metin TAM korunur (kısaltma/AI/silme
// YOK) — yalnız SUNUM konsolide edilir → aynı konunun "ikinci kez uzun bölüm" hissi
// kalkar. (5-Tip audit: strategy/signature/not_self, general_description+report_text
// içinde BİREBİR bulunmuyor → benzersiz prose; §8 gereği KORUNUR, omit EDİLMEZ.)
const TYPE_MAIN_ORDER: readonly ContentFieldKey[] = ["general_description", "report_text"];
const TYPE_INDICATOR_ORDER: readonly ContentFieldKey[] = ["strategy_text", "signature_text", "not_self_text"];

function renderTypeIdentity(section: FrozenIdentitySection | null): ReportChild[] {
  if (!section) {
    // Chart'ta tip yok → sade empty-state (canonical-unpublished mesajı DEĞİL; §24/§57).
    return [h2("Tip", { keepNext: true }), bodyText("Bu haritada tip bilgisi bulunmuyor.")];
  }
  const out: ReportChild[] = [
    h2(`Tip — ${section.displayName}`, { keepNext: true }),
    ...renderContentFields(section.content, TYPE_MAIN_ORDER),
  ];
  const indicators = composeFields(section.content, TYPE_INDICATOR_ORDER);
  if (indicators.length > 0) {
    out.push(h3("Temel Göstergeler", { keepNext: true }));
    for (const f of indicators) {
      out.push(inProseHeading(f.label, 3)); // koyu etiket (Word heading STİLİ değil → nav/TOC kirlenmez)
      out.push(...renderProse(f.value));
    }
  }
  return out;
}

// ── Ana belge çocukları ─────────────────────────────────────────────────────────
export type WordReportOptions = {
  /** Ownership-safe, önceden doğrulanmış BodyGraph görseli (JPG/PNG buffer). */
  chartImage?: Buffer | null;
};

export function buildHdReportChildren(
  snapshot: HdReportSnapshot,
  opts: WordReportOptions = {},
): ReportChild[] {
  const children: ReportChild[] = [];
  const clientName = (snapshot.client.name || "Danışan").trim();
  const genDate = formatTrDate(snapshot.generatedAt);

  // 1) KAPAK
  children.push(
    ...buildPremiumCover({
      title1: "YAŞAM SİSTEMİ",
      title2: "Human Design",
      subtitle: "Profesyonel Rapor",
      date: genDate,
      stats: [{ label: "Danışan", value: clientName }],
    }),
  );

  // 2) DANIŞAN / HARİTA BİLGİLERİ (teknik UUID YOK). İÇİNDEKİLER kullanıcı kararıyla
  //    tamamen kaldırıldı; kapaktan sonra doğrudan bu bölüm gelir (Word heading yapısı korunur).
  children.push(h1("Danışan ve Harita Bilgileri", true));
  const infoRows: [string, string][] = [["Danışan", clientName]];
  if (snapshot.client.birthDate) infoRows.push(["Doğum Tarihi", formatTrDate(snapshot.client.birthDate)]);
  if (snapshot.client.birthTime) infoRows.push(["Doğum Saati", String(snapshot.client.birthTime)]);
  if (snapshot.client.birthPlace) infoRows.push(["Doğum Yeri", String(snapshot.client.birthPlace)]);
  infoRows.push(["Harita Kaynağı", snapshot.chart.source === "computed" ? "Hesaplanmış" : "Manuel"]);
  infoRows.push(["Rapor Tarihi", genDate]);
  children.push(twoColTable(infoRows));

  // Opsiyonel, ownership-safe BodyGraph görseli (varsa; yoksa rapor görselsiz devam eder).
  // Büyütülmüş sunum: en fazla 540px genişlik (A4 basılabilir alan içi), 660px yükseklik
  // sınırı → portre görsellerde aspect-ratio korunur, sayfa taşmaz, bilgi tablosuyla aynı
  // sayfada dengeli kalır (natural boyuttan asla büyütülmez).
  if (opts.chartImage && getImgDimensions(opts.chartImage)) {
    children.push(spacer());
    children.push(embedImageParagraph(opts.chartImage, 540, 660));
    children.push(muted("Danışanın Human Design BodyGraph görseli."));
  }

  // 3) TEMEL HUMAN DESIGN KİMLİĞİ
  children.push(h1("Temel Human Design Kimliği", true));
  children.push(...renderTypeIdentity(snapshot.identity.type));
  children.push(...renderIdentity(snapshot.identity.authority, "Otorite", AUTHORITY_FIELD_ORDER, "Bu haritada otorite bilgisi bulunmuyor."));

  // 4) TANIMLI KANALLAR
  children.push(h1("Tanımlı Kanallar", true));
  if (snapshot.channels.length === 0) {
    children.push(bodyText("Bu haritada tamamlanmış kanal bulunmuyor."));
  } else {
    for (const c of snapshot.channels) {
      children.push(h2(`Kanal ${c.displayName}`, { keepNext: true }));
      children.push(muted(`Kapılar ${c.gates[0]} · ${c.gates[1]}`));
      children.push(...renderContentFields(c.content, CHANNEL_FIELD_ORDER));
    }
  }

  // 5) AKTİF / BAĞIMSIZ KAPILAR
  children.push(h1("Aktif / Bağımsız Kapılar", true));
  if (snapshot.gates.length === 0) {
    children.push(bodyText("Bu haritada bağımsız kapı bulunmuyor."));
  } else {
    for (const g of snapshot.gates) {
      children.push(h2(g.displayName, { keepNext: true }));
      children.push(...renderContentFields(g.content, GATE_FIELD_ORDER));
    }
  }

  // 6) ASILI KAPI BAĞLAMLARI (kanal içeriğinden; potansiyel kanal başına ayrı)
  children.push(h1("Asılı Kapı Bağlamları", true));
  if (snapshot.hangingContexts.length === 0) {
    children.push(bodyText("Bu haritada asılı kapı bağlamı bulunmuyor."));
  } else {
    for (const hg of snapshot.hangingContexts) {
      children.push(h2(hg.displayName, { keepNext: true }));
      for (const p of hg.potentials) {
        children.push(h3(`Asılı Kapı Bağlamı — Kanal ${p.displayName}`, { keepNext: true }));
        children.push(...renderProse(p.hangingContext));
      }
    }
  }

  // 7) SADE KURUMSAL KAPANIŞ (AI sentezi YOK; §22)
  children.push(divider());
  children.push(
    muted(
      "Bu rapor, Yaşam Sistemi Human Design bilgi bankasının yayınlanmış canonical içeriğinden, " +
        `oluşturulduğu anda (${genDate}) dondurularak hazırlanmıştır. İçerik bu rapora özgüdür ve sabittir.`,
    ),
  );

  return children;
}

/** Snapshot → docx Document (SAF; DB/auth yok). */
export function buildHdReportDocument(snapshot: HdReportSnapshot, opts: WordReportOptions = {}): Document {
  return new Document({
    creator: "Yaşam Sistemi",
    title: hdReportTitle(snapshot.client.name),
    sections: [
      {
        properties: {},
        headers: { default: buildHeader(HEADER_TEXT) },
        footers: { default: buildFooter(REPORT_NAME) },
        children: buildHdReportChildren(snapshot, opts),
      },
    ],
  });
}

/** Snapshot → DOCX buffer (in-memory Packer; §45). */
export async function renderHdReportBuffer(snapshot: HdReportSnapshot, opts: WordReportOptions = {}): Promise<Buffer> {
  const doc = buildHdReportDocument(snapshot, opts);
  return Packer.toBuffer(doc);
}

// ── Başlık / dosya adı (güvenli; §41) ────────────────────────────────────────────
const TR_MAP: Record<string, string> = {
  ğ: "g", Ğ: "G", ü: "u", Ü: "U", ş: "s", Ş: "S",
  ı: "i", İ: "I", ö: "o", Ö: "O", ç: "c", Ç: "C",
};

export function hdReportTitle(clientName: string | null | undefined): string {
  const name = (clientName ?? "").trim();
  return name ? `Human Design Raporu — ${name}` : "Human Design Raporu";
}

/**
 * Güvenli dosya adı: TR transliterasyon → yalnız [A-Za-z0-9-], çoklu tire sadeleştirme,
 * uzunluk sınırı. Path traversal / CRLF / tırnak / kontrol karakteri KALMAZ (§41).
 */
export function hdReportFilename(clientName: string | null | undefined, dateSlug: string): string {
  const raw = (clientName ?? "").trim();
  const ascii = raw
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("");
  let slug = ascii
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!slug) slug = "Danisan";
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateSlug) ? dateSlug : "0000-00-00";
  return `Human-Design-${slug}-${safeDate}.docx`;
}

// ── Tarih biçimleyici (tr-TR; ISO veya YYYY-MM-DD kabul) ──────────────────────────
function formatTrDate(value: string): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return value;
  }
}
