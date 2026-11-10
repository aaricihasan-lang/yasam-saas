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
 *      "signature"   → F3B Kademe B (Refleksoloji, Kupa, Gökyüzü Atlası Word/PDF): bu raporlar bugün uzman adı GÖSTERMEZ.
 *                      Anahtar açıkken rapor sonuna isteğe bağlı "Hazırlayan" imza bloğu: profil adı (OWNER KARARI —
 *                      `SIGNATURE_INCLUDES_PROFILE_NAME`), unvan, kurum, iletişim, dipnot, logo.
 *      "named-by-form" → F3B Hacamat (Word + PDF): ad formdaki serbest "Hazırlayan" alanından gelir, profil adıyla EZİLMEZ
 *                      (ad hiç döndürülmez). Unvan, kurum, logo; iletişim + dipnot OWNER KARARI
 *                      (`NAMED_BY_FORM_INCLUDES_CONTACT_NOTE`). Çağıran yalnız form adı doluyken çağırır.
 *  - account: `{ fullName }` ya da `{ loadFullName }` (yalnız anahtar açıksa ve ad gerekiyorsa çağrılır → kapalıyken ek
 *    sorgu yok). Ad her zaman oturum sahibinin kendi kaydından okunur.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { normalizeExpertBranding, type ExpertBranding } from "@/lib/docx/expertBranding";
import { reportIdentityOf } from "./identity";
import { resolveReportLogo, REPORT_LOGO_TIMEOUT_MS } from "./reportLogo";
import { getProfile, type Owner } from "./service";

assertServerOnly("lib/profile/reportBranding");

export type ReportBrandingPurpose = "standard" | "hd" | "hd-relation" | "signature" | "named-by-form";

/**
 * OWNER KARARI (F3B, 2026-11-10): Kademe B raporları (Refleksoloji / Kupa / Gökyüzü Atlası) bugün uzman adı göstermez; anahtar
 * açıkken eklenen "Hazırlayan" imza bloğu profil adını OTOMATİK yazar. `false` → imza bloğu adsız (yalnız unvan / kurum /
 * iletişim / dipnot / logo). Tek satırda kapatılabilir.
 */
export const SIGNATURE_INCLUDES_PROFILE_NAME = true;

/**
 * OWNER KARARI (F3B, 2026-11-10): Hacamat raporunda (Word + PDF) form adı doluyken iletişim satırı ve uzman dipnotu da eklenir
 * (HD'den farklı: Hacamat takvimi danışana verilen seans belgesidir; iletişim / dipnot uzmanın Profilim'de AYRICA görünür
 * işaretlediği alanlardır). `false` → HD gibi yalnız unvan / kurum / logo. Tek satırda kapatılabilir.
 */
export const NAMED_BY_FORM_INCLUDES_CONTACT_NOTE = true;

type Account = { fullName: string | null } | { loadFullName: () => Promise<string | null> };

async function accountName(account: Account): Promise<string | null> {
  if ("loadFullName" in account) {
    try {
      return await account.loadFullName();
    } catch {
      return null;
    }
  }
  return account.fullName;
}

/**
 * Oturum sahibinin görünen adı (users.full_name → name). Kimlik YALNIZ guard'dan gelen userId; asla fırlatmaz.
 * Profilinde ad bulunmayan bağlamlar (Gökyüzü Atlası kapısı) için `{ loadFullName }` ile kullanılır.
 */
export async function readAccountFullName(db: SupabaseClient, userId: string): Promise<string | null> {
  try {
    if (!userId) return null;
    const { data, error } = await db.from("users").select("full_name, name").eq("id", userId).maybeSingle();
    if (error || !data) return null;
    for (const key of ["full_name", "name"] as const) {
      const v = (data as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) return v.replace(/\s+/g, " ").trim();
    }
    return null;
  } catch {
    return null;
  }
}

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
  account: Account,
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
    const id = reportIdentityOf(p.state, { fullName: null });
    if (!id) return null;
    const withName = purpose === "standard" || (purpose === "signature" && SIGNATURE_INCLUDES_PROFILE_NAME);
    const withContactNote = purpose === "standard" || purpose === "signature" || (purpose === "named-by-form" && NAMED_BY_FORM_INCLUDES_CONTACT_NOTE);
    // Ad yalnız anahtar AÇIK ve ad gerekiyorsa okunur (kapalıyken ek sorgu yok).
    const fullName = withName ? (await accountName(account))?.trim() || null : null;
    const logo = purpose === "hd-relation"
      ? null
      : await resolveReportLogo(db, owner, { profile: p.state, timeoutMs: opts.timeoutMs ?? REPORT_LOGO_TIMEOUT_MS });
    return normalizeExpertBranding({
      name: fullName,
      title: id.title,
      organization: id.organization,
      phone: withContactNote ? id.phone : null,
      email: withContactNote ? id.contactEmail : null,
      website: withContactNote ? id.website : null,
      note: withContactNote ? id.note : null,
      logoPng: logo,
    });
  } catch {
    warn("unexpected");
    return null;
  }
}
