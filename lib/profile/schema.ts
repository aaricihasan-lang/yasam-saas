/**
 * UZMAN PROFİLİ (F1) — saf şema doğrulaması (bağımlılıksız; sunucu ve tarayıcı birlikte kullanır).
 *
 * İlkeler:
 *  - KATI: bilinmeyen alan → hata. Ad soyad, giriş e-postası, parola, rol, paket, tenant/kullanıcı kimliği gibi hesap alanları
 *    bu uçtan DEĞİŞTİRİLEMEZ (public.users'ta kalır; yalnız yönetici değiştirir).
 *  - Metinler NFC'ye normalize edilir, kırpılır; boş metin → null. Uzunluk KOD NOKTASI ile ölçülür (PostgreSQL char_length
 *    ile aynı). Sınırlar ve karakter kuralları migration 20280102000000 CHECK'leriyle AYNIDIR.
 *  - Kontrol karakterleri, görünmez yön işaretleri (RLO/LRI/RLM/ALM…), satır/paragraf ayırıcıları, BOM ve eşleşmemiş vekil
 *    (surrogate) reddedilir. Tek satırlı alanlarda satır sonu da reddedilir.
 *  - "<" POLİTİKASI: metinler yalnız METİN olarak saklanır ve gösterilir (React kaçışlar; Word raporu metin düğümü yazar);
 *    hiçbir yerde HTML olarak işlenmez. Derinlemesine savunma olarak etiket BAŞLANGICI ("<harf", "</", "<!", "<?") reddedilir:
 *    gelecekte metni HTML/PDF şablonuna koyan bir tüketici kaçışlamayı unutsa bile çalıştırılabilir işaretleme taşınmaz.
 *    "3 < 5", "<3", ">" gibi doğal kullanımlar serbesttir.
 *  - İnternet sitesi yalnız https://, ASCII alan adı (IDN için punycode), kullanıcı-bilgisi (@) yok, IP / localhost yok.
 */

export const PROFILE_SCHEMA_VERSION = 1;
/** İstek gövdesi üst sınırı (tüm alanlar en uzun hâliyle ~8 KB; JSON kaçışları için pay). */
export const PROFILE_BODY_MAX_BYTES = 16 * 1024;

export const PROFILE_LIMITS = {
  title: 80,
  organization: 120,
  phone: 32,
  contactEmail: 254,
  website: 200,
  bio: 1000,
  reportNote: 300,
} as const;
/** Çok satırlı alanlarda en fazla satır sayısı (yalnız uygulama kuralı; DB satır saymaz). */
export const PROFILE_MAX_LINES = { bio: 20, reportNote: 4 } as const;

export const PROFILE_TEXT_FIELDS = ["title", "organization", "phone", "contactEmail", "website", "bio", "reportNote"] as const;
export const PROFILE_FLAG_FIELDS = ["reportBrandingEnabled", "reportShowTitle", "reportShowOrganization", "reportShowContact", "reportShowNote"] as const;
export type ProfileTextField = (typeof PROFILE_TEXT_FIELDS)[number];
export type ProfileFlagField = (typeof PROFILE_FLAG_FIELDS)[number];
export type ProfileField = ProfileTextField | ProfileFlagField;

export type ProfileFields = { [K in ProfileTextField]: string | null } & { [K in ProfileFlagField]: boolean };
export type ProfilePatch = Partial<ProfileFields>;

/** Satır yokken (ve yeni kullanıcıda) geçerli değerler: markalama KAPALI → raporlar bugünküyle aynı. */
export const EMPTY_PROFILE: Readonly<ProfileFields> = Object.freeze({
  title: null,
  organization: null,
  phone: null,
  contactEmail: null,
  website: null,
  bio: null,
  reportNote: null,
  reportBrandingEnabled: false,
  reportShowTitle: true,
  reportShowOrganization: true,
  reportShowContact: true,
  reportShowNote: true,
});

