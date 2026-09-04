/**
 * NKB-V4 — Kişi/analiz Word raporu (/api/numeroloji/word-report) SEKME seçimi (saf; client+server).
 *
 * Word bölümleri = ekrandaki gerçek sonuç sekmeleriyle BİREBİR (ad/sıra aynı). YALNIZ 4 seçenek:
 *   summary  : "Sonuç Özeti"            ← profil kartları + PIN piramidi + ana yorumlar
 *   plain    : "Analiz (Hesap Özetsiz)" ← temel değerler + PIN piramidi + çakra omurgası + element + zaman çizelgeleri
 *   detailed : "Analiz (Hesap Özetli)"  ← (özetsiz seçiliyse tekrar etmez) + Bilgi Bankası yorum kartları + kaynak notları
 *   tas      : "Taş Açıklamaları"        ← taş atama kartları (kişinin değerlerine eşleşen)
 *
 * Görsel Rapor, İlişki ve Ev/İş Word'den KALDIRILDI (ayrı PNG indirme ekranda korunur).
 * Kurallar: en az bir sekme seçilmeli; `sections` gönderilmezse eski istemci uyumu için TÜMÜ açık.
 * Kimlik bilgileri (ad/doğum/analiz tarihi) BAĞIMSIZ seçim DEĞİL — kapak/üstbilgidir.
 */

import {
  EXPERT_OWN_NOTE_LABEL,
  sortSourceEntries,
  type SourceEntryRow,
} from "./sourceEntryUiLogic";

export type WordTabKey = "summary" | "plain" | "detailed" | "zamanlama" | "tas";

export type WordPersonSections = Record<WordTabKey, boolean>;

export const WORD_TAB_ORDER: WordTabKey[] = ["summary", "plain", "detailed", "zamanlama", "tas"];

/** Ekrandaki sekme adlarıyla BİREBİR (değiştirilmez). Görsel Rapor Word'den kaldırıldı. */
export const WORD_TAB_LABELS: Record<WordTabKey, string> = {
  summary: "Sonuç Özeti",
  plain: "Analiz (Hesap Özetsiz)",
  detailed: "Analiz (Hesap Özetli)",
  zamanlama: "Zamanlama & Gelişim",
  tas: "Taş Açıklamaları",
};

/** Dosya adı için güvenli sekme kısaltması. */
export const WORD_TAB_FILENAME: Record<WordTabKey, string> = {
  summary: "Sonuc_Ozeti",
  plain: "Hesap_Ozetsiz",
  detailed: "Hesap_Ozetli",
  zamanlama: "Zamanlama_Gelisim",
  tas: "Tas_Aciklamalari",
};

/**
 * Varsayılan seçim. FAZ 6: "zamanlama" VARSAYILAN OLARAK KAPALI — çünkü referans tarih
 * gerektirir; sections göndermeyen eski istemcilerin 400 almasını önler (geriye uyum).
 */
export function defaultWordPersonSections(): WordPersonSections {
  return { summary: true, plain: true, detailed: true, zamanlama: false, tas: true };
}

export function atLeastOneWordPersonSection(s: WordPersonSections): boolean {
  return WORD_TAB_ORDER.some((k) => s[k]);
}

export function normalizeWordPersonSections(input: unknown): WordPersonSections {
  if (input === undefined || input === null || typeof input !== "object") {
    return defaultWordPersonSections();
  }
  const o = input as Record<string, unknown>;
  const out: WordPersonSections = { summary: false, plain: false, detailed: false, zamanlama: false, tas: false };
  for (const k of WORD_TAB_ORDER) out[k] = o[k] === true;
  if (!atLeastOneWordPersonSection(out)) return defaultWordPersonSections();
  return out;
}

// ── Kaynak notu gruplama (Hesap Özetli sekmesi) ──────────────────────────────

export type MatchedNoteRef = { id: string; analysisType: string; value: string };

export type PersonSourceNoteGroup = {
  ref: MatchedNoteRef;
  notes: { label: string; body: string }[];
};

/**
 * Kişinin eşleşen kanonik kayıtlarına bağlı include_in_analysis kaynak notlarını gruplar.
 * Deterministik sıra (display_order, created_at, id). Etiket: source_id NULL → "Uzmanın Kendi Notu".
 * entries YALNIZ include_in_analysis=true olmalıdır (server-side filtrelenir).
 */
export function personSourceNotesForRecords(
  matched: MatchedNoteRef[],
  entries: SourceEntryRow[],
  sourceLabelById: Map<string, string>,
): PersonSourceNoteGroup[] {
  const byRecord = new Map<string, SourceEntryRow[]>();
  for (const e of sortSourceEntries(entries)) {
    if (!e.include_in_analysis) continue;
    const arr = byRecord.get(e.knowledge_record_id) ?? [];
    arr.push(e);
    byRecord.set(e.knowledge_record_id, arr);
  }
  const out: PersonSourceNoteGroup[] = [];
  const seen = new Set<string>();
  for (const ref of matched) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    const es = byRecord.get(ref.id);
    if (!es || es.length === 0) continue;
    out.push({
      ref,
      notes: es.map((e) => ({
        label: e.source_id === null ? EXPERT_OWN_NOTE_LABEL : sourceLabelById.get(e.source_id) ?? "Bilinmeyen Kaynak",
        body: e.body,
      })),
    });
  }
  return out;
}

/** Güvenli dosya adı parçası (Türkçe → ASCII, boşluk → _). */
export function safeFileNamePart(v: string): string {
  return (v || "")
    .replace(/ı/g, "i").replace(/İ/g, "I").replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ü/g, "u").replace(/Ü/g, "U").replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ö/g, "o").replace(/Ö/g, "O").replace(/ç/g, "c").replace(/Ç/g, "C")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "kayit";
}

/**
 * Word dosya adı: tek sekme → Numeroloji_<Ad_Soyad>_<Sekme>.docx;
 * çok sekme → Numeroloji_<Ad_Soyad>_Secili_Bolumler.docx.
 */
export function wordFileName(adSoyad: string, selectedTabs: WordTabKey[]): string {
  const who = safeFileNamePart(adSoyad);
  if (selectedTabs.length === 1) return `Numeroloji_${who}_${WORD_TAB_FILENAME[selectedTabs[0]!]}.docx`;
  return `Numeroloji_${who}_Secili_Bolumler.docx`;
}
