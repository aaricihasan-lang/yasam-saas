/**
 * Şifa Rehberi V2 — GERÇEK API: görsellerin kısa ömürlü imzalı okuma bağlantıları.
 * Yalnız çağıranın GÖREBİLDİĞİ görseller (kendi kişisel + kendi tenant'ının kurum görselleri);
 * görünmeyen kimlikler sessizce atlanır (varlık sızdırılmaz). Okuma işlemi → salt-okunur denemede izinli.
 */
import type { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { handleAssetUrls } from "@/lib/sifa-rehberi-v2/server/http";
import { sifaV2Context, sifaV2Enabled, sifaV2NotFound, sifaV2Ready } from "@/lib/sifa-rehberi-v2/server/realRoute";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sifaV2Enabled()) return sifaV2NotFound();
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;
  if (!(await sifaV2Ready(guard.db))) return sifaV2NotFound();
  const c = sifaV2Context(guard);
  return handleAssetUrls(c.db, c.storage, c.scope, req);
}
