import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * Danışan silme — alt kayıt cascade temizliği (Faz 1E cleanup).
 *
 * Amaç: handleDeleteClient içindeki tarayıcı tarafı dinamik supabase.from(table)
 *       silme döngüsünü kaldırmak. Alt kayıt silme artık service_role'lü bu route'tan.
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token + token↔user_id binding.
 *   - tenant_id SUNUCUDA user kaydından alınır; client'tan gelen tenant_id'ye GÜVENİLMEZ.
 *   - client_id'nin bu tenant'a ait olduğu doğrulanır.
 *   - Tüm silmeler tenant_id + client_id kapsamıyla yapılır.
 *   - Demo hesap: hiçbir DB DELETE yapılmaz.
 *
 * NOT: Bu route artık TAM silme yapar — tüm alt kayıtlar + client_stones + ana
 *      `clients` kaydı silinir (C2-B1b: tarayıcı tarafı supabase silmeleri kaldırıldı).
 *      Tekil ve toplu danışan silme bu route üzerinden yürütülür.
 *
 * PERF-3: Alt tabloların çoğu clients'a ON DELETE CASCADE ile bağlı (production FK
 *      metadata ile doğrulandı). Bu tablolar için manuel DELETE kaldırıldı; tek ana
 *      `clients` DELETE'i DB içinde otomatik cascade tetikler:
 *        client_stones · client_stone_photos(→stones) · client_notes ·
 *        client_sessions · appointments · client_combinations.
 *      Yalnız clients'a FK'siz iki tablo (client_homeworks, client_analyses) manuel
 *      silinir; ayrıca storage dosyaları (DB cascade storage'a dokunmaz) manuel
 *      temizlenir. Bu üç bağımsız iş tek Promise.all'da paralel çalışır.
 */

// Taş fotoğrafları storage bucket'ı (StonesTab / stones route ile aynı).
const STONE_PHOTO_BUCKET = "stone-photos";

// clients'a FK'si BULUNMAYAN alt tablolar — ON DELETE CASCADE çalışmayacağından
// ana clients DELETE'inden önce manuel silinir (yetim kayıt bırakmamak için).
// Diğer alt tablolar (client_stones→client_stone_photos, client_notes, client_sessions,
// appointments, client_combinations) clients DELETE ile DB-içi CASCADE üzerinden silinir.
const MANUAL_DELETE_TABLES = ["client_homeworks", "client_analyses"] as const;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
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

  // O-6: taş fotoğraflarının storage dosya yollarını, DB satırları (clients CASCADE ile)
  // silinmeden ÖNCE topla → danışan silmede yetim storage dosyası kalmaz (tekil taş
  // silmeyle tutarlı). NOT: DB cascade yalnız satırları siler; storage'a dokunmaz.
  let photoPaths: string[] = [];
  const { data: photoRows, error: photoSelErr } = await db
    .from("client_stone_photos")
    .select("file_path")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (photoSelErr) {
    warnings.push(`client_stone_photos(select): ${photoSelErr.message}`);
  } else {
    photoPaths = (photoRows ?? [])
      .map((r) => (r as { file_path?: unknown }).file_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
  }

  // Bağımsız temizlik işleri paralel: FK'siz alt tablo DELETE'leri + storage remove.
  // Tek işin hatası tümünü bozmasın (orijinal davranışla uyumlu); hangisinin başarısız
  // olduğunu warnings ile raporla. Promise.all yalnız gerçek exception'da reject olur;
  // Supabase error nesnesi rejection değildir → her sonucun .error'ı ayrı kontrol edilir.
  const parallelOps: Array<PromiseLike<{ label: string; error: { message: string } | null }>> =
    MANUAL_DELETE_TABLES.map((table) =>
      db
        .from(table)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("client_id", clientId)
        .then(({ error }) => ({ label: table, error })),
    );
  if (photoPaths.length > 0) {
    parallelOps.push(
      db.storage
        .from(STONE_PHOTO_BUCKET)
        .remove(photoPaths)
        .then(({ error }) => ({ label: `storage(${STONE_PHOTO_BUCKET})`, error })),
    );
  }
  const results = await Promise.all(parallelOps);
  for (const r of results) {
    if (r.error) warnings.push(`${r.label}: ${r.error.message}`);
  }

  // Ana danışan kaydını sil (tam silme — tenant + id kapsamlı). Bu tek DELETE, CASCADE'li
  // alt tabloları (stones→photos satırları, notes, sessions, appointments, combinations)
  // DB içinde otomatik siler.
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
