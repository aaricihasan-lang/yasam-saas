/**
 * TRIAL7 — 7 günlük ücretsiz deneme üyeliği SAF çekirdeği (IO/env/DB YOK; istemci + sunucu ortak).
 *
 * Owner kararları (2026-11-06):
 *   - Deneme yalnız `trial_kind = 'self_7d'` satırlarına uygulanır. Bu kolon mevcut hesapların
 *     HİÇBİRİNDE yoktur (NULL) → Premium / admin / demo / eski deneme / onay bekleyen hesaplar bu
 *     çekirdeğin dışında kalır; tarih alanları (trial_ends_at) onları ASLA kilitlemez.
 *   - Süre ilk başarılı girişte başlar, tam 168 saat sürer; uzatma YOKTUR.
 *   - Süre bitince hesap aktif kalır: yalnız görüntüleme + dışa aktarma (read_only).
 *   - Dijital İçerik ve TÜM alt modülleri (ve allowlist'te olmayan, ileride eklenecek her modül)
 *     deneme uzmanına KAPALIDIR (fail-closed allowlist).
 *
 * DB eşi: supabase/migrations/20280101000000_trial7_self_trial.sql (trial_phase_of,
 * trial_allowed_module_keys) — iki tarafın aynı kalması harness ile doğrulanır.
 */

export const TRIAL_KIND_SELF_7D = "self_7d" as const;
export const TRIAL_DURATION_HOURS = 168;
export const TRIAL_DURATION_MS = TRIAL_DURATION_HOURS * 60 * 60 * 1000;
export const TRIAL_DEFAULT_DAILY_CREDITS = 50;
export const TRIAL_CREDIT_MODULES = ["astrology", "human_design", "numerology"] as const;
export type TrialCreditModule = (typeof TRIAL_CREDIT_MODULES)[number];

export type TrialDbStatus = "not_started" | "active" | "review" | "suspended" | "converted";
export type TrialPhase = "none" | "not_started" | "active" | "expired" | "review" | "suspended" | "converted";
export type MembershipAccessLevel = "full" | "read_only" | "none";

/**
 * Deneme paketinde açılabilecek modül anahtarları (kanonik gate anahtarları + DB'de saklanan TR
 * alias'ları). Owner seçimi: Premium seti + Gökyüzü Atlası. Burada OLMAYAN her anahtar —
 * digital_content, personal_archive/kisisel_arsiv, belge_ceviri(_ai), video_ceviri, ders_notu,
 * yasam_hafizasi, alt yetkiler (hd_system_reading, astrology_provider_interp,
 * numerology_future_years) ve gelecekte eklenecek her modül — deneme uzmanına KAPALIDIR.
 */
export const TRIAL_ALLOWED_MODULE_KEYS: ReadonlySet<string> = new Set([
  "clients",
  "danisan_yonetimi",
  "appointments",
  "ajanda",
  "numerology",
  "numeroloji",
  "stones",
  "dogaltas",
  "stok",
  "stock",
  "sifa_rehberi",
  "healing",
  "energy_body",
  "biyoenerji",
  "reflexology",
  "refleksoloji",
  "aromatherapy",
  "aromaterapi",
  "cosmic_calendar",
  "human_design",
  "cupping",
  "kupa",
  "hacamat_terapi",
  "beslenme",
  "astrology",
]);

/** Kayıtta deneme uzmanına yazılan modül izinleri (kanonik anahtarlar; alt yetkiler KAPALI). */
export const TRIAL_DEFAULT_MODULE_PERMISSIONS: Readonly<Record<string, boolean>> = Object.freeze({
  clients: true,
  appointments: true,
  numerology: true,
  stones: true,
  stok: true,
  sifa_rehberi: true,
  reflexology: true,
  energy_body: true,
  aromatherapy: true,
  cosmic_calendar: true,
  human_design: true,
  cupping: true,
  beslenme: true,
  astrology: true,
  // Açıkça kapalı (Owner: Dijital İçerik ailesi + YH + alt yetkiler denemenin dışında).
  digital_content: false,
  personal_archive: false,
  belge_ceviri: false,
  video_ceviri: false,
  ders_notu: false,
  yasam_hafizasi: false,
  hd_system_reading: false,
  numerology_future_years: false,
  astrology_provider_interp: false,
});

export function isTrialAllowedModuleKey(moduleKey: string): boolean {
  return TRIAL_ALLOWED_MODULE_KEYS.has(moduleKey);
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim().toLowerCase();
}

function parseMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

/** Satır deneme rejiminde mi (trial_kind = self_7d)? Mevcut hesapların hiçbiri değildir. */
export function isSelfTrialRow(row: Record<string, unknown> | null | undefined): boolean {
  return !!row && str(row.trial_kind) === TRIAL_KIND_SELF_7D;
}

/**
 * Deneme modül kısıtı uygulanacak mı? Deneme rejimindeki satır Pro'ya (premium) geçmemişse evet.
 * Pro'ya geçen uzman normal paket kurallarına (admin'in seçtiği modüller) tabidir.
 */
