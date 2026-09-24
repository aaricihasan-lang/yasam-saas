import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServerDb } from "@/lib/supabase-server";
import { extractLocationFromHeaders } from "@/lib/auth/sessionSecurity";
import { isDemoAccountId } from "@/lib/auth/demoServerGuard";

export const runtime = "nodejs";

/**
 * POST /api/numeroloji/demo-analiz
 *
 * Demo hesapta IP bazlı TEK analiz hakkı. Sadece demo kullanıcıya uygulanır;
 * normal expert kullanıcı bu endpoint'i çağırmaz ve etkilenmez.
 *
 * Akış:
 *   - body.userId → users.is_demo_account doğrulanır (DB'den, spoof edilemez).
 *   - Demo değilse: { allowed: true, demo: false } (kısıt yok).
 *   - Demo ise: IP hash'lenir (ham IP saklanmaz), demo_numerology_ip_usage'da
 *     daha önce kullanılmış mı bakılır:
 *       kullanılmış → 403 { allowed: false, message }
 *       kullanılmamış → satır eklenir (claim) → { allowed: true }
 *
 * Hak DB'de tutulduğu için logout/localStorage temizliği hakkı SIFIRLAMAZ.
 */

const DEMO_LIMIT_MESSAGE =
  "Demo hesapta her bağlantı için yalnızca 1 örnek numeroloji analizi oluşturulabilir.\n\nDaha fazla analiz oluşturmak için uzman hesabı talebinde bulunun.";

// NUM-011: Ham IP saklanmaz; pepper'lı sha256 kullanılır. Pepper YALNIZ env'den gelir.
//   - production: DEMO_IP_SALT ZORUNLU. Yoksa tahmin edilebilir sabit fallback KULLANILMAZ
//     (hash amacı boşa çıkardı) → demo kotası fail-closed (aşağıda 500 config hatası).
//   - development/test: env yoksa yalnız GELİŞTİRME amaçlı açık fallback.
// Server-only; NEXT_PUBLIC DEĞİL → istemci bundle'ına sızmaz.
function resolveIpPepper(): string | null {
  const env = process.env.DEMO_IP_SALT?.trim();
  if (env) return env;
  if (process.env.NODE_ENV === "production") return null;
  return "dev-only-yasam-demo-numeroloji-ip-salt";
}

function hashIp(ip: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${ip}`).digest("hex");
}

export async function POST(request: Request) {
  let userId = "";
  try {
    const body = (await request.json()) as { userId?: unknown };
    userId = String(body?.userId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  let db;
  try {
    db = getServerDb();
  } catch {
    return NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 500 });
  }

  // Kısıt yalnızca demo hesaba uygulanır. Demo değilse serbest.
  if (!(await isDemoAccountId(userId, db))) {
    return NextResponse.json({ allowed: true, demo: false });
  }

  // NUM-011: pepper prod'da zorunlu; yoksa fail-closed (demo kotası çalışmaz, güvenli taraf).
  const pepper = resolveIpPepper();
  if (!pepper) {
    return NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 500 });
  }

  const { ip } = extractLocationFromHeaders(request.headers);
  const ipHash = hashIp(ip, pepper);

  // Daha önce kullanılmış mı?
  const { data: existing, error: selErr } = await db
    .from("demo_numerology_ip_usage")
    .select("id")
    .eq("ip_hash", ipHash)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ error: "Hak kontrolü yapılamadı." }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json(
      { allowed: false, message: DEMO_LIMIT_MESSAGE },
      { status: 403 },
    );
  }

  // Hakkı tüket (claim). Eşzamanlı çift istek → unique ihlali → kullanılmış say.
  const { error: insErr } = await db
    .from("demo_numerology_ip_usage")
    .insert({ ip_hash: ipHash });

  if (insErr) {
    return NextResponse.json(
      { allowed: false, message: DEMO_LIMIT_MESSAGE },
      { status: 403 },
    );
  }

  return NextResponse.json({ allowed: true, demo: true });
}
