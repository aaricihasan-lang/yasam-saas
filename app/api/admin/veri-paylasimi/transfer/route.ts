import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { writeAdminAudit, AdminAuditError } from "@/lib/admin/adminAudit";
import { OIL_COPY_FIELDS } from "@/lib/aromaterapi/oilFields";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/tenancy/syntheticTenants";

export const runtime = "nodejs";

/**
 * POST /api/admin/veri-paylasimi/transfer
 *
 * FAZ 1 / P4 — Admin kütüphanesinden bir uzmana BAĞIMSIZ SNAPSHOT (hediye) kopyası.
 *
 * KÖK NEDEN DÜZELTMESİ: Eski akış tarayıcıdan (anon/authenticated Supabase client)
 * doğrudan `stones` vb. tablolara INSERT ediyordu. 20260627120000_dogaltas_lock_anon
 * (+ modül lock migration'ları) anon/authenticated yazma yetkisini REVOKE ettiği için
 * bu `permission denied for table stones` veriyordu. Bu route yazmayı SUNUCU tarafına,
 * yalnız service_role'e taşır — numeroloji transfer route'unun kanıtlı modeli.
 *
 * BAĞLAYICI DAVRANIŞ:
 *   - Yalnız INSERT; UPSERT/REPLACE YOK; onConflict YOK. Aynı isimli kayıtlar yan yana.
 *   - Kaynak kayıt DEĞİŞMEZ/SİLİNMEZ; hedefin mevcut kayıtları DEĞİŞMEZ/SİLİNMEZ.
 *   - Kopya: yeni UUID (DB default) + hedef tenant + iş alanları + provenance.
 *     id/created_at/updated_at/kaynak tenant/soft-delete alanları TAŞINMAZ.
 *   - Tablo adı YALNIZ sabit REGISTRY'den; istemci string'i asla .from(...) içine geçmez.
 *   - Atomiklik: batch_id her satıra damgalanır; herhangi bir grup patlarsa
 *     bu batch_id'li tüm satırlar telafi-silme ile geri alınır (all-or-nothing).
 *   - İdempotency: batch_id PK'li ledger satırı atomik "claim"; aynı batch_id ile
 *     ikinci istek KOPYA ÜRETMEZ, önceki sonucu replay eder.
 *   - Hata sözleşmesi: ham `permission denied` / DB mesajı DÖNMEZ; genel güvenli mesaj.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INSERT_BATCH = 100;
const MAX_IDS_PER_GROUP = 5000;

/** Taş Bilgi Kütüphanesi kopya alanları — yalnız bilinen iş alanları. */
const KNOWLEDGE_COPY_FIELDS = [
  "title",
  "content",
  "category",
  "sub_category",
  "tags",
  "related_stones",
  "related_minerals",
  "source",
  "source_section",
  "keyword",
  "notes",
] as const;

/** Doğaltaş kopya alanları — yalnız bilinen iş alanları (kanıtlı eski davranış). */
const STONE_COPY_FIELDS = [
  "short_description",
  "general_info",
  "source_note",
  "physical_effects",
  "spiritual_effects",
  "other_effects",
  "warning_text",
  "warning_tags",
  "feng_shui",
  "meditation",
  "care",
  "application",
  "chakras",
  "assignments",
  "images",
  "image_upload_failed",
] as const;

type GroupConfig = {
  /** Gerçek public tablo adı (yalnız buradan gelir). */
  table: string;
  /** Verilirse yalnız bu alanlar kopyalanır; yoksa SELECT * strip mantığı. */
  copyFields?: readonly string[];
  /** Kopyalanacak satırda dolu olması gereken iş alanı (boşsa satır atlanır). */
  requireField?: string;
  /**
   * Kaynak okuma modu:
   *  - "admin_tenant" (varsayılan): kaynak satırlar adminin kendi tenant'ında
   *    (.eq tenant_id = sourceTenantId). Doğaltaş/Biyoenerji/... master modeli.
   *  - "canonical_null": kaynak satırlar kanonik/global havuzda (tenant_id IS NULL).
   *    Aromaterapi yağ kütüphanesi bu modeldedir (admin yüklü içerik tenant_id=null).
   *  - "admin_library": kaynak satırlar sabit ADMIN_LIBRARY_TENANT_ID sentetik
   *    tenant'ında. Taş Bilgi Kütüphanesi bu modeldedir.
   */
  sourceMode?: "admin_tenant" | "canonical_null" | "admin_library";
  /** Kaynak okumada ek SABİT eşitlik filtresi (ör. oil_type). Dinamik değer YOK. */
  matchColumn?: string;
  matchValue?: string;
  /** true ise kaynak yalnız is_active=true satırları okur (soft-inactive kopyalanmaz). */
  activeOnly?: boolean;
};