export function isTrialRestrictedRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!isSelfTrialRow(row)) return false;
  return resolveTrialPhase(row) !== "converted";
}

/** DB trial_phase_of ile AYNI kural. */
export function resolveTrialPhase(
  row: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
): TrialPhase {
  if (!isSelfTrialRow(row)) return "none";
  const r = row as Record<string, unknown>;
  const status = str(r.trial_status);
  if (status === "converted" || str(r.package_type) === "premium") return "converted";
  if (status === "review") return "review";
  if (status === "suspended") return "suspended";
  if (status === "not_started") return "not_started";
  if (status === "active") {
    const ends = parseMs(r.trial_ends_at);
    return ends !== null && ends > nowMs ? "active" : "expired";
  }
  return "none";
}

/** Deneme fazının erişim seviyesi (yalnız deneme rejimindeki, Pro'ya geçmemiş satırlar). */
export function trialPhaseAccessLevel(phase: TrialPhase): MembershipAccessLevel {
  switch (phase) {
    case "active":
      return "full";
    case "expired":
    case "suspended":
      return "read_only";
    default:
      // not_started (oturum var ama pencere açılmadı), review, none → erişim yok (fail-closed).
      return "none";
  }
}

/** Kalan tam süre (ms; negatif olmaz). Pencere yoksa null. */
export function trialRemainingMs(row: Record<string, unknown>, nowMs: number = Date.now()): number | null {
  const ends = parseMs(row.trial_ends_at);
  if (ends === null) return null;
  return Math.max(0, ends - nowMs);
}

/**
 * Geri sayım kutusu metni. İlk giriş → 7 gün; sonraki günler kalan süre (yukarı yuvarlanmış gün);
 * son 24 saat → "son günü". Değer sunucunun bitiş zamanından hesaplanır.
 */
export function trialCountdownTitle(remainingMs: number): string {
  if (remainingMs <= 24 * 60 * 60 * 1000) return "Bugün Ücretsiz Denemenizin Son Günü";
  const days = Math.min(7, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  return `Ücretsiz Denemenize ${days} Gün Kaldı`;
}

export const TRIAL_MESSAGES = {
  expired:
    "Ücretsiz deneme süreniz sona erdi. Kayıtlarınızı görüntüleyebilir ve dışa aktarabilirsiniz; yeni işlem için Pro üyeliğe geçebilirsiniz.",
  suspended:
    "Deneme erişiminiz yönetici tarafından durduruldu. Kayıtlarınızı görüntüleyebilir ve dışa aktarabilirsiniz.",
  review:
    "Üyeliğiniz güvenlik incelemesinde. İnceleme tamamlanınca deneme modülleriniz açılacaktır.",
  notStarted: "Deneme süreniz henüz başlamadı. Lütfen çıkış yapıp yeniden giriş yapın.",
  moduleNotInTrial: "Bu modül ücretsiz deneme paketine dahil değildir. Pro üyelikle kullanılabilir.",
  creditDaily:
    "Bugünkü Roxy hesaplama krediniz doldu. Kayıtlı sonuçlarınızı görüntüleyebilirsiniz; krediniz Türkiye saatiyle 00.00'da yenilenir.",
  creditModule:
    "Bu modül için bugünkü Roxy hesaplama sınırına ulaştınız. Krediniz Türkiye saatiyle 00.00'da yenilenir.",
} as const;

export const TRIAL_EXPIRED_CODE = "TRIAL_EXPIRED" as const;
export const TRIAL_SUSPENDED_CODE = "TRIAL_SUSPENDED" as const;
export const TRIAL_REVIEW_CODE = "TRIAL_REVIEW" as const;
export const TRIAL_NOT_STARTED_CODE = "TRIAL_NOT_STARTED" as const;
export const TRIAL_CREDIT_LIMIT_CODE = "TRIAL_CREDIT_LIMIT" as const;

/** Erişimi olmayan / salt-okunur deneme fazı için sunucu yanıt kodu + mesajı. */
export function trialDenial(phase: TrialPhase): { code: string; message: string } {
  switch (phase) {
    case "expired":
      return { code: TRIAL_EXPIRED_CODE, message: TRIAL_MESSAGES.expired };
    case "suspended":
      return { code: TRIAL_SUSPENDED_CODE, message: TRIAL_MESSAGES.suspended };
    case "review":
      return { code: TRIAL_REVIEW_CODE, message: TRIAL_MESSAGES.review };
    default:
      return { code: TRIAL_NOT_STARTED_CODE, message: TRIAL_MESSAGES.notStarted };
  }
}

/** HTTP yöntemi salt-okunur mu (GET/HEAD/OPTIONS)? */
export function isReadMethod(method: string | null | undefined): boolean {
  const m = String(method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

/**
 * Kanonik e-posta (tek deneme hakkı için): trim + küçük harf; gmail/googlemail'de noktalar ve
 * "+etiket" atılır, alan adı gmail.com'a eşitlenir; diğer sağlayıcılarda yalnız "+etiket" atılır.
 */
export function canonicalTrialEmail(raw: string): string {
  const email = String(raw ?? "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}
