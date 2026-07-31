/**
 * Faz 1/P1 — Ana yöneticinin uzman workspace görüntülemesi için ortak audit.
 *
 * Her workspace/özel-içerik görüntülemesi FAIL-CLOSED bir `workspace_viewed`
 * audit kaydı üretmelidir: kayıt yazılamazsa görüntüleme verisi DÖNDÜRÜLMEZ.
 *
 * context YALNIZ güvenli metadata taşır (hangi alan/modül, opsiyonel kayıt/danışan
 * id'si). Danışan PII'si (ad/e-posta/telefon) veya içerik ASLA yazılmaz — adminAudit
 * helper'ı yasaklı anahtarları zaten reddeder (fail-closed).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAdminAudit } from "@/lib/admin/adminAudit";

export type WorkspaceAuditResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function recordWorkspaceView(
  db: SupabaseClient,
  actorAdminId: string,
  targetUserId: string | null,
  area: string,
  extra?: Record<string, unknown>,
): Promise<WorkspaceAuditResult> {
  try {
    await writeAdminAudit(db, {
      actorAdminId,
      targetUserId,
      action: "workspace_viewed",
      actorIsMainAdmin: true,
      context: { area, ...(extra ?? {}) },
    });
    return { ok: true };
  } catch {
    // Ham hata/PII sızdırmadan fail-closed: görüntüleme kaydedilemezse veri gitmez.
    return { ok: false, status: 500, error: "Görüntüleme kaydı oluşturulamadı." };
  }
}
