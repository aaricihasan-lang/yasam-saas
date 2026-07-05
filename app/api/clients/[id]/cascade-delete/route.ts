import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * Danışan silme — alt kayıt cascade temizliği (Faz 1E cleanup).
 *
 * Amaç: handleDeleteClient içindeki tarayıcı tarafı dinamik supabase.from(table)
 *       silme döngüsünü kaldırmak. Alt kayıt silme artık service_role'lü bu route'tan.
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA user kaydından alınır; client'tan gelen tenant_id'ye GÜVENİLMEZ.
 *   - client_id'nin bu tenant'a ait olduğu doğrulanır.
 *   - Tüm silmeler tenant_id + client_id kapsamıyla yapılır.
 *   - Demo hesap: hiçbir DB DELETE yapılmaz.
 *
 * NOT: Bu route artık TAM silme yapar — tüm alt kayıtlar + client_stones + ana
 *      `clients` kaydı silinir (C2-B1b: tarayıcı tarafı supabase silmeleri kaldırıldı).
 *      Tekil ve toplu danışan silme bu route üzerinden yürütülür.
 */

// Taş fotoğrafları storage bucket'ı (StonesTab / stones route ile aynı).
const STONE_PHOTO_BUCKET = "stone-photos";

// Silinecek alt tablolar — fotoğraflar taş kayıtlarından önce silinir (FK güvenliği).
const CHILD_TABLES = [
  "client_stone_photos",
  "client_stones",
  "client_notes",
  "client_sessions",
  "client_homeworks",
  "appointments",
  "client_analyses",
  "client_combinations",
] as const;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  // Demo hesap: hiçbir DB DELETE yapılmaz.
  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true });
  }

  // client_id gerçekten bu tenant'a mı ait?
  const { data: cli, error: cliErr } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (cliErr || !cli) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  const warnings: string[] = [];

  // O-6: taş fotoğraflarının storage dosyalarını, DB satırları silinmeden ÖNCE temizle
  // → danışan silmede de yetim storage dosyası kalmaz (tekil taş silmeyle tutarlı).
  const { data: photoRows, error: photoSelErr } = await db
    .from("client_stone_photos")
    .select("file_path")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (photoSelErr) {
    warnings.push(`client_stone_photos(select): ${photoSelErr.message}`);
  } else {
    const paths = (photoRows ?? [])
      .map((r) => (r as { file_path?: unknown }).file_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (paths.length > 0) {
      const { error: storageError } = await db.storage.from(STONE_PHOTO_BUCKET).remove(paths);
      if (storageError) warnings.push(`storage(stone-photos): ${storageError.message}`);
    }
  }

  // Alt kayıtları sil. Tek tablonun hatası tümünü bozmasın (orijinal davranışla uyumlu),
  // ama hangilerinin başarısız olduğunu raporla.
  for (const table of CHILD_TABLES) {
    const { error } = await db
      .from(table)
      .delete()
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId);
    if (error) warnings.push(`${table}: ${error.message}`);
  }

  // Ana danışan kaydını sil (tam silme — tenant + id kapsamlı).
  const { error: clientDelErr } = await db
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("tenant_id", tenantId);

  if (clientDelErr) {
    return NextResponse.json(
      { ok: false, error: clientDelErr.message, warnings },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, warnings });
}
