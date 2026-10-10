import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { readRoxyServerConfig, ROXY_LOCATION_CACHE, ROXY_RATE_LIMITS } from "@/lib/human-design/providers/roxy/config";
import { searchRoxyLocations } from "@/lib/human-design/providers/roxy/location";
import { roxyCityToLocation, signLocationRef } from "@/lib/human-design/api/hdLocationRef";
import { toHdSearchResults } from "@/lib/human-design/location/hdSearchResults";
import type { HdBirthLocation } from "@/lib/human-design/api/hdBirthLocation";
import { exonymTarget } from "@/lib/location/server/search";

export const runtime = "nodejs";

/**
 * GET /api/hd/location/search?q=<ilçe/şehir> — RoxyAPI Location (genişletilmiş doğum yeri araması).
 *
 *   - requireModuleAccess("human_design"); demo hesap → 403 (kredi harcamaz).
 *   - Kredi koruması: açık kullanıcı eylemiyle çağrılır (typeahead DEĞİL); normalize sorgu
 *     önbelleği (30 gün, instance belleği) → aynı sorgu tekrar Roxy'ye gitmez; kullanıcı limiti.
 *   - Türkiye: saat dilimi Europe/Istanbul olmayan "TR" sonucu atılır (ör. Cey — gerçekte Irak).
 *     HD 973 ilçe dizininde doğrulanmış karşılığı olan sonuç, yerel ilçe kimliğine (`trd-…`)
 *     çevrilir (koordinat sunucu veri setinden; Kadıköy gibi Roxy'de yanlış köye düşen kayıtlar dahil).
 *   - Türkçe yabancı şehir adı ("Londra", "Münih"…) TAMAMEN yazılmışsa sağlayıcıya dataset'teki
 *     kanonik ad ("London", "Munich") gönderilir — yalnız sorgu metni; sonuç/konum yine sağlayıcıdan.
 *   - Diğer sonuçlar HMAC-imzalı referans (`ref`) taşır; hesaplama ucu tz/koordinatı yalnız imzadan
 *     çözer (istemci değiştiremez). ROXY_API_KEY yalnız sunucuda; yanıt/hata/logda yer almaz.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const cache = new Map<string, { at: number; locations: HdBirthLocation[] }>();

function norm(q: string): string {
  return q.normalize("NFC").trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "human_design");
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json({ ok: false, code: "DEMO_READONLY", error: "Demo hesabında genişletilmiş konum araması kapalıdır." }, { status: 403, headers: NO_STORE });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < ROXY_LOCATION_CACHE.minQuery || q.length > ROXY_LOCATION_CACHE.maxQuery) {
    return NextResponse.json({ ok: false, code: "INVALID_QUERY", error: `En az ${ROXY_LOCATION_CACHE.minQuery} karakter girin.` }, { status: 400, headers: NO_STORE });
  }
  const config = readRoxyServerConfig();
  if (!config) {
    return NextResponse.json({ ok: false, code: "NOT_CONFIGURED", error: "Genişletilmiş konum araması şu anda kullanılamıyor." }, { status: 503, headers: NO_STORE });
  }

  const providerQuery = exonymTarget(q)?.name ?? q;
  const key = norm(providerQuery);
  const now = Date.now();
  let hit = cache.get(key);
  if (hit && now - hit.at > ROXY_LOCATION_CACHE.ttlMs) {
    cache.delete(key);
    hit = undefined;
  }
  let locations: HdBirthLocation[];
  let cached = false;
  if (hit) {
    locations = hit.locations;
    cached = true;
  } else {
    const rl = await hitDbRateLimit(
      guard.db,
      rateLimitBucket("hd-roxy-location", guard.userId),
      ROXY_RATE_LIMITS.locationSearchPerUser.limit,
      ROXY_RATE_LIMITS.locationSearchPerUser.windowSeconds,
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla konum araması yapıldı. Lütfen biraz sonra tekrar deneyin." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSec || 60) } },
      );
    }
    const r = await searchRoxyLocations(config, providerQuery, { limit: 10 });
    if (!r.ok) {
      console.error("[hd-roxy-location] search failed", { kind: r.kind, status: r.status });
      return NextResponse.json({ ok: false, code: "PROVIDER_ERROR", error: "Konum servisine şu anda ulaşılamıyor. İl listesinden seçim yapabilirsiniz." }, { status: 502, headers: NO_STORE });
    }
    locations = r.cities.map(roxyCityToLocation);
    if (cache.size >= ROXY_LOCATION_CACHE.maxEntries) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: now, locations });
  }

  const results = toHdSearchResults(locations, (l) => signLocationRef(l));
  if (!results) {
    return NextResponse.json({ ok: false, code: "NOT_CONFIGURED", error: "Genişletilmiş konum araması şu anda kullanılamıyor." }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, cached, results }, { status: 200, headers: NO_STORE });
}
