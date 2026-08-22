/**
 * HD canonical içerik alan metadata'sı — TEK MERKEZ.
 *
 * `key` alanları DB/API sözleşmesidir ve DEĞİŞMEZ. Yalnız kullanıcıya görünen `label`
 * (ve ikincil `helper`) etiketleri burada yönetilir. `long` = normalde uzun metin
 * (preview → büyük okuyucu adayı). Ortak alanlar (general_description, report_text)
 * tüm türlerde vardır; tür-özel alanlar migration CHECK'i (type_fields_exclusive) ile
 * hizalıdır. Tahmini yeni DB alanı ÜRETİLMEZ.
 */

import type { HdCanonicalContentRow, HdEntityKind } from "./centralContentTypes";

export type HdFieldMeta = {
  key: keyof HdCanonicalContentRow;
  label: string;
  helper?: string;
  /** Normalde uzun metin → preview + "Tam metni oku →" büyük okuyucu. */
  long: boolean;
};

/** Ortak alanlar (her türde). */
const COMMON: HdFieldMeta[] = [
  { key: "general_description", label: "Genel Açıklama", long: false },
  {
    key: "report_text",
    label: "Kaynaklandırılmış Ana Metin",
    helper: "Özet değildir; her önemli ifade Kaynak Bağlantıları'na izlenebilir olmalıdır.",
    long: true,
  },
];

/** Tür-özel alanlar (schema'daki gerçek typed alanlar). */
const TYPED: Record<HdEntityKind, HdFieldMeta[]> = {
  tip: [
    { key: "strategy_text", label: "Strateji", long: true },
    { key: "signature_text", label: "Doğru İşleyiş Teması", helper: "Signature", long: false },
    { key: "not_self_text", label: "Yanlış-Benlik Teması", helper: "Not-Self Theme", long: false },
  ],
  otorite: [
    { key: "decision_mechanism", label: "Karar Mekanizması", long: true },
    { key: "application_text", label: "Uygulama", long: true },
    { key: "caution_notes", label: "Dikkat Notları", long: false },
  ],
  kapi: [{ key: "general_theme", label: "Genel Tema", long: false }],
  kanal: [
    { key: "full_channel_text", label: "Tam Kanal Metni", long: true },
    { key: "hanging_gate_context", label: "Tek Uçlu (Hanging Gate) Bağlam", long: true },
  ],
};

/** Bir tür için sıralı canonical alan listesi (ortak + tür-özel). */
export function hdFieldsFor(kind: HdEntityKind): HdFieldMeta[] {
  return [...COMMON, ...TYPED[kind]];
}

/** Tür-özel (typed) alanların key listesi — payload derlemek için. */
export function hdTypedFieldKeys(kind: HdEntityKind): (keyof HdCanonicalContentRow)[] {
  return TYPED[kind].map((f) => f.key);
}

/** Kullanıcı-görünür entity türü rozeti. */
export const HD_KIND_BADGE: Record<HdEntityKind, string> = {
  tip: "TİP",
  otorite: "OTORİTE",
  kapi: "KAPI",
  kanal: "KANAL",
};

/** Bir alanın büyük okuyucuya uygun olup olmadığı: meta.long VEYA içerik gerçekten uzunsa. */
export function isReaderEligible(meta: HdFieldMeta, value: string): boolean {
  if (meta.long) return true;
  return value.trim().length > 320 || value.includes("\n\n");
}
