import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Analiz görseli yükleme — güvenli API katmanı (DY satış-blokeri kapanışı).
 *
 * Güvenlik modeli (analyses/route.ts ile aynı kanonik desen):
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding + modül.
 *   - tenant_id SUNUCUDA guard'dan alınır; formData'daki tenantId'ye ASLA güvenilmez.
 *   - client_id'nin bu tenant'a ait olduğu doğrulanır (clientBelongsToTenant).
 *   - analysisId, aynı client + canonical tenant kapsamıyla doğrulanır.
 *   - Storage object path SUNUCUDA üretilir: {tenantId}/{clientId}/{analysisId}.png.
 *   - Bucket PRIVATE — public URL üretilmez; okuma yalnız server-side service_role.
 *   - DB'ye deterministik object PATH yazılır (absolute public URL DEĞİL).
 *   - Auth/ownership BAŞARISIZSA storage/DB yan-etkisinden ÖNCE 401/403 döner.
 *   - Demo hesap: gerçek storage'a yazma yapılmaz.
 */

const BUCKET = "client-analysis-images";
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set(["image/png", "image/jpeg"]);

async function clientBelongsToTenant(
  db: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // 1) Kanonik kimlik + modül kapısı (herhangi bir yan-etkiden ÖNCE).
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  // 2) Demo hesap: gerçek storage'a yazma yapılmaz (mevcut davranış korunur).
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  // 3) İstek gövdesi (formData). tenantId GÖNDERİLSE BİLE güvenlik kararında kullanılmaz.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const analysisId = String(formData.get("analysisId") ?? "").trim();

  if (!file || !analysisId) {
    return NextResponse.json(
      { ok: false, error: "file ve analysisId gerekli." },
      { status: 400 },
    );
  }

  // 4) Dosya validasyonu — storage'a dokunmadan ÖNCE.
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { ok: false, error: "Dosya boyutu 10 MB'ı geçemez." },
      { status: 400 },
    );
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: "Yalnız PNG veya JPEG görseller yüklenebilir." },
      { status: 400 },
    );
  }

  // 5) Sahiplik zinciri: client → canonical tenant, sonra analysis → client + tenant.
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json(
      { ok: false, error: "Danışan bu hesaba ait değil." },
      { status: 403 },
    );
  }

  const { data: analysis, error: analysisErr } = await db
    .from("client_analyses")
    .select("id")
    .eq("id", analysisId)
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (analysisErr || !analysis) {
    return NextResponse.json(
      { ok: false, error: "Analiz kaydı doğrulanamadı." },
      { status: 403 },
    );
  }

  // 6) Server-generated object path — client path/tenant/owner belirleyemez.
  const storagePath = `${tenantId}/${clientId}/${analysisId}.png`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    console.error("[analyses/upload-image] upload:", uploadError.message);
    return NextResponse.json(
      { ok: false, error: "Görsel yüklenemedi." },
      { status: 500 },
    );
  }

  // 7) DB'ye deterministik object PATH yazılır (public URL üretilmez).
  const { error: updateErr } = await db
    .from("client_analyses")
    .update({ image_url: storagePath })
    .eq("id", analysisId)
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId);

  if (updateErr) {
    console.error("[analyses/upload-image] db update:", updateErr.message);
    return NextResponse.json(
      { ok: false, error: "Görsel kaydı güncellenemedi." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
