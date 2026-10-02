/**
 * KVKK danışan onam kaydı — saf sözleşme (FAZ1 FINAL HARDENING — INFRA).
 *
 * DB: public.client_consents (append-only) + client_consent_current view
 *     (supabase/migrations/20270129000900_client_consents.sql). Sabit listeler
 *     migration'daki CHECK kısıtlarıyla BİREBİR aynıdır.
 * API: app/api/clients/[id]/consents (GET/POST). UI: components/kvkk/ClientConsentPanel.tsx.
 * Client + server import edilebilir (DOM/Node API'si YOK).
 */

export const CONSENT_TYPES = [
  "aydinlatma_bildirildi",
  "acik_riza_ozel_nitelikli",
  "acik_riza_yurtdisi_aktarim",
  "iletisim_izni",
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_STATUSES = ["granted", "refused", "withdrawn", "pending"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const CONSENT_METHODS = ["islak_imza", "uygulama_onay", "sozlu_kayit", "diger"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

/**
 * Uzmanın kullandığı örnek aydınlatma/onam metninin sürümü (/kvkk-aydinlatma).
 * Yalnız yeni kayıtlara yazılır; önceki kayıtlar kendi text_version değerini korur.
 */
export const CONSENT_TEXT_VERSION = "kvkk-2026-10";

export const CONSENT_NOTE_MAX = 1000;
export const CONSENT_SOURCE_MAX = 64;
export const CONSENT_TEXT_VERSION_MAX = 64;

export const CONSENT_TYPE_LABELS: Record<ConsentType, { label: string; help: string }> = {
  aydinlatma_bildirildi: {
    label: "Aydınlatma metni bildirildi",
    help: "Danışana kişisel verilerinin nasıl işlendiği anlatıldı (KVKK m.10).",
  },
  acik_riza_ozel_nitelikli: {
    label: "Özel nitelikli veri için açık rıza",
    help: "Sağlık vb. özel nitelikli kişisel verilerin işlenmesine açık rıza (KVKK m.6).",
  },
  acik_riza_yurtdisi_aktarim: {
    label: "Yurt dışına aktarım için açık rıza",
    help: "Verilerin yurt dışındaki altyapı sağlayıcılarında işlenmesine ilişkin rıza (KVKK m.9).",
  },
  iletisim_izni: {
    label: "İletişim izni",
    help: "Randevu hatırlatma vb. amaçlarla danışanla iletişime geçme izni.",
  },
};

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  granted: "Verildi",
  refused: "Reddedildi",
  withdrawn: "Geri çekildi",
  pending: "Bekliyor",
};

export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = {
  islak_imza: "Islak imza (kâğıt form)",
  uygulama_onay: "Uygulama içi onay",
  sozlu_kayit: "Sözlü (kayıt altına alındı)",
  diger: "Diğer",
};

export type ConsentRecord = {
  id: string;
  consent_type: ConsentType;
  status: ConsentStatus;
  text_version: string;
  method: ConsentMethod;
  source: string | null;
  note: string | null;
  recorded_by_user_id: string;
  recorded_at: string;
};

export type ConsentInsert = {
  consent_type: ConsentType;
  status: ConsentStatus;
  method: ConsentMethod;
  text_version: string;
  source: string | null;
  note: string | null;
};

export type ConsentValidation =
  | { ok: true; value: ConsentInsert }
  | { ok: false; error: string; field: string };

const TEXT_VERSION_RE = /^[A-Za-z0-9._-]{1,64}$/;
const SOURCE_RE = /^[a-z0-9_-]{1,64}$/;

function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/**
 * POST gövdesi doğrulama. tenant_id / client_id / recorded_by_user_id / recorded_at
 * gövdeden ASLA okunmaz (sunucu belirler) — gövdede olsalar da yok sayılır.
 */
export function validateConsentInput(body: unknown): ConsentValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Geçersiz istek gövdesi.", field: "body" };
  }
  const b = body as Record<string, unknown>;
  if (!isOneOf(CONSENT_TYPES, b.consent_type)) {
    return { ok: false, error: "Onam türü geçersiz.", field: "consent_type" };
  }
  if (!isOneOf(CONSENT_STATUSES, b.status)) {
    return { ok: false, error: "Onam durumu geçersiz.", field: "status" };
  }
  if (!isOneOf(CONSENT_METHODS, b.method)) {
    return { ok: false, error: "Onam alma yöntemi geçersiz.", field: "method" };
  }
  let textVersion = CONSENT_TEXT_VERSION;
  if (b.text_version != null && b.text_version !== "") {
    if (typeof b.text_version !== "string" || !TEXT_VERSION_RE.test(b.text_version.trim())) {
      return { ok: false, error: "Metin sürümü geçersiz.", field: "text_version" };
    }
    textVersion = b.text_version.trim();
  }
  let source: string | null = null;
  if (b.source != null && b.source !== "") {
    if (typeof b.source !== "string" || !SOURCE_RE.test(b.source.trim())) {
      return { ok: false, error: "Kaynak alanı geçersiz.", field: "source" };
    }
    source = b.source.trim();
  }
  let note: string | null = null;
  if (b.note != null && b.note !== "") {
    if (typeof b.note !== "string") return { ok: false, error: "Not metin olmalıdır.", field: "note" };
    const trimmed = b.note.trim();
    if (trimmed.length > CONSENT_NOTE_MAX) {
      return { ok: false, error: `Not en fazla ${CONSENT_NOTE_MAX} karakter olabilir.`, field: "note" };
    }
    note = trimmed || null;
  }
  return {
    ok: true,
    value: {
      consent_type: b.consent_type,
      status: b.status,
      method: b.method,
      text_version: textVersion,
      source,
      note,
    },
  };
}

