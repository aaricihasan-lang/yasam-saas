/**
 * Şifa Rehberi F3 — AĞ TAKLİDİ arayüz testleri için ortak sahte kişisel kütüphane (prod'a / DB'ye SIFIR temas).
 * Eski V1 ekranını taşıyıcı olarak kullanan UI betikleri (wt4, delete-safety, alti-is-paketi) F3 ekranına bu
 * modülle taşındı. Biçim = GET /api/sifa-rehberi-v2/workspace yanıtı ({ ok, workspace }), sunucu sözleşmesiyle aynı
 * (lib/sifa-rehberi-v2/types.ts Workspace).
 */
export const F3_API = "/api/sifa-rehberi-v2";
export const ROOT_ID = "f3000000-0000-4000-8000-0000000000a1";
export const ROOT2_ID = "f3000000-0000-4000-8000-0000000000a2";
export const HEAD_ID = "f3000000-0000-4000-8000-0000000000b1";
export const NOTE_ID = "f3000000-0000-4000-8000-0000000000c1";

const T0 = "2026-10-01T09:00:00.000Z";
const doc = (t) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

/** Sahibin kütüphanesi: "ZZ Migren" (alt başlık "ZZ Tıbbi" + 1 not) ve "ZZ Uyku" (boş). */
export function f3Workspace(ownerId, { extraRoots = [] } = {}) {
  const node = (id, parentId, title, sortKey) => ({
    id, ownerId, parentId, title, sortKey, templateKey: null, nodeKind: null, version: 1, scope: "kisisel",
    createdAt: T0, updatedAt: T0, deletedAt: null, deleteBatchId: null,
  });
  return {
    ownerId,
    nodes: [
      node(ROOT_ID, null, "ZZ Migren", "00001m"),
      node(HEAD_ID, ROOT_ID, "ZZ Tıbbi", "00001m"),
      node(ROOT2_ID, null, "ZZ Uyku", "00002m"),
      ...extraRoots.map((r, i) => node(r.id, null, r.title, `${(i + 3).toString(36).padStart(5, "0")}m`)),
    ],
    blocks: [{
      id: NOTE_ID, ownerId, nodeId: HEAD_ID, parentBlockId: null, title: "ZZ Not", contentJson: doc("ZZ not metni"),
      contentText: "ZZ not metni", classification: null, sources: [], sortKey: "00001m", version: 1, scope: "kisisel",
      createdAt: T0, updatedAt: T0, contentUpdatedAt: T0, assets: [],
    }],
    links: [],
  };
}

/** Konu ekranı adresi (ekran içi gezinme # ile). */
export const f3TopicUrl = (base, rootId = ROOT_ID, nodeId = HEAD_ID) => `${base}/sifa-rehberi#/konu/${rootId}/${encodeURIComponent(nodeId)}`;
export const f3LibraryUrl = (base) => `${base}/sifa-rehberi#/kutuphane`;
