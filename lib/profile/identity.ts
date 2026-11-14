/**
 * UZMAN PROFİLİ — rapor kimliği çözümü (saf; F3 rapor markalaması için bağlantı noktası).
 *
 * F1'de HİÇBİR rapor bu işlevi çağırmaz → raporlar bugünküyle birebir aynıdır. F3 bir raporda kurumsal bilgi göstermek
 * istediğinde YALNIZ bu işlevin döndürdüğünü kullanır:
 *   - report_branding_enabled kapalıysa (varsayılan) → null: rapor bugünkü hâliyle üretilir.
 *   - Açıksa yalnız alan anahtarı açık VE dolu alanlar döner. Ad soyad users tablosundan gelir (yönetici değiştirir).
 * Dönen metinler düz metindir; tüketici (docx / PDF) metin düğümü olarak yazmalı, HTML olarak işlememelidir.
 */
import type { ProfileFields } from "./schema";

export type ReportIdentity = {
  fullName: string | null;
  title: string | null;
  organization: string | null;
  phone: string | null;
  contactEmail: string | null;
  website: string | null;
  note: string | null;
};

export function reportIdentityOf(profile: ProfileFields, account: { fullName: string | null }): ReportIdentity | null {
  if (!profile.reportBrandingEnabled) return null;
  const contact = profile.reportShowContact;
  const id: ReportIdentity = {
    fullName: account.fullName?.trim() || null,
    title: profile.reportShowTitle ? profile.title : null,
    organization: profile.reportShowOrganization ? profile.organization : null,
    phone: contact ? profile.phone : null,
    contactEmail: contact ? profile.contactEmail : null,
    website: contact ? profile.website : null,
    note: profile.reportShowNote ? profile.reportNote : null,
  };
  return id;
}