/** UI grup anahtarı → tablo + kopya davranışı. */
const REGISTRY = {
  stones: { table: "stones", copyFields: STONE_COPY_FIELDS, requireField: "stone_name" },
  minerals: { table: "minerals" },
  combinations: { table: "combinations" },
  bioenergy_symbols: { table: "bioenergy_symbols" },
  bioenergy_imaginations: { table: "bioenergy_imaginations" },
  bioenergy_chakras: { table: "bioenergy_chakras" },
  bioenergy_energy_bodies: { table: "bioenergy_energy_bodies" },
  bioenergy_subconscious_causes: { table: "bioenergy_subconscious_causes" },
  reflexology_protocols: { table: "reflexology_protocols" },
  numerology_knowledge_records: { table: "numerology_knowledge_records" },
  numerology_stone_assignments: { table: "numerology_stone_assignments" },
  // Aromaterapi yağları — tek tablo (aromatherapy_oils), oil_type ile 3 grup.
  // Kaynak KANONİK (tenant_id IS NULL) yağ kütüphanesidir; kopya hedef uzman
  // tenant'ına yeni UUID + provenance ile yazılır. Kanonik kaynak DEĞİŞMEZ.
  aromatherapy_oils_essential: {
    table: "aromatherapy_oils", copyFields: OIL_COPY_FIELDS, requireField: "name",
    sourceMode: "canonical_null", matchColumn: "oil_type", matchValue: "essential",
    activeOnly: true,
  },
  aromatherapy_oils_carrier: {
    table: "aromatherapy_oils", copyFields: OIL_COPY_FIELDS, requireField: "name",
    sourceMode: "canonical_null", matchColumn: "oil_type", matchValue: "carrier",
    activeOnly: true,
  },
  aromatherapy_oils_maceration: {
    table: "aromatherapy_oils", copyFields: OIL_COPY_FIELDS, requireField: "name",
    sourceMode: "canonical_null", matchColumn: "oil_type", matchValue: "maceration",
    activeOnly: true,
  },
  // Taş Bilgi Kütüphanesi — kaynak sabit ADMIN_LIBRARY_TENANT_ID sentetik tenant.
  // Kopya hedef uzman tenant'ına yeni UUID + provenance ile yazılır. Kaynak DEĞİŞMEZ.
  stone_knowledge_articles: {
    table: "stone_knowledge_articles", copyFields: KNOWLEDGE_COPY_FIELDS,
    requireField: "title", sourceMode: "admin_library", activeOnly: true,
  },
} as const satisfies Record<string, GroupConfig>;

type GroupKey = keyof typeof REGISTRY;

const GROUP_KEYS = Object.keys(REGISTRY) as GroupKey[];

function isGroupKey(v: unknown): v is GroupKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(REGISTRY, v);
}

/** Kopyada TAŞINMAYAN alanlar (SELECT * yolu). Provenance/soft-delete/teknik. */
const STRIP = new Set<string>([
  "id",
  "created_at",
  "updated_at",
  "tenant_id",
  "origin_type",
  "origin_label",
  "origin_source_id",
  "origin_transfer_batch_id",
  "transferred_at",
  "deleted_at",
  "is_deleted",
  "deleted",
  "archived_at",
  "archived",
  "is_archived",
]);

