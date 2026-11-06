/**
 * Doğaltaş Kütüphanesi — İLK SUNUCU ÇİZİMİ için erişim kararı (Doğaltaş ana ekranındaki "Doğaltaş Kütüphanesi" kartı).
 *
 * Kök neden (31.10.2026): Doğaltaş ana ekranı tamamen istemci bileşeniydi; sunucu kullanıcıyı bilmeden çiziyor, kütüphane
 * erişimi tarayıcıda SONRADAN soruluyordu → kart sonradan beliriyordu. Bu yardımcı kararı sayfa isteğinin KENDİ oturum
 * çerezinden (HttpOnly `__Host-yasam_sid`, SESSION_COOKIE_MODE=primary) sunucuda verir.
 *
 * YENİ YETKİ KURALI YOKTUR: kullanıcı yalnız çerezdeki oturum token'ından çözülür (resolveSessionUserId), ardından uzman okuma
 * uçlarının kullandığı kapının AYNISI (requireStoneLibraryViewer: bayrak, rol, aktiflik, üyelik, modül izni, demo değil, DB
 * stone_library_viewer_allowed) çalıştırılır. İstek başlığındaki kimlik bilgileri YOK SAYILIR (yalnız çerez). Herhangi bir
 * belirsizlik / hata → false (fail-closed). Bu değer YALNIZ kartın gösterilmesini belirler; kütüphane sayfası ve API'ler kendi
 * korumalarını ayrıca uygular (RLS + sunucu kapıları aynen).
 */
import "server-only";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { pickSessionCredential, resolveSessionUserId } from "@/lib/auth/sessionTransport";
import { isStoneLibraryEnabled, requireStoneLibraryViewer } from "./access";

const RENDER_PROBE_URL = "https://render.internal/api/dogaltas/kutuphane";
const CLIENT_IDENTITY_HEADERS = ["x-user-id", "x-admin-id", "x-session-token"] as const;

export async function stoneLibraryAccessForRender(): Promise<boolean> {
  if (!isStoneLibraryEnabled()) return false;
  try {
    const h = new Headers(await headers());
    for (const k of CLIENT_IDENTITY_HEADERS) h.delete(k);
    const pick = pickSessionCredential(new NextRequest(RENDER_PROBE_URL, { method: "GET", headers: h }));
    if (pick.kind !== "credential" || pick.source !== "cookie") return false;
    const session = await resolveSessionUserId(getServerDb(), pick);
    if (session.status !== "ok") return false;
    h.set("x-user-id", session.userId);
    const gate = await requireStoneLibraryViewer(new NextRequest(RENDER_PROBE_URL, { method: "GET", headers: h }));
    return gate.ok;
  } catch {
    return false;
  }
}
