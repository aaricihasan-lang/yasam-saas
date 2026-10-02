import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { pickProtocolContentFields } from "@/lib/refleksoloji/protocolDto";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import {
  PROTOCOL_DELETED_ERROR,
  decideProtocolCas,
  decideProtocolMissingRow,
  protocolRowVersion,
} from "@/lib/refleksoloji/protocolSyncCore";
import { protocolContentUnchanged } from "@/lib/refleksoloji/usageChange";
import { trackUsage } from "@/lib/usage/trackUsage";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/protocols/by-uid/[uid] — protokolü istemci `source_uid`'i
 * üzerinden güncelle/sil (P1-2 — Protokol Haritası düzenleme/silme senkronu).
 *
 * BAĞLAM:
 *   Protokol Haritası kayıtları localStorage'da istemci-üretimli `id` ile tutulur;
 *   sunucudaki satır ise ayrı bir uuid `id` + `source_uid = <local id>` taşır.
 *   Kayıtlı Protokoller server `id`'siyle çalışır; Protokol Haritası ise yalnız
 *   local id'yi (= source_uid) bilir. Bu route düzenleme/silmeyi source_uid ile
 *   eşleştirir → iki depo (localStorage ↔ server) sapması kapanır (zombie protokol).
 *
 * Güvenlik:
 *   - requireModuleAccess → x-user-id + x-session-token binding.
 *   - tenant_id SUNUCUDA session'dan; body/query'den GÜVENİLMEZ.
 *   - Tüm sorgular tenant_id + source_uid ile bağlanır (IDOR engellenir).
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 *
 * FA-42 (eşzamanlılık): PUT gövdesi `expected_updated_at` (istemcinin bildiği
 *   `raw_json.updatedAt`) taşırsa sunucudaki sürümle eşleşmesi gerekir; aksi halde
 *   409 PROTOCOL_STALE (başka cihazdaki düzenleme körlemesine ezilmez). Tabloda
 *   updated_at kolonu olmadığından belirteç raw_json.updatedAt'tir (migration yok).
 */

