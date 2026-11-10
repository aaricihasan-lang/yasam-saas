/**
 * F3A — Word rapor markalamasının TEK merkezi sunucu çözücüsü (YALNIZ SUNUCU; service-role db).
 *
 *   const branding = await resolveReportBranding(guard.db, { tenantId: guard.tenantId, userId: guard.userId },
 *     { fullName: expertDisplayName(guard.profile) }, { purpose: "standard" });
 *
 * Akış: getProfile (F1) → reportIdentityOf (F1; anahtar kapalı → null, yalnız görünür + dolu alanlar) →
 * isteğe bağlı logo (F2 resolveReportLogo; aynı profil durumu yeniden okunmaz) → normalizeExpertBranding.
 *
 * Kurallar:
 *  - Sahip (tenantId / userId) ve ad YALNIZ oturumdan (guard) gelir; istemci verisi kullanılmaz.
 *  - Tablo yok (migration uygulanmamış) / DB hatası / beklenmeyen hata / zaman aşımı → null: rapor bugünküyle
 *    birebir üretilir. Asla fırlatmaz. Günlük yalnız sabit aşama kodu yazar (kişisel veri yok).
 *  - Önbellek YOK: her çağrı yalnız o istek içindir. Toplu raporda çağıran bir kez çağırır.
 *  - purpose:
 *      "standard"    → ad, unvan, kurum, iletişim, dipnot, logo (Kademe A: DY, Numeroloji, Klasik, Beslenme)
 *      "hd"          → unvan, kurum, logo (ad rapora yazılan preparedBy'dan gelir; iletişim/dipnot GÖSTERİLMEZ)
 *      "hd-relation" → unvan, kurum (logo / iletişim / dipnot yok)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { normalizeExpertBranding, type ExpertBranding } from "@/lib/docx/expertBranding";
import { reportIdentityOf } from "./identity";
import { resolveReportLogo, REPORT_LOGO_TIMEOUT_MS } from "./reportLogo";
import { getProfile, type Owner } from "./service";

assertServerOnly("lib/profile/reportBranding");

export type ReportBrandingPurpose = "standard" | "hd" | "hd-relation";

function warn(stage: string): void {
  console.warn(`[report-branding] rapor markasız devam ediyor: ${stage}`);
}

/**
 * Oturum sahibinin render-hazır rapor markalaması ya da null (markasız rapor). Asla fırlatmaz.
 * `opts.timeoutMs`: logo çözümü üst sınırı (varsayılan F2 REPORT_LOGO_TIMEOUT_MS).
 */
export async function resolveReportBranding(
  db: SupabaseClient,
  owner: Owner,
  account: { fullName: string | null },
  opts: { purpose?: ReportBrandingPurpose; timeoutMs?: number } = {},
): Promise<ExpertBranding | null> {
  const purpose = opts.purpose ?? "standard";
  try {
    if (!owner?.tenantId || !owner?.userId) return null;
    const p = await getProfile(db, owner);
    if (!p.ok) {
      // unavailable = tablo henüz yok (migration öncesi) → sessiz; db hatası → sabit aşama kodu.
      if (p.kind !== "unavailable") warn("profile");
      return null;
    }
    const id = reportIdentityOf(p.state, { fullName: purpose === "standard" ? account.fullName : null });
    if (!id) return null;
    const isHd = purpose !== "standard";
    const logo = purpose === "hd-relation"
      ? null
      : await resolveReportLogo(db, owner, { profile: p.state, timeoutMs: opts.timeoutMs ?? REPORT_LOGO_TIMEOUT_MS });
    return normalizeExpertBranding({
      name: isHd ? null : id.fullName,
      title: id.title,
      organization: id.organization,
      phone: isHd ? null : id.phone,
      email: isHd ? null : id.contactEmail,
      website: isHd ? null : id.website,
      note: isHd ? null : id.note,
      logoPng: logo,
    });
  } catch {
    warn("unexpected");
    return null;
  }
}
