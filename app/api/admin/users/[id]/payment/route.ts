import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { buildPaymentHistoryInsertPayload } from "@/lib/admin/userManagement";
import {
  diffPaymentFields,
  paymentFieldsFromRow,
  validatePaymentDraft,
  type ValidatedPayment,
} from "@/lib/admin/memberCommercial";
import { requireMainAdminForAdminTarget, resolveIsSuperAdmin } from "@/lib/admin/adminGuards";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { writeAdminAudit, AdminAuditError } from "@/lib/admin/adminAudit";
import { isUuid } from "@/lib/admin/memberRequestValidation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

const PAYMENT_ROW_SELECT =
  "id, role, payment_status, last_payment_date, next_payment_date, paid_amount, payment_note, agreed_fee, billing_period";

/**
 * POST /api/admin/users/[id]/payment — ödeme / ticari takip bilgilerini kaydet.
 *
 * AŞAMA 2 · §4.1 (M4) — yalnız admin'in elle tuttuğu kayıt; otomatik kilit/pasif, e-posta/SMS,
 * fatura/kart YOK. Sertleştirme:
 *   - 8 KB gövde sınırı + application/json (readLimitedJsonBody), UUID doğrulama.
 *   - Admin hedef → yalnız ana yönetici (requireMainAdminForAdminTarget).
 *   - SIKI doğrulama (validatePaymentDraft): durum allowlist (paid/pending/overdue/exempt/unknown),
 *     tarih YYYY-MM-DD, tutar/ücret ≥ 0, not uzunluğu, ödeme dönemi allowlist.
 *   - Yalnız DEĞİŞEN kolonlar yazılır; değişiklik yoksa DB'ye dokunulmaz (changed:false).
 *   - Geçmiş satırı (agreed_fee, billing_period, actor_admin_id dahil) yazılamazsa kullanıcı
 *     satırı ESKİ değerlerine geri alınır ve HATA döner (eski "ok + warning" davranışı YOK).
 *   - Audit `payment_status_changed`: yalnız değişen alan ADLARI (tutar/not DEĞERİ yazılmaz).
 *   - Ham DB hatası istemciye dönmez.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");

  const adminTarget = await requireMainAdminForAdminTarget(db, adminId, id);
  if (!adminTarget.ok) return bad(adminTarget.error, adminTarget.status);

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  for (const k of Object.keys(parsed.value)) {
    if (k !== "draft") return bad("Beklenmeyen alan.");
  }

  const v = validatePaymentDraft(parsed.value.draft);
  if (!v.ok) return bad(v.error);
  const next = v.value;

  const { data: currentRow, error: readErr } = await db
    .from("users")
    .select(PAYMENT_ROW_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (readErr) return bad("Ödeme bilgisi okunamadı.", 500);
  if (!currentRow) return bad("Kullanıcı bulunamadı.", 404);

  const rawRow = currentRow as unknown as Record<string, unknown>;
  const before = paymentFieldsFromRow(rawRow);
  const changed = diffPaymentFields(before, next);
  if (changed.length === 0) {
    return NextResponse.json({ ok: true, changed: false }, { headers: NO_STORE });
  }

  // Yalnız değişen kolonlar (değişmeyen legacy değer — ör. literal 'undefined' durum — yeniden yazılmaz).
  const updatePayload: Partial<ValidatedPayment> = {};
  for (const f of changed) (updatePayload as Record<string, unknown>)[f] = next[f];

  const { error: userErr } = await db.from("users").update(updatePayload).eq("id", id);
  if (userErr) return bad("Ödeme güncellenemedi.", 500);

  // Geçmiş: kaydedilen SON durumun anlık görüntüsü (değişmeyen alanlar mevcut ham değerle).
  const finalState: Record<string, unknown> = { ...rawRow, ...updatePayload };
  const { error: histErr } = await db
    .from("user_payment_history")
    .insert(buildPaymentHistoryInsertPayload(id, finalState, adminId));

  if (histErr) {
    // Telafi: kullanıcı satırını ESKİ ham değerlerine döndür (geçmişsiz değişiklik kalmasın).
    const revert: Record<string, unknown> = {};
    for (const f of changed) revert[f] = rawRow[f] ?? null;
    const { error: revertErr } = await db.from("users").update(revert).eq("id", id);
    return bad(
      revertErr
        ? "Ödeme kaydı tamamlanamadı. Lütfen sayfayı yenileyip tekrar deneyin."
        : "Ödeme geçmişi kaydedilemediği için değişiklik uygulanmadı. Lütfen tekrar deneyin.",
      500,
    );
  }

  try {
    const actorIsMainAdmin = await resolveIsSuperAdmin(db, adminId);
    await writeAdminAudit(db, {
      actorAdminId: adminId,
      action: "payment_status_changed",
      targetUserId: id,
      actorIsMainAdmin,
      // Yalnız alan ADLARI — tutar, tarih, not DEĞERİ yazılmaz.
      context: { fields: changed },
    });
  } catch (e) {
    if (e instanceof AdminAuditError) return bad("İşlem kaydı oluşturulamadı.", 500);
    throw e;
  }

  return NextResponse.json({ ok: true, changed: true, fields: changed }, { headers: NO_STORE });
}