// ─── PUT /api/refleksoloji/protocols/by-uid/[uid] — güncelle (yoksa oluştur) ────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { uid } = await params;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "source_uid gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, protocol: null });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  // Mass-assignment koruması: yalnız kullanıcı-düzenlenebilir içerik alanları.
  // tenant_id + source_uid oturumdan/param'dan; id/created_at/updated_at ve köken
  // (origin_*) alanları İSTEMCİDEN kabul EDİLMEZ.
  const fields = pickProtocolContentFields(body);
  const expected =
    typeof body.expected_updated_at === "string" && body.expected_updated_at.length > 0
      ? body.expected_updated_at
      : null;

  // FA-42: iyimser eşzamanlılık — mevcut satırın sürüm belirteci.
  let currentVersion: string | null = null;
  // USAGE360: CAS okumasındaki mevcut içerik → yalnız GERÇEK değişiklik sayılır (senkron
  // tekrarı / aynı içeriği yeniden kaydetme olay üretmez). İçerik kolonları yalnız bu
  // karşılaştırma için okunur; yazma yolu değişmez.
  let usageCurrentRow: Record<string, unknown> | null = null;
  if (expected) {
    const { data: curRows, error: curErr } = await db
      .from("reflexology_protocols")
      .select("id, title, target_problem, organs, application_notes, raw_json")
      .eq("tenant_id", tenantId)
      .eq("source_uid", uid)
      .limit(2);
    if (curErr) {
      return jsonServerError("protocols.by-uid.PUT.read", curErr, { usage: { guard, req, failedAction: "record_updated", subEntity: "protocol" } });
    }
    const cur = (curRows ?? [])[0] as ({ id: string; raw_json: unknown } & Record<string, unknown>) | undefined;
    if (cur) {
      usageCurrentRow = cur;
      currentVersion = protocolRowVersion(cur.raw_json);
      const decision = decideProtocolCas(expected, currentVersion);
      if (!decision.ok) {
        await trackUsage(guard, req, { module: "reflexology", action: "action_failed", failedAction: "record_updated", subEntity: "protocol", errorClass: "conflict" });
        return NextResponse.json(
          {
            ok: false,
            conflict: true,
            code: decision.code,
            error: "Protokol başka bir cihazda değiştirilmiş. Güncel hâlini yükleyip tekrar deneyin.",
          },
          { status: 409 },
        );
      }
    }
  }

  // Güncelle (tenant + source_uid [+ sürüm belirteci] eşleşen satır).
  let updQuery = db
    .from("reflexology_protocols")
    .update(fields)
    .eq("tenant_id", tenantId)
    .eq("source_uid", uid);
  if (expected && currentVersion) {
    // Okuma→yazma yarışını da kapat: belirteç hâlâ aynıysa yaz.
    updQuery = updQuery.eq("raw_json->>updatedAt", currentVersion);
  }
  const { data: updated, error: updErr } = await updQuery.select();

  if (updErr) {
    return jsonServerError("protocols.by-uid.PUT.update", updErr, { usage: { guard, req, failedAction: "record_updated", subEntity: "protocol" } });
  }
  if (expected && currentVersion && (!updated || updated.length === 0)) {
    await trackUsage(guard, req, { module: "reflexology", action: "action_failed", failedAction: "record_updated", subEntity: "protocol", errorClass: "conflict" });
    return NextResponse.json(
      {
        ok: false,
        conflict: true,
        code: "PROTOCOL_STALE",
        error: "Protokol başka bir cihazda değiştirilmiş. Güncel hâlini yükleyip tekrar deneyin.",
      },
      { status: 409 },
    );
  }

  // Hiç satır güncellenmediyse:
  //   - istemci bir sunucu sürümüne dayanıyordu (expected VAR) → satır başka cihazda
  //     SİLİNMİŞ → RF-09: 409 PROTOCOL_DELETED (bayat düzenleme silinen protokolü DİRİLTMEZ)
  //   - expected YOK → bu cihazda oluşturulmuş ama sunucuya hiç gitmemiş kayıt → ekle
  //     (düzenleme de veri kaybetmez).
  if (!updated || updated.length === 0) {
    const missing = decideProtocolMissingRow(expected);
    if (missing.kind === "conflict") {
      await trackUsage(guard, req, { module: "reflexology", action: "action_failed", failedAction: "record_updated", subEntity: "protocol", errorClass: "conflict" });
      return NextResponse.json(
        { ok: false, conflict: true, code: missing.code, error: PROTOCOL_DELETED_ERROR },
        { status: 409 },
      );
    }
    const { data: inserted, error: insErr } = await db
      .from("reflexology_protocols")
      .insert({ ...fields, tenant_id: tenantId, source_uid: uid })
      .select()
      .single();

    if (insErr) {
      return jsonServerError("protocols.by-uid.PUT.insert", insErr, { usage: { guard, req, failedAction: "record_updated", subEntity: "protocol" } });
    }
    // USAGE360: sunucuda satır yoktu → gerçek yol YENİ kayıt (kaynak başına tek sayılır).
    const insertedId = (inserted as { id?: unknown } | null)?.id;
    await trackUsage(guard, req, {
      module: "reflexology",
      action: "record_created",
      subEntity: "protocol",
      resourceId: insertedId != null ? String(insertedId) : `uid:${uid}`,
    });
    return NextResponse.json({ ok: true, protocol: inserted, created: true });
  }

  // USAGE360: yalnız içerik GERÇEKTEN değiştiyse. CAS okuması yoksa (expected'sız eski
  // istemci) karşılaştırma yapılamaz → resourceId = sunucu id → 60 sn kova dedup.
  if (!(usageCurrentRow && protocolContentUnchanged(usageCurrentRow, fields as Record<string, unknown>))) {
    const updatedId = (updated[0] as { id?: unknown }).id;
    await trackUsage(guard, req, {
      module: "reflexology",
      action: "record_updated",
      subEntity: "protocol",
      resourceId: updatedId != null ? String(updatedId) : `uid:${uid}`,
    });
  }
  return NextResponse.json({ ok: true, protocol: updated[0], updated: updated.length });
}

// ─── DELETE /api/refleksoloji/protocols/by-uid/[uid] ───────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;

  const { uid } = await params;
  if (!uid) {
    return NextResponse.json({ ok: false, error: "source_uid gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;

  if (is_demo_account) {
    return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  }

  const { data, error } = await db
    .from("reflexology_protocols")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("source_uid", uid)
    .select("id");

  if (error) {
    return jsonServerError("protocols.by-uid.DELETE", error, { usage: { guard, req, failedAction: "record_deleted", subEntity: "protocol" } });
  }

  const deleted = data?.length ?? 0;
  // USAGE360: yalnız gerçekten silinen satır varsa (tekrarlanan silme senkronu 0 → olay yok).
  if (deleted > 0) {
    const deletedId = (data?.[0] as { id?: unknown } | undefined)?.id;
    await trackUsage(guard, req, {
      module: "reflexology",
      action: "record_deleted",
      subEntity: "protocol",
      resourceId: deletedId != null ? String(deletedId) : `uid:${uid}`,
      ...(deleted > 1 ? { itemCount: deleted } : {}),
    });
  }
  return NextResponse.json({ ok: true, deleted });
}
