/**
 * Şifa Rehberi V2 — sunucu servisi (kalıcı kayıt). Veritabanına YALNIZ sifa_v2_* fonksiyonlarıyla
 * erişir (Supabase RPC veya doğrudan pg; aynı imza).
 *
 * Kapsam (Owner kararı, 7. aşama):
 *  - KİŞİSEL kayıt: yalnız sahibi uzman görür/yazar.
 *  - KURUM ortak kaydı (V1'den aktarılan): aynı tenant'taki yetkili uzmanlar OKUR; API'den YAZILAMAZ.
 *    Kişiselleştirmek = özgün kayda dokunmadan AYRI KOPYA (copySharedToPersonal).
 * Güvenlik:
 *  - Kapsam (tenantId + userId) YALNIZ çağıranın OTURUMUNDAN gelir; istemci gövdesinden alınmaz.
 *  - Başka uzmanın/tenant'ın satırına dokunan istek bileşik anahtar + sahiplik filtresiyle REDDEDİLİR,
 *    işlemin TAMAMI geri alınır. Hata mesajı başka uzmana ait kaydın VARLIĞINI sızdırmaz.
 */
import { ChangesetError, parseChangeset, type Conflict, type RemovedAsset, type SaveResult } from "@/lib/sifa-rehberi-v2/changeset";
import type { Block, BlockClass, RecordScope, TopicLink, TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";

export type Scope = { tenantId: string; userId: string };

/** DB erişim sözleşmesi — Supabase (production) ve pg (izole test) aynı fonksiyonları çağırır. */
export interface SifaV2Db {
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
}

/** DB adaptörlerinin fırlattığı hata (mesaj = PostgreSQL RAISE metni / kısıt adı). */
export class DbError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly detail: string | null = null,
  ) {
    super(message);
  }
}

export type ServiceError = { status: 400 | 404 | 409 | 422 | 429 | 500; code: string; error: string; conflicts?: Conflict[] };
export type ServiceResult<T> = { ok: true; value: T } | ({ ok: false } & ServiceError);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scopeOk(s: Scope): boolean {
  return UUID.test(s.tenantId) && UUID.test(s.userId) && s.tenantId.toLowerCase() !== s.userId.toLowerCase();
}

function parseConflicts(detail: string | null): Conflict[] {
  if (!detail) return [];
  try {
    const arr = JSON.parse(detail) as unknown;
    return Array.isArray(arr)
      ? arr
          .filter((x): x is Conflict => !!x && typeof x === "object" && "id" in x)
          .map((x) => ({ kind: x.kind === "topic" ? "topic" : "block", id: String(x.id), title: String(x.title ?? "") }))
      : [];
  } catch {
    return [];
  }
}

