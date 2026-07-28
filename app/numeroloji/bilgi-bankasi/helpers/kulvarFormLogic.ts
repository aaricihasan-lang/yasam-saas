/**
 * NKB-V2-D1 — Ana/Yan Kulvar form mantığı (SAF, test-edilebilir).
 * UI bileşenleri bunu kullanır; DB/ağ YOK. content_sections canonical; legacy description
 * yalnız overview fallback'inde okunur, birleştirme yapılmaz.
 */
import {
  KULVAR_SECTION_TEMPLATE,
  resolveKulvarSectionsForRead,
  type KnowledgeSection,
  type KulvarSectionKey,
} from "./knowledgeSections";

export type KulvarBodies = Record<KulvarSectionKey, string>;

export const EMPTY_KULVAR_BODIES: KulvarBodies = {
  overview: "",
  constructive: "",
  negative: "",
  destructive: "",
};

/** 4 body metninden canonical content_sections (sabit key/label/order) üretir. */
export function sectionsFromBodies(bodies: KulvarBodies): KnowledgeSection[] {
  return KULVAR_SECTION_TEMPLATE.map((t) => ({
    key: t.key,
    label: t.label,
    order: t.order,
    body: bodies[t.key] ?? "",
  }));
}

/**
 * Bir kayıttan form body'lerini üretir (salt-okuma):
 *  - content_sections geçerliyse canonical (description ile BİRLEŞTİRİLMEZ),
 *  - yoksa legacy description yalnız overview'a fallback; diğerleri boş.
 * DB'ye yazmaz.
 */
export function bodiesFromRecord(record: { content_sections?: unknown; description?: string | null }): KulvarBodies {
  const sections = resolveKulvarSectionsForRead(record);
  const out: KulvarBodies = { ...EMPTY_KULVAR_BODIES };
  for (const s of sections) {
    if (s.key in out) out[s.key] = s.body;
  }
  return out;
}

/** Mevcut kayıt varsa bilinçli düzenleme = PATCH; yeni kayıt = create-only POST. */
export function decideSaveMethod(existingId: string | null | undefined): "PATCH" | "POST" {
  return existingId ? "PATCH" : "POST";
}

export type CanonicalSaveOutcome = "success" | "error" | "conflict";

/**
 * Canonical form kaydet sonrası davranış sözleşmesi:
 *  - "success" → form başlangıca döner (edit modu kapanır, eski kayıt durumu temizlenir);
 *  - "error" / "conflict" → form verisi ve edit modu KORUNUR (kullanıcı düzeltip tekrar dener).
 * Yalnız başarıda reset edilir.
 */
export function shouldResetCanonicalFormAfterSave(outcome: CanonicalSaveOutcome): boolean {
  return outcome === "success";
}

/** Görüntüleme için dolu bölümleri (boş olmayan body) sırayla döndürür. */
export function nonEmptySectionsForView(record: {
  content_sections?: unknown;
  description?: string | null;
}): KnowledgeSection[] {
  return resolveKulvarSectionsForRead(record).filter((s) => s.body.trim() !== "");
}