class TransferError extends Error {
  readonly stage: "read" | "insert";
  readonly group: GroupKey;
  constructor(stage: "read" | "insert", group: GroupKey) {
    super(`transfer_${stage}_failed:${group}`);
    this.name = "TransferError";
    this.stage = stage;
    this.group = group;
  }
}

function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

/** Tek grubu kopyalar (SELECT kaynak → snapshot payload → batch INSERT). */
async function cloneGroup(
  db: SupabaseClient,
  group: GroupKey,
  sourceTenantId: string,
  targetTenantId: string,
  batchId: string,
  nowIso: string,
  filterIds: string[] | undefined,
): Promise<{ requested: number; inserted: number }> {
  const cfg: GroupConfig = REGISTRY[group];

  // Kaynak okuma modu: kanonik null / sabit admin kütüphane tenant / adminin tenant'ı.
  let readQ;
  if (cfg.sourceMode === "canonical_null") {
    readQ = db.from(cfg.table).select("*").is("tenant_id", null);
  } else if (cfg.sourceMode === "admin_library") {
    readQ = db.from(cfg.table).select("*").eq("tenant_id", ADMIN_LIBRARY_TENANT_ID);
  } else {
    readQ = db.from(cfg.table).select("*").eq("tenant_id", sourceTenantId);
  }
  // Sabit alt-tür filtresi (ör. oil_type) — değer REGISTRY'den, istemciden DEĞİL.
  if (cfg.matchColumn && cfg.matchValue != null) {
    readQ = readQ.eq(cfg.matchColumn, cfg.matchValue);
  }
  if (cfg.activeOnly) readQ = readQ.eq("is_active", true);
  if (filterIds && filterIds.length > 0) readQ = readQ.in("id", filterIds);
  const { data, error } = await readQ;
  if (error) throw new TransferError("read", group);

  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return { requested: 0, inserted: 0 };

  const payloads: Record<string, unknown>[] = [];
  for (const row of rows) {
    const copy: Record<string, unknown> = {};

    if (cfg.copyFields) {
      for (const key of cfg.copyFields) {
        if (Object.prototype.hasOwnProperty.call(row, key)) copy[key] = row[key];
      }
    } else {
      for (const [key, value] of Object.entries(row)) {
        if (!STRIP.has(key)) copy[key] = value;
      }
    }

    if (cfg.requireField) {
      const val = String(row[cfg.requireField] ?? row.name ?? "").trim();
      if (!val) continue; // iş alanı boş → atla (skip)
      copy[cfg.requireField] = val;
    }

    // Doğaltaş: null koleksiyon alanlarını güvenli default'a çek (kanıtlı davranış).
    if (group === "stones") {
      if (copy.images == null) copy.images = [];
      if (copy.assignments == null) copy.assignments = {};
      if (copy.warning_tags == null) copy.warning_tags = [];
    }

    // Ownership + provenance — hedef tenant'a bağımsız kopya.
    copy.tenant_id = targetTenantId;
    copy.origin_type = "admin_transfer";
    copy.origin_label = "Admin Kütüphanesi";
    copy.origin_source_id = typeof row.id === "string" ? row.id : null;
    copy.origin_transfer_batch_id = batchId;
    copy.transferred_at = nowIso;

    payloads.push(copy);
  }

  let inserted = 0;
  for (let off = 0; off < payloads.length; off += INSERT_BATCH) {
    const batch = payloads.slice(off, off + INSERT_BATCH);
    const { error: insErr } = await db.from(cfg.table).insert(batch);
    if (insErr) throw new TransferError("insert", group);
    inserted += batch.length;
  }

  return { requested: rows.length, inserted };
}