/** Hesap alanları: profil ucundan değiştirilemez (ayrı ve açık hata mesajı için). */
const ACCOUNT_KEYS = new Set([
  "full_name", "fullName", "name", "email", "password", "password_hash", "passwordHash", "role", "admin_level", "is_super_admin",
  "package_type", "packageType", "plan", "membership_status", "subscription_status", "module_permissions", "tenant_id", "tenantId",
  "user_id", "userId", "id", "is_demo_account", "approval_status", "active", "status", "logoAssetId", "logo_asset_id", "logoSource", "logo_source",
]);

const MULTILINE: ReadonlySet<ProfileTextField> = new Set(["bio", "reportNote"]);
// Kontrol karakterleri (satır sonu hariç), DEL, ALM, LRM/RLM, satır/paragraf ayırıcı, yön gömme/geçersiz kılma/yalıtım, BOM.
const BAD_CHARS_MULTI = /[\u0000-\u0009\u000B-\u001F\u007F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/;
const BAD_CHARS_SINGLE = /[\u0000-\u001F\u007F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/;
/** Eşleşmemiş vekil (lone surrogate) var mı? (Geriye bakan düzenli ifade eski Safari'de sözdizimi hatası verdiği için döngü.) */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; }
      return true;
    }
    if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}
const TAG_START = /<[A-Za-z/!?]/;
const PHONE_RE = /^[0-9+() -]+$/;
const EMAIL_LOCAL_RE = /^[^\s@<>"(),;:\\[\]]{1,64}$/;
const DNS_LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/;
// DB CHECK ile aynı iskelet; ek kurallar aşağıda URL ayrıştırıcısıyla.
const WEBSITE_RE = /^https:\/\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?::[0-9]{1,5})?(?:[/?#][^\s<>"\\]*)?$/;

export const PROFILE_LABELS: Record<ProfileField, string> = {
  title: "Unvan",
  organization: "Kurum / işletme",
  phone: "Telefon",
  contactEmail: "İletişim e-postası",
  website: "İnternet sitesi",
  bio: "Kısa biyografi",
  reportNote: "Rapor dipnotu",
  reportBrandingEnabled: "Raporlarımda kurumsal bilgilerimi göster",
  reportShowTitle: "Unvan",
  reportShowOrganization: "Kurum",
  reportShowContact: "İletişim bilgileri",
  reportShowNote: "Rapor dipnotu",
};

/** Kod noktası sayısı (PostgreSQL char_length ile aynı). */
export function charCount(s: string): number {
  return Array.from(s).length;
}

function hostOk(host: string): boolean {
  const labels = host.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => DNS_LABEL_RE.test(l))) return false;
  return TLD_RE.test(labels[labels.length - 1]);
}

export function isValidEmail(v: string): boolean {
  if (charCount(v) > PROFILE_LIMITS.contactEmail) return false;
  const at = v.lastIndexOf("@");
  if (at <= 0 || v.indexOf("@") !== at) return false;
  return EMAIL_LOCAL_RE.test(v.slice(0, at)) && hostOk(v.slice(at + 1));
}

export function isValidWebsite(v: string): boolean {
  if (charCount(v) > PROFILE_LIMITS.website || !WEBSITE_RE.test(v)) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  return hostOk(host);
}

export type TextResult = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Tek metin alanını normalize + doğrular. Tarayıcı da aynı işlevi kullanır (sunucu yine kendisi doğrular).
 * Normalize: NFC, CRLF/CR → LF (yalnız çok satırlı), baş/son boşluk kırpma, boş → null.
 */
