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
 * NOT: Ana `clients` kaydı ve `client_stones` bu route'un kapsamı dışındadır;
 *      onlar çağıran tarafça yönetilir (bu cleanup'ın hedefi dinamik .from(table) döngüsüdür).
 */

// Silinecek alt tablolar — fotoğraflar taş kayıtlarından önce silinir (FK güvenliği).
const CHILD_TABLES = [
  "client_stone_photos",
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

  // Alt kayıtları sil. Tek tablonun hatası tümünü bozmasın (orijinal davranışla uyumlu),
  // ama hangilerinin başarısız olduğunu raporla.
  const warnings: string[] = [];
  for (const table of CHILD_TABLES) {
    const { error } = await db
      .from(table)
      .delete()
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId);
    if (error) warnings.push(`${table}: ${error.message}`);
  }

  return NextResponse.json({ ok: true, warnings });
}