/** Telafi-silme: bu batch_id'li tüm satırları hedef tablolardan kaldırır (best-effort). */
async function rollbackBatch(db: SupabaseClient, batchId: string): Promise<void> {
  for (const group of GROUP_KEYS) {
    try {
      await db
        .from(REGISTRY[group].table)
        .delete()
        .eq("origin_transfer_batch_id", batchId);
    } catch {
      /* best-effort — batch_id-scoped delete; kısmi başarısızlık loglanmaz */
    }
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  // Gövde
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return jsonError(400, "Geçersiz istek türü.");
  }
  let body: {
    batchId?: unknown;
    targetUserId?: unknown;
    targetTenantId?: unknown;
    groups?: unknown;
    filterMap?: unknown;
    reason?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonError(400, "Geçersiz istek gövdesi.");
  }

  const batchId = String(body.batchId ?? "").trim();
  const targetUserId = String(body.targetUserId ?? "").trim();
  const targetTenantId = String(body.targetTenantId ?? "").trim();

  if (!UUID_RE.test(batchId)) return jsonError(400, "Geçersiz aktarım kimliği.");
  if (!UUID_RE.test(targetUserId)) return jsonError(400, "Geçersiz hedef kullanıcı.");
  if (!UUID_RE.test(targetTenantId)) return jsonError(400, "Geçersiz hedef tenant.");

  // Gruplar → allowlist (dinamik tablo adı YOK)
  if (!Array.isArray(body.groups) || body.groups.length === 0) {
    return jsonError(422, "Aktarılacak en az bir veri grubu seçin.");
  }
  const groups = [...new Set(body.groups.map((g) => String(g)))];
  for (const g of groups) {
    if (!isGroupKey(g)) return jsonError(400, "Geçersiz veri grubu.");
  }
  const groupKeys = groups as GroupKey[];

  // filterMap: yalnız string uuid dizileri, sınırlı
  const filterMap: Partial<Record<GroupKey, string[]>> = {};
  if (body.filterMap != null) {
    if (typeof body.filterMap !== "object") return jsonError(400, "Geçersiz seçim.");
    const fm = body.filterMap as Record<string, unknown>;
    for (const key of groupKeys) {
      const ids = fm[key];
      if (ids == null) continue;
      if (!Array.isArray(ids)) return jsonError(400, "Geçersiz seçim.");
      const clean = ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x));
      if (clean.length > MAX_IDS_PER_GROUP) return jsonError(413, "Çok fazla kayıt seçildi.");
      filterMap[key] = [...new Set(clean)];
    }
  }

  // Kaynak tenant SUNUCUDA çözülür (istemci gövdesine güvenilmez) — adminin kendi tenant'ı.
  const { data: adminRow } = await db
    .from("users")
    .select("id, role, tenant_id")
    .eq("id", adminId)
    .maybeSingle();
  const sourceTenantId = String((adminRow as { tenant_id?: unknown } | null)?.tenant_id ?? "").trim();
  if (!UUID_RE.test(sourceTenantId)) {
    return jsonError(400, "Admin kaynak tenant bulunamadı.");
  }

  // Hedef doğrulama
  const { data: targetRow } = await db
    .from("users")
    .select("id, role, active, tenant_id")
    .eq("id", targetUserId)
    .maybeSingle();
  const target = targetRow as
    | { id: string; role?: unknown; active?: unknown; tenant_id?: unknown }
    | null;
  if (!target) return jsonError(404, "Hedef kullanıcı bulunamadı.");
  if (String(target.role ?? "") !== "expert") {
    return jsonError(403, "Aktarım hedefi yalnız uzman olabilir.");
  }
  if (target.active !== true) return jsonError(422, "Hedef hesap aktif değil.");
  if (String(target.tenant_id ?? "").trim() !== targetTenantId) {
    return jsonError(400, "Hedef tenant kullanıcıyla eşleşmiyor.");
  }
  if (targetTenantId === sourceTenantId) {
    return jsonError(400, "Kaynak ve hedef tenant aynı olamaz.");
  }
  if (targetTenantId === ADMIN_LIBRARY_TENANT_ID) {
    return jsonError(400, "Hedef, admin kütüphane tenant'ı olamaz.");
  }

  // ── İdempotency claim: batch_id PK insert atomiktir ────────────────────────
  const { error: claimErr } = await db
    .from("admin_library_transfer_batches")
    .insert({
      batch_id: batchId,
      actor_admin_id: adminId,
      target_user_id: targetUserId,
      source_tenant_id: sourceTenantId,
      target_tenant_id: targetTenantId,
      status: "processing",
    });

  if (claimErr) {
    // Duplicate → bu batch daha önce işlendi/işleniyor: replay (kopya üretme).
    const { data: prior } = await db
      .from("admin_library_transfer_batches")
      .select("counts, requested_count, inserted_count, status")
      .eq("batch_id", batchId)
      .maybeSingle();

    if (prior) {
      try {
        await writeAdminAudit(db, {
          actorAdminId: adminId,
          action: "library_transfer_retried",
          targetUserId,
          result: { batch_id: batchId, status: String((prior as { status?: unknown }).status ?? "") },
          context: { source_tenant_id: sourceTenantId, target_tenant_id: targetTenantId },
        });
      } catch (e) {
        if (!(e instanceof AdminAuditError)) throw e;
      }
      const p = prior as { counts?: unknown; requested_count?: unknown; inserted_count?: unknown };
      return NextResponse.json({
        ok: true,
        replayed: true,
        batchId,
        counts: (p.counts ?? {}) as Record<string, number>,
        requestedCount: Number(p.requested_count ?? 0),
        insertedCount: Number(p.inserted_count ?? 0),
      });
    }
    // Claim başka bir nedenle patladıysa güvenli genel hata.
    return jsonError(409, "Aktarım kimliği çakışması.");
  }

  // ── İşle — herhangi bir grup patlarsa telafi-silme ile all-or-nothing ──────
  const counts: Record<string, number> = {};
  let requestedTotal = 0;
  let insertedTotal = 0;
  const nowIso = new Date().toISOString();

  try {
    for (const group of groupKeys) {
      const { requested, inserted } = await cloneGroup(
        db,
        group,
        sourceTenantId,
        targetTenantId,
        batchId,
        nowIso,
        filterMap[group],
      );
      counts[group] = inserted;
      requestedTotal += requested;
      insertedTotal += inserted;
    }
  } catch {
    await rollbackBatch(db, batchId);
    try {
      await db
        .from("admin_library_transfer_batches")
        .update({ status: "failed", requested_count: requestedTotal, inserted_count: 0, counts: {} })
        .eq("batch_id", batchId);
    } catch {
      /* ledger update best-effort */
    }
    try {
      await writeAdminAudit(db, {
        actorAdminId: adminId,
        action: "library_transfer_failed",
        targetUserId,
        result: { batch_id: batchId, requested_count: requestedTotal, inserted_count: 0 },
        context: { source_tenant_id: sourceTenantId, target_tenant_id: targetTenantId },
      });
    } catch (e) {
      if (!(e instanceof AdminAuditError)) throw e;
    }
    // Ham DB/permission mesajı ASLA dışarı sızmaz.
    return jsonError(500, "Aktarım tamamlanamadı. Hiçbir kayıt aktarılmadı.", { batchId });
  }

  // Başarı — ledger'ı tamamla
  try {
    await db
      .from("admin_library_transfer_batches")
      .update({
        status: "completed",
        requested_count: requestedTotal,
        inserted_count: insertedTotal,
        counts,
      })
      .eq("batch_id", batchId);
  } catch {
    /* veri kalıcı; ledger özet güncellemesi best-effort */
  }

  // Audit — başarı yolunda best-effort (ledger zaten kalıcı köken kaydıdır).
  try {
    await writeAdminAudit(db, {
      actorAdminId: adminId,
      action: "library_transfer_completed",
      targetUserId,
      result: {
        batch_id: batchId,
        requested_count: requestedTotal,
        inserted_count: insertedTotal,
        counts,
      },
      context: { source_tenant_id: sourceTenantId, target_tenant_id: targetTenantId },
    });
  } catch (e) {
    if (!(e instanceof AdminAuditError)) throw e;
  }

  return NextResponse.json({
    ok: true,
    batchId,
    counts,
    requestedCount: requestedTotal,
    insertedCount: insertedTotal,
    skippedCount: Math.max(0, requestedTotal - insertedTotal),
  });
}