/** PostgreSQL hatasını kullanıcıya güvenli, anlaşılır yanıta çevirir. */
export function mapDbError(e: unknown): ServiceError {
  const msg = e instanceof Error ? e.message : String(e);
  const code = e instanceof DbError ? e.code : null;
  // Çakışma SQLSTATE 'PT409' (PostgREST yeniden denemez → doğrudan HTTP 409). 40001 yalnız geriye dönük uyumluluk
  // için tanınır; DB artık 40001 üretmez (PostgREST 40001'i sonsuza dek yeniden deniyordu — 9. aşama P0).
  if (msg.includes("sifa_conflict") || code === "PT409" || code === "40001") {
    return {
      status: 409,
      code: "SIFA_V2_CONFLICT",
      error: "Kaydedilemedi: bazı kayıtlar başka bir pencerede/oturumda değiştirilmiş. Değişiklikleriniz bu ekranda duruyor.",
      conflicts: parseConflicts(e instanceof DbError ? e.detail : null),
    };
  }
  if (msg.includes("sifa_not_found") || msg.includes("sifa_parent_missing") || code === "23503" || code === "P0002") {
    return { status: 404, code: "SIFA_V2_NOT_FOUND", error: "Kaydedilemedi: değiştirilmek istenen kayıt bulunamadı ya da size ait değil (kurum kayıtları salt-okunurdur). Hiçbir değişiklik yazılmadı." };
  }
  if (msg.includes("sifa_template_locked") || msg.includes("sifa_system_section_not_under_root") || msg.includes("sifa_scope_immutable")) {
    return { status: 422, code: "SIFA_V2_LOCKED", error: "Hazır başlığın yeri değiştirilemez / kayıt kapsamı değiştirilemez. Hiçbir değişiklik yazılmadı." };
  }
  if (msg.includes("sifa_block_nesting") || msg.includes("sifa_block_not_box")) {
    return { status: 422, code: "SIFA_V2_NESTING", error: "İçerik kutusu yalnız bir notun içinde olabilir ve yalnız kutu kalıcı silinebilir. Hiçbir değişiklik yazılmadı." };
  }
  if (msg.includes("sifa_topic_cycle") || msg.includes("sifa_topic_depth_exceeded")) {
    return { status: 422, code: "SIFA_V2_TREE", error: "Başlık yapısı geçersiz (döngü veya 20 seviye sınırı). Hiçbir değişiklik yazılmadı." };
  }
  if (msg.includes("sifa_scope_required")) {
    return { status: 400, code: "SIFA_V2_SCOPE", error: "Oturum kapsamı geçersiz." };
  }
  if (code === "23505") {
    return { status: 409, code: "SIFA_V2_DUPLICATE", error: "Aynı kayıt iki kez oluşturulamaz. Hiçbir değişiklik yazılmadı." };
  }
  if (code === "23514" || code === "22023" || code === "22P02") {
    return { status: 422, code: "SIFA_V2_INVALID", error: "Kayıt bütünlük kuralına uymuyor. Hiçbir değişiklik yazılmadı." };
  }
  return { status: 500, code: "SIFA_V2_DB", error: "İşlem sırasında beklenmeyen bir hata oluştu. Hiçbir değişiklik yazılmadı." };
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const scopeOf = (v: unknown): RecordScope => (v === "kurum" ? "kurum" : "kisisel");

/** DB yükleme sonucunu istemci çalışma alanına çevirir. ownerKey: istemcinin sahip anahtarı. */
export function rowsToWorkspace(raw: unknown, ownerKey: string): Workspace {
  const r = (raw ?? {}) as { topics?: Row[]; blocks?: Row[]; links?: Row[] };
  const nodes: TopicNode[] = (r.topics ?? []).map((t) => ({
    id: String(t.id),
    ownerId: ownerKey,
    parentId: s(t.parent_id),
    title: String(t.title),
    sortKey: String(t.sort_key),
    templateKey: s(t.template_key),
    nodeKind: t.node_kind === "grup" ? "grup" : null,
    version: Number(t.version),
    scope: scopeOf(t.scope),
    createdAt: String(t.created_at),
    updatedAt: String(t.updated_at),
    deletedAt: s(t.deleted_at),
    deleteBatchId: s(t.delete_batch_id),
  }));
  const blocks: Block[] = (r.blocks ?? []).map((b) => ({
    id: String(b.id),
    ownerId: ownerKey,
    nodeId: String(b.topic_id),
    parentBlockId: s(b.parent_block_id),
    title: String(b.title),
    contentJson: (b.content_json as Block["contentJson"]) ?? null,
    contentText: String(b.content_text ?? ""),
    classification: (s(b.classification) as BlockClass | null) ?? null,
    sources: ((b.sources as Row[]) ?? []).map((x) => ({
      id: String(x.id),
      kind: String(x.kind) as Block["sources"][number]["kind"],
      title: String(x.title),
      ...(x.authors ? { authors: String(x.authors) } : {}),
      ...(x.year ? { year: String(x.year) } : {}),
      ...(x.doi ? { doi: String(x.doi) } : {}),
      ...(x.url ? { url: String(x.url) } : {}),
    })),
    sortKey: String(b.sort_key),
    version: Number(b.version),
    scope: scopeOf(b.scope),
    createdAt: String(b.created_at),
    updatedAt: String(b.updated_at),
    contentUpdatedAt: s(b.content_updated_at),
    assets: ((b.assets as Row[]) ?? []).map((a) => ({
      id: String(a.id),
      caption: s(a.caption),
      mimeType: s(a.mime_type),
      createdAt: String(a.created_at),
    })),
    deletedAt: s(b.deleted_at),
    deleteBatchId: s(b.delete_batch_id),
  }));
  const links: TopicLink[] = (r.links ?? []).map((l) => ({
    id: String(l.id),
    ownerId: ownerKey,
    fromNodeId: String(l.from_topic_id),
    toNodeId: String(l.to_topic_id),
    createdAt: String(l.created_at),
  }));
  return { ownerId: ownerKey, nodes, blocks, links };
}

const badScope = (): ServiceError => ({ status: 400, code: "SIFA_V2_SCOPE", error: "Oturum kapsamı geçersiz." });

export async function loadWorkspace(db: SifaV2Db, scope: Scope, ownerKey: string): Promise<ServiceResult<Workspace>> {
  if (!scopeOk(scope)) return { ok: false, ...badScope() };
  try {
    const raw = await db.rpc("sifa_v2_load", { p_tenant: scope.tenantId, p_user: scope.userId });
    return { ok: true, value: rowsToWorkspace(raw, ownerKey) };
  } catch (e) {
    return { ok: false, ...mapDbError(e) };
  }
}

/** Kaydet: doğrula → TEK DB işlemi. Başarısızlıkta hiçbir satır yazılmaz; sahte başarı yok.
 *  removedAssets: DB'den kaldırılan kendi yüklemelerinin nesne yolları (çağıran Storage'dan siler; istemciye dönmez). */
export async function saveChangeset(db: SifaV2Db, scope: Scope, body: unknown): Promise<ServiceResult<SaveResult & { removedAssets: RemovedAsset[] }>> {
  if (!scopeOk(scope)) return { ok: false, ...badScope() };
  let changes;
  try {
    changes = parseChangeset(body);
  } catch (e) {
    if (e instanceof ChangesetError) return { ok: false, status: 400, code: "SIFA_V2_BAD_REQUEST", error: `Geçersiz kayıt isteği: ${e.message}` };
    throw e;
  }
  try {
    const raw = (await db.rpc("sifa_v2_apply_changeset", { p_tenant: scope.tenantId, p_user: scope.userId, p_changes: changes })) as SaveResult & { removed_assets?: RemovedAsset[] };
    const removedAssets = (Array.isArray(raw?.removed_assets) ? raw.removed_assets : []).filter(
      (a): a is RemovedAsset => !!a && typeof a.bucket === "string" && typeof a.storage_path === "string",
    );
    return { ok: true, value: { topics: raw?.topics ?? {}, blocks: raw?.blocks ?? {}, removedAssets } };
  } catch (e) {
    return { ok: false, ...mapDbError(e) };
  }
}

export type VisibleAsset = { id: string; bucket: string; storage_path: string; mime_type: string | null; scope: RecordScope };

/** Yalnız çağıranın GÖREBİLECEĞİ görseller (kendi kişisel + kendi tenant'ının kurum görselleri). */
export async function visibleAssets(db: SifaV2Db, scope: Scope, ids: string[]): Promise<ServiceResult<VisibleAsset[]>> {
  if (!scopeOk(scope)) return { ok: false, ...badScope() };
  const clean = [...new Set(ids.filter((x) => typeof x === "string" && UUID.test(x)))].slice(0, 200);
  if (!clean.length) return { ok: true, value: [] };
  try {
    const r = (await db.rpc("sifa_v2_visible_assets", { p_tenant: scope.tenantId, p_user: scope.userId, p_ids: clean })) as VisibleAsset[];
    return { ok: true, value: Array.isArray(r) ? r : [] };
  } catch (e) {
    return { ok: false, ...mapDbError(e) };
  }
}

export async function registerUpload(
  db: SifaV2Db,
  scope: Scope,
  asset: { id: string; storage_path: string; mime_type: string; byte_size: number; caption?: string | null },
): Promise<ServiceResult<{ id: string }>> {
  if (!scopeOk(scope)) return { ok: false, ...badScope() };
  try {
    await db.rpc("sifa_v2_register_upload", { p_tenant: scope.tenantId, p_user: scope.userId, p_asset: asset });
    return { ok: true, value: { id: asset.id } };
  } catch (e) {
    return { ok: false, ...mapDbError(e) };
  }
}
