// F3B — Gökyüzü Atlası raporları (kayıtlı analiz tekli / toplu, Batı Horary) için uzman markalaması yükleyicisi. YALNIZ SUNUCU.
//
// Sahip (tenant / kullanıcı) YALNIZ kapıdan (requireAstrologyAccess → ctx); ad oturum sahibinin kendi users kaydından ve yalnız
// rapor kimliği anahtarı açıkken okunur. purpose "signature": Atlas bugün uzman adı göstermez → yalnız anahtar açıkken rapor
// sonuna "Hazırlayan" imza kartı (Word + PDF aynı veri). Asla fırlatmaz; kapalı / profil yok / tablo yok → null (birebir).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { ExpertBranding } from "@/lib/docx/expertBranding";
import { readAccountFullName, resolveReportBranding } from "@/lib/profile/reportBranding";

assertServerOnly("lib/astrology/report/branding");

export function astroReportBrandingLoader(ctx: { db: SupabaseClient; tenantId: string; userId: string }): () => Promise<ExpertBranding | null> {
  return async () => {
    try {
      return await resolveReportBranding(
        ctx.db,
        { tenantId: ctx.tenantId, userId: ctx.userId },
        { loadFullName: () => readAccountFullName(ctx.db, ctx.userId) },
        { purpose: "signature" },
      );
    } catch {
      return null;
    }
  };
}