/**
 * Geçmişten güncel durumu türetir (client_consent_current view'ıyla aynı anlam:
 * tür başına recorded_at DESC, eşitlikte id DESC).
 */
export function deriveCurrentConsents<T extends Pick<ConsentRecord, "id" | "consent_type" | "recorded_at">>(
  history: ReadonlyArray<T>,
): Partial<Record<ConsentType, T>> {
  const current: Partial<Record<ConsentType, T>> = {};
  for (const row of history) {
    const prev = current[row.consent_type];
    if (!prev) {
      current[row.consent_type] = row;
      continue;
    }
    const a = Date.parse(row.recorded_at);
    const b = Date.parse(prev.recorded_at);
    if (a > b || (a === b && row.id > prev.id)) current[row.consent_type] = row;
  }
  return current;
}

export type ConsentSummary = {
  /** Aydınlatma bildirildi mi (en son kayıt granted)? */
  informed: boolean;
  /** Özel nitelikli veri açık rızası geçerli mi (en son kayıt granted)? */
  explicitConsent: boolean;
  /** Hiç kayıt yok. */
  empty: boolean;
  /** Kısa rozet metni. */
  badge: string;
  tone: "ok" | "warn" | "none";
};

/** Danışan başlığındaki rozet için özet. */
export function summarizeConsents(
  current: Partial<Record<ConsentType, Pick<ConsentRecord, "status">>>,
): ConsentSummary {
  const informed = current.aydinlatma_bildirildi?.status === "granted";
  const explicitConsent = current.acik_riza_ozel_nitelikli?.status === "granted";
  const empty = Object.keys(current).length === 0;
  if (empty) return { informed, explicitConsent, empty, badge: "KVKK kaydı yok", tone: "none" };
  if (informed && explicitConsent) {
    return { informed, explicitConsent, empty, badge: "KVKK: aydınlatma + açık rıza kayıtlı", tone: "ok" };
  }
  const missing: string[] = [];
  if (!informed) missing.push("aydınlatma");
  if (!explicitConsent) missing.push("açık rıza");
  return { informed, explicitConsent, empty, badge: `KVKK eksik: ${missing.join(", ")}`, tone: "warn" };
}
