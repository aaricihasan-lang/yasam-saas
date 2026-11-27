/** Şifa Rehberi V2 — GERÇEK API: yarım kalan (finalize edilmemiş) kendi yüklemesini silme. Kayıtlı görsele dokunmaz. */
import type { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { handleUploadDiscard } from "@/lib/sifa-rehberi-v2/server/http";
import { sifaV2Context, sifaV2Enabled, sifaV2NotFound, sifaV2Ready } from "@/lib/sifa-rehberi-v2/server/realRoute";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sifaV2Enabled()) return sifaV2NotFound();
  const guard = await requireModuleAccess(req, "sifa_rehberi");
  if (!guard.ok) return guard.response;
  if (!(await sifaV2Ready(guard.db))) return sifaV2NotFound();
  if (guard.is_demo_account) return demoReadOnlyResponse();
  const c = sifaV2Context(guard);
  return handleUploadDiscard(c.db, c.storage, c.scope, req);
}
