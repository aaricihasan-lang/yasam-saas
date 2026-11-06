import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isSelfTrialRow, resolveTrialPhase } from "@/lib/trial/trialCore";
import { activateTrialOnLogin, readOpenProRequest, readTrialCreditUsage } from "@/lib/trial/trialServer";
import { getStoreSettings } from "@/lib/store/storefront";
import { buildWhatsappLink } from "@/lib/store/whatsapp";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

const PRO_WHATSAPP_MESSAGE =
  "Merhaba, Yaşam Sistemi 7 günlük ücretsiz denememi kullandım. Pro üyeliğe geçmek istiyorum.";

/**
 * GET /api/trial/status — oturumdaki uzmanın 7 günlük deneme durumu (geri sayım kutusu + kredi + Pro).
 *
 * Kimlik YALNIZ oturumdan (verifyUserRequest). Deneme rejimi dışı hesap → { trial: null } (Premium /
 * admin / demo için hiçbir şey değişmez). Kalan süre SUNUCU bitiş zamanından hesaplanır (server_now).
 * Pencere başlamamışsa (ör. inceleme sonrası ilk erişim) ilk başarılı oturum olarak BİR KEZ başlatılır.
 * Bu uç yalnız okur (+ tek seferlik pencere başlatma); süre uzatma yolu YOKTUR.
 */
export async function GET(req: NextRequest) {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return guard.response;
  const profile = guard.profile ?? {};
  if (!isSelfTrialRow(profile)) return NextResponse.json({ trial: null }, { headers: NO_STORE });

  let phase = resolveTrialPhase(profile);
  let startedAt = profile.trial_started_at == null ? null : String(profile.trial_started_at);
  let endsAt = profile.trial_ends_at == null ? null : String(profile.trial_ends_at);
  let serverNow = new Date().toISOString();
  if (phase === "not_started") {
    const st = await activateTrialOnLogin(guard.db, guard.userId);
    if (st) {
      phase = st.phase;
      startedAt = st.startedAt;
      endsAt = st.endsAt;
      serverNow = st.serverNow;
    }
  }
  if (phase === "converted") return NextResponse.json({ trial: null, converted: true }, { headers: NO_STORE });

  const [credits, proRequestAt, store] = await Promise.all([
    readTrialCreditUsage(guard.db, guard.userId),
    readOpenProRequest(guard.db, guard.userId),
    getStoreSettings().catch(() => ({ whatsapp_number: null, whatsapp_enabled: false })),
  ]);
  const whatsappUrl = store.whatsapp_enabled ? buildWhatsappLink(store.whatsapp_number, PRO_WHATSAPP_MESSAGE) : null;

  return NextResponse.json(
    {
      trial: {
        phase,
        startedAt,
        endsAt,
        serverNow,
        credits,
        proRequestAt,
        whatsappUrl,
      },
    },
    { headers: NO_STORE },
  );
}