export function normalizeProfileText(field: ProfileTextField, raw: unknown): TextResult {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Metin olmalı." };
  if (hasLoneSurrogate(raw)) return { ok: false, error: "Geçersiz karakter içeriyor." };
  const multi = MULTILINE.has(field);
  let s = raw.normalize("NFC");
  if (multi) s = s.replace(/\r\n?/g, "\n");
  s = s.trim();
  if (s === "") return { ok: true, value: null };
  if ((multi ? BAD_CHARS_MULTI : BAD_CHARS_SINGLE).test(s)) {
    return { ok: false, error: multi ? "Görünmez veya kontrol karakteri içeremez." : "Tek satır olmalı; görünmez veya kontrol karakteri içeremez." };
  }
  const max = PROFILE_LIMITS[field];
  if (charCount(s) > max) return { ok: false, error: `En fazla ${max} karakter olabilir.` };
  if (multi) {
    const maxLines = PROFILE_MAX_LINES[field as keyof typeof PROFILE_MAX_LINES];
    if (s.split("\n").length > maxLines) return { ok: false, error: `En fazla ${maxLines} satır olabilir.` };
  }
  switch (field) {
    case "phone": {
      const digits = s.replace(/[^0-9]/g, "").length;
      if (!PHONE_RE.test(s) || digits < 7 || digits > 15) return { ok: false, error: "Yalnız rakam, boşluk ve + - ( ) kullanın (7–15 rakam)." };
      return { ok: true, value: s };
    }
    case "contactEmail":
      if (!isValidEmail(s)) return { ok: false, error: "Geçerli bir e-posta adresi girin (ör. ad@alanadi.com)." };
      return { ok: true, value: s };
    case "website":
      if (!/^https:\/\//.test(s)) return { ok: false, error: "Adres https:// ile başlamalı (ör. https://www.alanadi.com)." };
      if (!isValidWebsite(s)) return { ok: false, error: "Geçerli bir https:// adresi girin (Latin harfli alan adı; kullanıcı adı / IP içermez)." };
      return { ok: true, value: s };
    default:
      if (TAG_START.test(s)) return { ok: false, error: "“<” işaretinin hemen ardından harf veya / ! ? gelemez (HTML etiketi kabul edilmez)." };
      return { ok: true, value: s };
  }
}

export type FieldErrors = Partial<Record<ProfileField, string>>;
export type PatchResult =
  | { ok: true; value: ProfilePatch }
  | { ok: false; error: string; path: string; fields?: FieldErrors };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * İstemcinin gönderdiği profil yaması (alanların herhangi bir alt kümesi). Gönderilmeyen alan DEĞİŞMEZ.
 * Bilinmeyen / hesap alanı → hata (ilk bulunan yol). Geçersiz değerler alan bazında toplanır.
 */
export function parseProfilePatch(v: unknown): PatchResult {
  if (!isRecord(v)) return { ok: false, error: "Profil bir nesne olmalı.", path: "profile" };
  for (const k of Object.keys(v)) {
    if ((PROFILE_TEXT_FIELDS as readonly string[]).includes(k) || (PROFILE_FLAG_FIELDS as readonly string[]).includes(k)) continue;
    if (ACCOUNT_KEYS.has(k)) return { ok: false, error: "Bu alan profilden değiştirilemez.", path: `profile.${k}` };
    return { ok: false, error: "Bilinmeyen alan.", path: `profile.${k}` };
  }
  const out: ProfilePatch = {};
  const fields: FieldErrors = {};
  for (const f of PROFILE_TEXT_FIELDS) {
    if (!(f in v)) continue;
    const r = normalizeProfileText(f, v[f]);
    if (r.ok) out[f] = r.value;
    else fields[f] = r.error;
  }
  for (const f of PROFILE_FLAG_FIELDS) {
    if (!(f in v)) continue;
    if (typeof v[f] === "boolean") out[f] = v[f] as boolean;
    else fields[f] = "Açık / kapalı (true / false) olmalı.";
  }
  const bad = Object.keys(fields) as ProfileField[];
  if (bad.length) return { ok: false, error: "Bazı alanlar geçersiz.", path: `profile.${bad[0]}`, fields };
  return { ok: true, value: out };
}

export function parseExpectedVersion(v: unknown): { ok: true; value: number } | { ok: false; error: string; path: string } {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 2_000_000_000) {
    return { ok: false, error: "expectedVersion 0 veya pozitif tam sayı olmalı.", path: "expectedVersion" };
  }
  return { ok: true, value: v };
}
