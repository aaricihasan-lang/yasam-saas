/**
 * NKB-V2-B — Ana Kulvar + Yan Kulvar ortak yapılandırılmış içerik sözleşmesi.
 *
 * KAPSAM: yalnız `ana-kulvar` ve `yan-kulvar`. Başka analysis_type (element, cakra-omurga,
 * ifade-sayisi, hayat-yolu, diger, …) için bu sözleşme UYGULANMAZ; onlar mevcut düz
 * `description` davranışını korur.
 *
 * Saf/deterministik: DB, ağ veya yan etki YOKTUR. Legacy fallback yalnız salt-okuma
 * sırasında sentez üretir; hiçbir şeyi veritabanına geri yazmaz.
 */

// İzinli dört bölüm anahtarı — sıra template'te sabittir.
export const KULVAR_SECTION_KEYS = ["overview", "constructive", "negative", "destructive"] as const;

export type KulvarSectionKey = (typeof KULVAR_SECTION_KEYS)[number];

export type KnowledgeSection = {
  key: KulvarSectionKey;
  label: string;
  body: string;
  order: number;
};

// Bu sözleşmeyi kullanan analysis_type'lar (yalnız iki tür).
export const KULVAR_ANALYSIS_TYPES = ["ana-kulvar", "yan-kulvar"] as const;

export type KulvarAnalysisType = (typeof KULVAR_ANALYSIS_TYPES)[number];

/** analysis_type yalnız ana-kulvar veya yan-kulvar ise true. */
export function isKulvarAnalysisType(analysisType: string): analysisType is KulvarAnalysisType {
  return (KULVAR_ANALYSIS_TYPES as readonly string[]).includes(analysisType);
}

// Ortak şablon: sıra ve etiketler (Ana Kulvar ve Yan Kulvar aynı).
export const KULVAR_SECTION_TEMPLATE: ReadonlyArray<{ key: KulvarSectionKey; label: string; order: number }> = [
  { key: "overview", label: "Genel Açıklama", order: 1 },
  { key: "constructive", label: "Yapıcı Potansiyeller", order: 2 },
  { key: "negative", label: "Olumsuz Potansiyeller", order: 3 },
  { key: "destructive", label: "Yıkıcı Potansiyeller", order: 4 },
] as const;

// Legacy fallback için kullanılan tek bölüm anahtarı/etiketi.
const OVERVIEW_KEY: KulvarSectionKey = "overview";
const OVERVIEW_LABEL = "Genel Açıklama";

const ALLOWED_KEY_SET: ReadonlySet<string> = new Set(KULVAR_SECTION_KEYS);
const ALLOWED_FIELD_SET: ReadonlySet<string> = new Set(["key", "label", "body", "order"]);

export type SectionValidationOk = { ok: true; sections: KnowledgeSection[] };
export type SectionValidationErr = { ok: false; error: string };
export type SectionValidationResult = SectionValidationOk | SectionValidationErr;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSafeOrder(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 999;
}

/**
 * content_sections girdisini Ana/Yan Kulvar sözleşmesine göre doğrular.
 *
 * Kurallar:
 *  - Girdi bir array olmalı ve en az bir bölüm içermeli.
 *  - Her bölüm yalnız {key,label,body,order} alanlarını taşımalı — bilinmeyen alan reddedilir.
 *  - key yalnız izinli dört anahtardan biri olmalı; tekrar eden key reddedilir.
 *  - body string olmalı.
 *  - order güvenli tamsayı (1..999) olmalı; tekrar eden order reddedilir.
 *  - label boş olmayan string olmalı.
 *
 * NOT: Kısmi doldurma serbesttir (1..4 bölüm). Doğrulama başarısızsa çağıran taraf
 * kaydı content_sections=null bırakmalı (legacy fallback devreye girer).
 */
export function validateKulvarSections(input: unknown): SectionValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "content_sections bir dizi (array) olmalı." };
  }
  if (input.length === 0) {
    return { ok: false, error: "content_sections boş dizi olamaz (kaydı null bırakın)." };
  }
  if (input.length > KULVAR_SECTION_KEYS.length) {
    return { ok: false, error: `En fazla ${KULVAR_SECTION_KEYS.length} bölüm olabilir.` };
  }

  const seenKeys = new Set<string>();
  const seenOrders = new Set<number>();
  const out: KnowledgeSection[] = [];

  for (let i = 0; i < input.length; i++) {
    const item = input[i];
    if (!isPlainObject(item)) {
      return { ok: false, error: `Bölüm #${i + 1} bir nesne olmalı.` };
    }

    // Bilinmeyen alanları reddet.
    for (const field of Object.keys(item)) {
      if (!ALLOWED_FIELD_SET.has(field)) {
        return { ok: false, error: `Bölüm #${i + 1}: bilinmeyen alan "${field}".` };
      }
    }

    const { key, label, body, order } = item as {
      key: unknown;
      label: unknown;
      body: unknown;
      order: unknown;
    };

    if (typeof key !== "string" || !ALLOWED_KEY_SET.has(key)) {
      return { ok: false, error: `Bölüm #${i + 1}: geçersiz key "${String(key)}".` };
    }
    if (seenKeys.has(key)) {
      return { ok: false, error: `Bölüm #${i + 1}: tekrar eden key "${key}".` };
    }
    if (typeof label !== "string" || label.trim() === "") {
      return { ok: false, error: `Bölüm #${i + 1} ("${key}"): label boş olmayan string olmalı.` };
    }
    if (typeof body !== "string") {
      return { ok: false, error: `Bölüm #${i + 1} ("${key}"): body string olmalı.` };
    }
    if (!isSafeOrder(order)) {
      return { ok: false, error: `Bölüm #${i + 1} ("${key}"): order 1..999 arası tamsayı olmalı.` };
    }
    if (seenOrders.has(order)) {
      return { ok: false, error: `Bölüm #${i + 1} ("${key}"): tekrar eden order ${order}.` };
    }

    seenKeys.add(key);
    seenOrders.add(order);
    out.push({ key: key as KulvarSectionKey, label, body, order });
  }

  return { ok: true, sections: out };
}

/**
 * Legacy fallback: content_sections yok/null iken eski `description` metnini tek bir
 * "Genel Açıklama" (overview) bölümü olarak SALT-OKUMA sırasında sentezler.
 * Veritabanına hiçbir şey yazmaz. description boş/null ise boş gövdeli overview üretir.
 */
export function sectionsFromLegacyDescription(description: string | null | undefined): KnowledgeSection[] {
  return [
    {
      key: OVERVIEW_KEY,
      label: OVERVIEW_LABEL,
      body: (description ?? "").toString(),
      order: 1,
    },
  ];
}

/**
 * Salt-okuma çözümleyici (Ana/Yan Kulvar):
 *  - Geçerli content_sections varsa order'a göre sıralı döndürür.
 *  - Yoksa/geçersizse legacy description fallback'i üretir.
 * Saf fonksiyon; DB'ye yazmaz.
 */
export function resolveKulvarSectionsForRead(record: {
  content_sections?: unknown;
  description?: string | null;
}): KnowledgeSection[] {
  const validated = validateKulvarSections(record.content_sections);
  if (validated.ok) {
    return [...validated.sections].sort((a, b) => a.order - b.order);
  }
  return sectionsFromLegacyDescription(record.description ?? null);
}
