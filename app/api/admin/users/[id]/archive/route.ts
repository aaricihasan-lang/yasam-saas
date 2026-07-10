import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * /api/admin/users/[id]/archive — admin'in BAŞKA bir uzmanın personal_archives
 * kayıtlarını SALT OKUNUR görüntülemesi için güvenli server kapısı.
 *
 * Güvenlik / tenant izolasyonu:
 *   1. verifyAdminRequest → x-admin-id + x-session-token + binding + role=admin & active.
 *      (verifyUserRequest YETMEZ; o yalnızca çağıranın KENDİ tenant'ını döndürür.)
 *   2. Hedef tenant_id BODY/QUERY'den ALINMAZ → service_role ile users tablosundan
 *      [id] (hedef uzman) üzerinden okunur. Böylece admin yalnızca gerçek hedef
 *      uzmanın tenant'ını görür, istemci sahte tenant gönderemez.
 *   3. Tüm sorgular .eq("tenant_id", targetTenantId) ile bağlanır.
 *
 * Yazma işlemi YOK — admin arşiv ekranları salt okunurdur.
 *
 * Query:
 *   - (yok)               → hedef uzmanın tüm personal_archives kayıtları
 *   - ?archiveId=...      → tek kayıt (detay)
 *   - ?files=1&archiveIds=a,b,c → bu arşivlerin personal_archive_files satırları
 *   - ?files=1&archiveId=x      → tek arşivin personal_archive_files satırları
 *
 * Dosya modu (files=1): admin arşiv liste/detay ekranları eskiden bu satırları
 * TARAYICIDAN anon key ile okuyordu; artık verifyAdminRequest + service_role
 * üzerinden, hedef uzmanın tenant'ına .eq("tenant_id", targetTenantId) ile
 * bağlanarak gelir (anon-direct SELECT kaldırıldı). Salt okunur.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id: targetUserId } = await ctx.params;
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "Kullanıcı ID gerekli." }, { status: 400 });
  }

  // Hedef uzmanın tenant'ı SUNUCUDA çözülür (service_role) — istemciden gelmez.
  const { data: targetRow, error: targetErr } = await db
    .from("users")
    .select("id, tenant_id")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetErr || !targetRow) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  const targetTenantId = targetRow.tenant_id != null ? String(targetRow.tenant_id).trim() : "";
  if (!targetTenantId) {
    return NextResponse.json(
      { ok: false, error: "Uzman hesabında çalışma alanı (tenant) bilgisi bulunamadı." },
      { status: 404 },
    );
  }

  // ── Dosya modu: personal_archive_files (admin salt-okunur) ──
  // İki katmanlı IDOR guard:
  //   1) Parent sahiplik: istenen archive_id'ler personal_archives'ta hedef
  //      uzmanın targetTenantId'sine ait mi (sunucuda doğrulanır).
  //   2) Dosya sorgusu yalnız sahipliği doğrulanmış archive_id'lerle + tenant
  //      filtresiyle çalışır. Böylece yalnız tenant filtresine güvenilmez.
  if (req.nextUrl.searchParams.get("files")) {
    const singleId = req.nextUrl.searchParams.get("archiveId")?.trim() ?? "";
    const multiRaw = req.nextUrl.searchParams.get("archiveIds")?.trim() ?? "";
    // Tekil detay modu yalnız archiveId verildiğinde; çoğul verilirse çoğul kazanır.
    const isSingle = singleId.length > 0 && multiRaw.length === 0;

    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const MAX_IDS = 200;

    const raw = multiRaw || singleId;
    const requested = raw
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    if (requested.length === 0) return NextResponse.json({ ok: true, rows: [] });
    if (requested.length > MAX_IDS) {
      return NextResponse.json(
        { ok: false, error: "Çok fazla arşiv ID." },
        { status: 400 },
      );
    }
    if (requested.some((v) => !UUID_RE.test(v))) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz arşiv ID biçimi." },
        { status: 400 },
      );
    }
    const uniqueIds = Array.from(new Set(requested));

    // 1) Parent sahiplik doğrulaması — bu archive_id'ler hedef tenant'a mı ait?
    const { data: ownedRows, error: ownedErr } = await db
      .from("personal_archives")
      .select("id")
      .eq("tenant_id", targetTenantId)
      .in("id", uniqueIds);

    if (ownedErr) {
      return NextResponse.json({ ok: false, error: ownedErr.message }, { status: 500 });
    }
    const ownedIds = (ownedRows ?? []).map((r) => String(r.id));

    // Tekil detay: istenen arşiv hedef tenant'a ait değilse kontrollü 404.
    if (isSingle && ownedIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    }
    // Çoğul: sahipliği doğrulanmış arşiv yoksa geçerli boş sonuç.
    if (ownedIds.length === 0) return NextResponse.json({ ok: true, rows: [] });

    // 2) Dosya sorgusu yalnız sahipliği doğrulanmış id'ler + tenant filtresiyle.
    const { data, error } = await db
      .from("personal_archive_files")
      .select("id, archive_id, file_name, file_path, file_type, file_size, created_at")
      .eq("tenant_id", targetTenantId)
      .in("archive_id", ownedIds)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rows: data ?? [] });
  }

  const archiveId = req.nextUrl.searchParams.get("archiveId")?.trim() ?? "";

  if (archiveId) {
    const { data, error } = await db
      .from("personal_archives")
      .select("*")
      .eq("tenant_id", targetTenantId)
      .eq("id", archiveId)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
    return NextResponse.json({ ok: true, row: data });
  }

  const { data, error } = await db
    .from("personal_archives")
    .select("*")
    .eq("tenant_id", targetTenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}
