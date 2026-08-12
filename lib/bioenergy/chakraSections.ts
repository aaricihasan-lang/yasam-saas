/**
 * BİYOENERJİ FAZ 3.1 — Çakra iç bilgi mimarisi (UI-only, saf çekirdek).
 *
 * Mevcut legacy `bioenergy_chakras` kolonlarını PROFESYONEL section modeline
 * MAP eder. Veri dönüşümü YOK, yazma YOK, yeni kolon YOK — yalnız sunum grubu.
 * Boş alan → o section görünmez (placeholder GÖSTERİLMEZ).
 *
 * Kanonik gelecek sözlüğü 8 section'dır; bu turda yalnız legacy veriden
 * doldurulabilen 6'sı üretilir. "Enerji Anatomisi & Denge" ve "Uygulamalar"
 * yeni içerik gelene kadar ASLA üretilmez (future=true).
 */

export type ChakraSectionId =
  | "genel-bakis"
  | "nedenler-blokajlar"
  | "beden-sistem"
  | "duygusal-zihinsel"
  | "taslar-destekleyiciler"
  | "notlar-kaynaklar";

export type ChakraSectionKind = "content" | "stones";

export type ChakraSectionBlock = {
  /** alt başlık (h3) — yoksa yalın metin */
  title: string | null;
  text: string;
};

export type ChakraSection = {
  id: ChakraSectionId;
  /** kararlı URL anchor hash (# olmadan) */
  hash: string;
  title: string;
  kind: ChakraSectionKind;
  /** content section blokları; stones section'da boş (özel render) */
  blocks: ChakraSectionBlock[];
};

/** Legacy kolonlardan okunan girdi (yalnız gereken alanlar). */
export type ChakraSectionInput = {
  color?: string | null;
  causes?: string | null;
  physical?: string | null;
  organs?: string | null;
  glands?: string | null;
  mental?: string | null;
  notes?: string | null;
};

/**
 * Kanonik gelecek section sözlüğü (referans + harness). `future:true` olanlar
 * bu turda UI'da üretilmez.
 */
export const CHAKRA_SECTION_DICTIONARY: {
  id: string;
  title: string;
  future?: boolean;
}[] = [
  { id: "genel-bakis", title: "Genel Bakış" },
  { id: "enerji-anatomisi", title: "Enerji Anatomisi & Denge", future: true },
  { id: "nedenler-blokajlar", title: "Nedenler & Blokajlar" },
  { id: "beden-sistem", title: "Beden & Sistem İlişkileri" },
  { id: "duygusal-zihinsel", title: "Duygusal & Zihinsel İlişkiler" },
  { id: "uygulamalar", title: "Uygulamalar", future: true },
  { id: "taslar-destekleyiciler", title: "Taşlar & Destekleyiciler" },
  { id: "notlar-kaynaklar", title: "Notlar & Kaynaklar" },
];

function t(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * Görünür section modelini kanonik sırayla kurar. `stonesVisible` — manuel
 * `stones` metni var mı (Taşlar & Destekleyiciler section'ı için); Doğaltaş
 * ek-taş bloğu bundan bağımsızdır ve çağıran tarafından ayrıca render edilir
 * (mevcut davranış korunur).
 */
export function buildChakraSections(
  record: ChakraSectionInput,
  opts: { stonesVisible: boolean },
): ChakraSection[] {
  const out: ChakraSection[] = [];

  // 1. Genel Bakış — color (name başlıkta gösterilir)
  const genel: ChakraSectionBlock[] = [];
  if (t(record.color)) genel.push({ title: "Renk", text: t(record.color) });
  if (genel.length) {
    out.push({ id: "genel-bakis", hash: "genel-bakis", title: "Genel Bakış", kind: "content", blocks: genel });
  }

  // 2. Nedenler & Blokajlar — causes
  if (t(record.causes)) {
    out.push({
      id: "nedenler-blokajlar",
      hash: "nedenler-blokajlar",
      title: "Nedenler & Blokajlar",
      kind: "content",
      blocks: [{ title: "Blokajlı Olmasının Nedenleri", text: t(record.causes) }],
    });
  }

  // 3. Beden & Sistem İlişkileri — physical + organs + glands (alt bloklar korunur)
  const beden: ChakraSectionBlock[] = [];
  if (t(record.physical)) beden.push({ title: "Fiziksel Etkiler", text: t(record.physical) });
  if (t(record.organs)) beden.push({ title: "Organlar", text: t(record.organs) });
  if (t(record.glands)) beden.push({ title: "Bezler", text: t(record.glands) });
  if (beden.length) {
    out.push({ id: "beden-sistem", hash: "beden-sistem", title: "Beden & Sistem İlişkileri", kind: "content", blocks: beden });
  }

  // 4. Duygusal & Zihinsel İlişkiler — mental
  if (t(record.mental)) {
    out.push({
      id: "duygusal-zihinsel",
      hash: "duygusal-zihinsel",
      title: "Duygusal & Zihinsel İlişkiler",
      kind: "content",
      blocks: [{ title: "Zihinsel Etkiler", text: t(record.mental) }],
    });
  }

  // 5. Taşlar & Destekleyiciler — manuel stones (özel render: manuel + Doğaltaş)
  if (opts.stonesVisible) {
    out.push({ id: "taslar-destekleyiciler", hash: "taslar-destekleyiciler", title: "Taşlar & Destekleyiciler", kind: "stones", blocks: [] });
  }

  // 6. Notlar & Kaynaklar — notes
  if (t(record.notes)) {
    out.push({
      id: "notlar-kaynaklar",
      hash: "notlar-kaynaklar",
      title: "Notlar & Kaynaklar",
      kind: "content",
      blocks: [{ title: null, text: t(record.notes) }],
    });
  }

  return out;
}
