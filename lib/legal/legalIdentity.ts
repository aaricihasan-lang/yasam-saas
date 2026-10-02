/**
 * Yaşam Sistemi veri sorumlusu kimliği — TEK KAYNAK (P1-6 §3.3).
 *
 * KURAL: Resmî kimlik bilgileri (unvan, adres, VKN/MERSİS, KEP) UYDURULMAZ. Owner
 * girdisi gelene kadar bu alanlar `null` kalır ve kullanıcıya hiçbir biçimde yer
 * tutucu olarak gösterilmez: kimlik bloğu yalnız marka adı + gerçek iletişim
 * kanallarıyla render edilir (bkz. `legalIdentityLines`). Owner girdisi geldiğinde
 * yalnız bu dosyadaki ilgili alan doldurulur; sayfalar otomatik olarak gösterir.
 *
 * İletişim kanalları lib/contact/info.ts'den gelir (ikinci kez sabit yazılmaz).
 *
 * İÇ KAPI (kullanıcıya GÖRÜNMEZ; owner kararı 2026-10):
 *   LEGAL OPERATOR IDENTITY — REQUIRED BEFORE PAID COMMERCIAL LAUNCH.
 *   Kullanıcıya görünen hizmet/platform adı şimdilik yalnız "Yaşam Sistemi"dir; kayıtlı bir
 *   şirket/tüzel kişi gibi sunulmaz. Nihai işletmeci kesinleşince (ad/unvan, adres, gerekiyorsa
 *   VKN/MERSİS/KEP) aşağıdaki null alanlar doldurulur. Bu kapı production UI'da hiçbir uyarı
 *   olarak GÖSTERİLMEZ; yalnız bu sabit + final teknik rapor checklist'inde izlenir.
 * Saf modül (client + server).
 */
import { CONTACT_EMAIL, CUSTOMER_SERVICE_DISPLAY } from "@/lib/contact/info";

export type LegalIdentity = {
  /** Kullanıcıya görünen marka adı. */
  brandName: string;
  /** Resmî kişi/işletme unvanı (owner girdisi; yoksa null). */
  legalName: string | null;
  /** Resmî adres (owner girdisi; yoksa null). */
  address: string | null;
  /** VKN / MERSİS numarası (owner girdisi; yoksa null). */
  taxOrMersis: string | null;
  /** KEP adresi (varsa; yoksa null). */
  kep: string | null;
  /** Kurumsal iletişim e-postası. */
  email: string;
  /** Müşteri hizmetleri telefonu (okunur biçim). */
  phone: string;
};

/** İç kapı durumu (UI'da kullanılmaz; harness/rapor içindir). */
export const LEGAL_OPERATOR_IDENTITY_GATE = {
  id: "LEGAL_OPERATOR_IDENTITY_BEFORE_PAID_COMMERCIAL_LAUNCH",
  requiredBeforePaidCommercialLaunch: true,
} as const;

/** Resmî işletmeci kimliği tamam mı? (unvan + adres + VKN/MERSİS) — yalnız iç kontrol. */
export function isLegalOperatorIdentityComplete(identity: LegalIdentity = LEGAL_IDENTITY): boolean {
  return [identity.legalName, identity.address, identity.taxOrMersis].every(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
}

export const LEGAL_IDENTITY: LegalIdentity = {
  brandName: "Yaşam Sistemi",
  legalName: null,
  address: null,
  taxOrMersis: null,
  kep: null,
  email: CONTACT_EMAIL,
  phone: CUSTOMER_SERVICE_DISPLAY,
};

export type LegalIdentityLine = { label: string; value: string };

function present(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Kimlik bloğunda gösterilecek satırlar. Boş (null) alanlar listeye HİÇ girmez —
 * yer tutucu, köşeli parantez veya "doldurulacak" ifadesi üretilmez.
 */
export function legalIdentityLines(identity: LegalIdentity = LEGAL_IDENTITY): LegalIdentityLine[] {
  const lines: LegalIdentityLine[] = [];
  lines.push({ label: "Marka", value: identity.brandName });
  if (present(identity.legalName)) lines.push({ label: "Unvan", value: identity.legalName.trim() });
  if (present(identity.address)) lines.push({ label: "Adres", value: identity.address.trim() });
  if (present(identity.taxOrMersis)) lines.push({ label: "VKN / MERSİS", value: identity.taxOrMersis.trim() });
  if (present(identity.kep)) lines.push({ label: "KEP", value: identity.kep.trim() });
  lines.push({ label: "E-posta", value: identity.email });
  lines.push({ label: "Telefon", value: identity.phone });
  return lines;
}
