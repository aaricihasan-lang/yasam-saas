/**
 * Şifa Rehberi V2 — SAF konu ağacı / içerik kutusu işlemleri (prototip).
 *
 * Hepsi değişmez (immutable): yeni Workspace döner; geçersiz işlemde { ok:false, error }.
 * Sunucu tarafında aynı kurallar DB kısıtları + tetikleyicilerle de zorlanacak
 * (bkz. docs/sifa-rehberi-v2/schema-taslak.sql) — burada arayüzün erken doğrulaması.
 */
import { foldTr } from "@/lib/sifa-rehberi/normalizeTr";
import { compareKeys, keyBetween } from "@/lib/sifa-rehberi-v2/sortKey";
import {
  MAX_DEPTH,
  type Block,
  type BlockClass,
  type OpResult,
  type SourceRef,
  type TopicLink,
  type TopicNode,
  type Workspace,
} from "@/lib/sifa-rehberi-v2/types";
import type { JSONContent } from "@tiptap/core";

export type Ctx = { now: string; newId: () => string };

export const TITLE_MAX = 200;

/** Hazır Şifa Rehberi başlıkları: adı ve yeri korunur, tek başına silinmez. */
export const TEMPLATE_LOCKED = "Hazır Şifa Rehberi başlığıdır; adı ve yeri korunur. Altına istediğiniz kadar başlık ve içerik kutusu ekleyebilirsiniz.";

function ok(value: Workspace): OpResult {
  return { ok: true, value };
}
function fail(error: string): OpResult {
  return { ok: false, error };
}

function cleanTitle(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t || t.length > TITLE_MAX) return null;
  return t;
}

// ── Okuma yardımcıları ─────────────────────────────────────────────────────────

export function liveNodes(ws: Workspace): TopicNode[] {
  return ws.nodes.filter((n) => !n.deletedAt);
}

export function nodeById(ws: Workspace, id: string | null | undefined): TopicNode | null {
  if (!id) return null;
  return ws.nodes.find((n) => n.id === id && !n.deletedAt) ?? null;
}

export function childrenOf(ws: Workspace, parentId: string | null): TopicNode[] {
  return ws.nodes.filter((n) => !n.deletedAt && n.parentId === parentId).sort(compareKeys);
}

export function blocksOf(ws: Workspace, nodeId: string): Block[] {
  return ws.blocks.filter((b) => !b.deletedAt && b.nodeId === nodeId).sort(compareKeys);
}

/** Kökten düğüme yol (breadcrumb). Bozuk veri/döngüde MAX_DEPTH+1'de durur. */
export function pathOf(ws: Workspace, nodeId: string): TopicNode[] {
  const out: TopicNode[] = [];
  let cur = nodeById(ws, nodeId);
  let guard = 0;
  while (cur && guard <= MAX_DEPTH + 1) {
    out.unshift(cur);
    cur = nodeById(ws, cur.parentId);
    guard++;
  }
  return out;
}

export function depthOf(ws: Workspace, nodeId: string): number {
  return pathOf(ws, nodeId).length;
}

/** Düğümün kendisi + tüm torunları (canlı). */
export function subtreeIds(ws: Workspace, rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const byParent = new Map<string, string[]>();
  for (const n of ws.nodes) {
    if (n.deletedAt || !n.parentId) continue;
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n.id);
    byParent.set(n.parentId, arr);
  }
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of byParent.get(id) ?? []) {
      if (!ids.has(c)) {
        ids.add(c);
        stack.push(c);
      }
    }
  }
  return ids;
}

/** Alt ağacın en derin göreli yüksekliği (kendisi = 1). */
function subtreeHeight(ws: Workspace, rootId: string): number {
  const kids = childrenOf(ws, rootId);
  if (!kids.length) return 1;
  return 1 + Math.max(...kids.map((k) => subtreeHeight(ws, k.id)));
}

function lastSiblingKey(ws: Workspace, parentId: string | null, excludeId?: string): string | null {
  const sibs = childrenOf(ws, parentId).filter((n) => n.id !== excludeId);
  return sibs.length ? sibs[sibs.length - 1].sortKey : null;
}

// ── Konu işlemleri ─────────────────────────────────────────────────────────────

export function addNode(
  ws: Workspace,
  input: { parentId: string | null; title: string },
  ctx: Ctx,
): OpResult<{ ws: Workspace; node: TopicNode }> {
  const title = cleanTitle(input.title);
  if (!title) return { ok: false, error: "Başlık boş olamaz (en fazla 200 karakter)." };
  if (input.parentId) {
    if (!nodeById(ws, input.parentId)) return { ok: false, error: "Üst başlık bulunamadı." };
    if (depthOf(ws, input.parentId) + 1 > MAX_DEPTH) {
      return { ok: false, error: `En fazla ${MAX_DEPTH} seviye derinlik desteklenir.` };
    }
  }
  const node: TopicNode = {
    id: ctx.newId(),
    ownerId: ws.ownerId,
    parentId: input.parentId,
    title,
    sortKey: keyBetween(lastSiblingKey(ws, input.parentId), null),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
    deleteBatchId: null,
  };
  return { ok: true, value: { ws: { ...ws, nodes: [...ws.nodes, node] }, node } };
}

export function renameNode(ws: Workspace, nodeId: string, rawTitle: string, ctx: Ctx): OpResult {
  const title = cleanTitle(rawTitle);
  if (!title) return fail("Başlık boş olamaz (en fazla 200 karakter).");
  const target = nodeById(ws, nodeId);
  if (!target) return fail("Başlık bulunamadı.");
  if (target.templateKey) return fail(TEMPLATE_LOCKED);
  return ok({
    ...ws,
    nodes: ws.nodes.map((n) => (n.id === nodeId ? { ...n, title, updatedAt: ctx.now } : n)),
  });
}

/**
 * Taşıma: düğüm kendisinin ya da bir torununun altına taşınamaz (DÖNGÜ YOK).
 * Yeni üst altında EN SONA eklenir.
 */
export function moveNode(ws: Workspace, nodeId: string, newParentId: string | null, ctx: Ctx): OpResult {
  const node = nodeById(ws, nodeId);
  if (!node) return fail("Başlık bulunamadı.");
  if (node.templateKey) return fail(TEMPLATE_LOCKED);
  if (newParentId === node.parentId) return ok(ws);
  if (newParentId !== null) {
    if (!nodeById(ws, newParentId)) return fail("Hedef başlık bulunamadı.");
    if (subtreeIds(ws, nodeId).has(newParentId)) {
      return fail("Bir başlık kendi altına veya kendi alt başlıklarından birinin altına taşınamaz.");
    }
    if (depthOf(ws, newParentId) + subtreeHeight(ws, nodeId) > MAX_DEPTH) {
      return fail(`Taşıma sonrası derinlik ${MAX_DEPTH} seviyeyi aşar.`);
    }
  }
  const sortKey = keyBetween(lastSiblingKey(ws, newParentId, nodeId), null);
  return ok({
    ...ws,
    nodes: ws.nodes.map((n) =>
      n.id === nodeId ? { ...n, parentId: newParentId, sortKey, updatedAt: ctx.now } : n,
    ),
  });
}

/** Kardeşler arasında bir yukarı / aşağı — yalnız taşınan düğümün anahtarı değişir. */
export function reorderNode(ws: Workspace, nodeId: string, dir: "up" | "down", ctx: Ctx): OpResult {
  const node = nodeById(ws, nodeId);
  if (!node) return fail("Başlık bulunamadı.");
  const sibs = childrenOf(ws, node.parentId);
  const i = sibs.findIndex((s) => s.id === nodeId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sibs.length) return ok(ws);
  let sortKey: string;
  if (dir === "up") {
    const before = j - 1 >= 0 ? sibs[j - 1].sortKey : null;
    sortKey = keyBetween(before, sibs[j].sortKey);
  } else {
    const after = j + 1 < sibs.length ? sibs[j + 1].sortKey : null;
    sortKey = keyBetween(sibs[j].sortKey, after);
  }
  return ok({
    ...ws,
    nodes: ws.nodes.map((n) => (n.id === nodeId ? { ...n, sortKey, updatedAt: ctx.now } : n)),
  });
}

/**
 * Güvenli silme = YUMUŞAK silme: düğüm + tüm alt başlıkları + kutuları aynı deleteBatchId ile
 * Çöp Kutusu'na gider. Bağlantılar silinmez; uçlarından biri çöpteyken görünmez.
 */
export function softDeleteNode(ws: Workspace, nodeId: string, ctx: Ctx): OpResult<{ ws: Workspace; batchId: string; count: { nodes: number; blocks: number } }> {
  const target = nodeById(ws, nodeId);
  if (!target) return { ok: false, error: "Başlık bulunamadı." };
  if (target.templateKey) return { ok: false, error: TEMPLATE_LOCKED };
  const ids = subtreeIds(ws, nodeId);
  const batchId = ctx.newId();
  let blocks = 0;
  const next: Workspace = {
    ...ws,
    nodes: ws.nodes.map((n) => (ids.has(n.id) ? { ...n, deletedAt: ctx.now, deleteBatchId: batchId } : n)),
    blocks: ws.blocks.map((b) => {
      if (ids.has(b.nodeId) && !b.deletedAt) {
        blocks++;
        return { ...b, deletedAt: ctx.now, deleteBatchId: batchId };
      }
      return b;
    }),
  };
  return { ok: true, value: { ws: next, batchId, count: { nodes: ids.size, blocks } } };
}

export type TrashEntry = {
  batchId: string;
  kind: "konu" | "kutu";
  title: string;
  deletedAt: string;
  nodeCount: number;
  blockCount: number;
  /** Silindiği yer (yol) — geri yüklemede bilgi için. */
  originPath: string;
};

export function trashEntries(ws: Workspace): TrashEntry[] {
  const batches = new Map<string, TrashEntry>();
  for (const n of ws.nodes) {
    if (!n.deleteBatchId) continue;
    const e = batches.get(n.deleteBatchId);
    const isRoot = !ws.nodes.some((p) => p.id === n.parentId && p.deleteBatchId === n.deleteBatchId);
    if (!e) {
      batches.set(n.deleteBatchId, {
        batchId: n.deleteBatchId,
        kind: "konu",
        title: isRoot ? n.title : "",
        deletedAt: n.deletedAt ?? "",
        nodeCount: 1,
        blockCount: 0,
        originPath: isRoot && n.parentId ? pathOf(ws, n.parentId).map((p) => p.title).join(" › ") : "",
      });
    } else {
      e.nodeCount++;
      if (isRoot) {
        e.title = n.title;
        e.originPath = n.parentId ? pathOf(ws, n.parentId).map((p) => p.title).join(" › ") : "";
      }
    }
  }
  for (const b of ws.blocks) {
    if (!b.deleteBatchId) continue;
    const e = batches.get(b.deleteBatchId);
    if (e) {
      e.blockCount++;
    } else {
      batches.set(b.deleteBatchId, {
        batchId: b.deleteBatchId,
        kind: "kutu",
        title: b.title,
        deletedAt: b.deletedAt ?? "",
        nodeCount: 0,
        blockCount: 1,
        originPath: pathOf(ws, b.nodeId).map((p) => p.title).join(" › "),
      });
    }
  }
  return [...batches.values()].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
}

/**
 * Geri yükleme: aynı silme paketindeki her şey geri gelir. Eski üst başlık artık yoksa
 * (o da silinmişse) konu EN ÜST seviyeye geri yüklenir — veri asla kaybolmaz.
 * Kutu tek başına silinmişse ve konusu çöpteyse, kutu geri gelmez (önce konu geri yüklenmeli).
 */
export function restoreBatch(ws: Workspace, batchId: string, ctx: Ctx): OpResult<{ ws: Workspace; movedToRoot: boolean }> {
  const inBatch = ws.nodes.filter((n) => n.deleteBatchId === batchId);
  const blocksInBatch = ws.blocks.filter((b) => b.deleteBatchId === batchId);
  if (!inBatch.length && !blocksInBatch.length) return { ok: false, error: "Çöp kutusunda bu kayıt yok." };
  if (!inBatch.length) {
    const orphan = blocksInBatch.find((b) => !nodeById(ws, b.nodeId));
    if (orphan) return { ok: false, error: "Bu kutunun konusu da silinmiş; önce konuyu geri yükleyin." };
  }
  let movedToRoot = false;
  const batchIds = new Set(inBatch.map((n) => n.id));
  const nodes = ws.nodes.map((n) => {
    if (n.deleteBatchId !== batchId) return n;
    const isBatchRoot = !n.parentId || !batchIds.has(n.parentId);
    let parentId = n.parentId;
    let sortKey = n.sortKey;
    if (isBatchRoot && parentId && !nodeById(ws, parentId)) {
      parentId = null;
      movedToRoot = true;
      sortKey = keyBetween(lastSiblingKey(ws, null), null);
    }
    return { ...n, parentId, sortKey, deletedAt: null, deleteBatchId: null, updatedAt: ctx.now };
  });
  const blocks = ws.blocks.map((b) =>
    b.deleteBatchId === batchId ? { ...b, deletedAt: null, deleteBatchId: null, updatedAt: ctx.now } : b,
  );
  return { ok: true, value: { ws: { ...ws, nodes, blocks }, movedToRoot } };
}

// ── İçerik kutusu işlemleri ───────────────────────────────────────────────────

export function addBlock(
  ws: Workspace,
  input: { nodeId: string; title: string },
  ctx: Ctx,
): OpResult<{ ws: Workspace; block: Block }> {
  if (!nodeById(ws, input.nodeId)) return { ok: false, error: "Konu bulunamadı." };
  const title = cleanTitle(input.title);
  if (!title) return { ok: false, error: "Kutu adı boş olamaz (en fazla 200 karakter)." };
  const sibs = blocksOf(ws, input.nodeId);
  const block: Block = {
    id: ctx.newId(),
    ownerId: ws.ownerId,
    nodeId: input.nodeId,
    title,
    contentJson: null,
    contentText: "",
    classification: null,
    sources: [],
    sortKey: keyBetween(sibs.length ? sibs[sibs.length - 1].sortKey : null, null),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
    deleteBatchId: null,
  };
  return { ok: true, value: { ws: { ...ws, blocks: [...ws.blocks, block] }, block } };
}

export type BlockPatch = Partial<{
  title: string;
  contentJson: JSONContent | null;
  contentText: string;
  classification: BlockClass | null;
  sources: SourceRef[];
}>;

export function updateBlock(ws: Workspace, blockId: string, patch: BlockPatch, ctx: Ctx): OpResult {
  const b = ws.blocks.find((x) => x.id === blockId && !x.deletedAt);
  if (!b) return fail("Kutu bulunamadı.");
  const next = { ...patch };
  if (patch.title !== undefined) {
    const t = cleanTitle(patch.title);
    if (!t) return fail("Kutu adı boş olamaz (en fazla 200 karakter).");
    next.title = t;
  }
  return ok({
    ...ws,
    blocks: ws.blocks.map((x) => (x.id === blockId ? { ...x, ...next, updatedAt: ctx.now } : x)),
  });
}

export function reorderBlock(ws: Workspace, blockId: string, dir: "up" | "down", ctx: Ctx): OpResult {
  const b = ws.blocks.find((x) => x.id === blockId && !x.deletedAt);
  if (!b) return fail("Kutu bulunamadı.");
  const sibs = blocksOf(ws, b.nodeId);
  const i = sibs.findIndex((s) => s.id === blockId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sibs.length) return ok(ws);
  const sortKey =
    dir === "up"
      ? keyBetween(j - 1 >= 0 ? sibs[j - 1].sortKey : null, sibs[j].sortKey)
      : keyBetween(sibs[j].sortKey, j + 1 < sibs.length ? sibs[j + 1].sortKey : null);
  return ok({
    ...ws,
    blocks: ws.blocks.map((x) => (x.id === blockId ? { ...x, sortKey, updatedAt: ctx.now } : x)),
  });
}

export function softDeleteBlock(ws: Workspace, blockId: string, ctx: Ctx): OpResult<{ ws: Workspace; batchId: string }> {
  const b = ws.blocks.find((x) => x.id === blockId && !x.deletedAt);
  if (!b) return { ok: false, error: "Kutu bulunamadı." };
  const batchId = ctx.newId();
  return {
    ok: true,
    value: {
      ws: {
        ...ws,
        blocks: ws.blocks.map((x) => (x.id === blockId ? { ...x, deletedAt: ctx.now, deleteBatchId: batchId } : x)),
      },
      batchId,
    },
  };
}

// ── Bağlantılar (içerik kopyalamadan) ─────────────────────────────────────────

export function addLink(ws: Workspace, fromNodeId: string, toNodeId: string, ctx: Ctx): OpResult {
  if (fromNodeId === toNodeId) return fail("Bir konu kendisine bağlanamaz.");
  if (!nodeById(ws, fromNodeId) || !nodeById(ws, toNodeId)) return fail("Konu bulunamadı.");
  const exists = ws.links.some((l) => l.fromNodeId === fromNodeId && l.toNodeId === toNodeId);
  if (exists) return ok(ws);
  const link: TopicLink = { id: ctx.newId(), ownerId: ws.ownerId, fromNodeId, toNodeId, createdAt: ctx.now };
  return ok({ ...ws, links: [...ws.links, link] });
}

export function removeLink(ws: Workspace, linkId: string): OpResult {
  return ok({ ...ws, links: ws.links.filter((l) => l.id !== linkId) });
}

/** Görünür bağlantılar: iki ucu da canlı olanlar. */
export function linksFrom(ws: Workspace, nodeId: string): { link: TopicLink; node: TopicNode }[] {
  return ws.links
    .filter((l) => l.fromNodeId === nodeId && nodeById(ws, l.fromNodeId) !== null)
    .map((l) => ({ link: l, node: nodeById(ws, l.toNodeId) }))
    .filter((x): x is { link: TopicLink; node: TopicNode } => x.node !== null);
}

export function linksTo(ws: Workspace, nodeId: string): { link: TopicLink; node: TopicNode }[] {
  return ws.links
    .filter((l) => l.toNodeId === nodeId && nodeById(ws, l.toNodeId) !== null)
    .map((l) => ({ link: l, node: nodeById(ws, l.fromNodeId) }))
    .filter((x): x is { link: TopicLink; node: TopicNode } => x.node !== null);
}

// ── Arama ──────────────────────────────────────────────────────────────────────

export type SearchHit = {
  nodeId: string;
  path: string[];
  where: "başlık" | "kutu adı" | "içerik";
  blockTitle?: string;
  snippet?: string;
};

function snippetAround(text: string, foldedQ: string): string {
  const folded = foldTr(text);
  const i = folded.indexOf(foldedQ);
  if (i < 0) return text.slice(0, 120);
  // foldTr boşlukları sadeleştirir; konum yaklaşık — kısa önizleme için yeterli.
  const plain = text.replace(/\s+/g, " ").trim();
  const start = Math.max(0, i - 50);
  return (start > 0 ? "…" : "") + plain.slice(start, i + foldedQ.length + 70) + "…";
}

/** Konu, alt başlık, kutu adı ve kutu içeriğinde Türkçe-katlamalı arama. Aynı konu tek kez döner. */
export function searchWorkspace(ws: Workspace, q: string, limit = 50): SearchHit[] {
  const fq = foldTr(q);
  if (!fq) return [];
  const hits = new Map<string, SearchHit>();
  for (const n of liveNodes(ws)) {
    if (foldTr(n.title).includes(fq)) {
      hits.set(n.id, { nodeId: n.id, path: pathOf(ws, n.id).map((p) => p.title), where: "başlık" });
    }
  }
  for (const b of ws.blocks) {
    if (b.deletedAt || hits.has(b.nodeId) || !nodeById(ws, b.nodeId)) continue;
    if (foldTr(b.title).includes(fq)) {
      hits.set(b.nodeId, { nodeId: b.nodeId, path: pathOf(ws, b.nodeId).map((p) => p.title), where: "kutu adı", blockTitle: b.title });
    } else if (foldTr(b.contentText).includes(fq)) {
      hits.set(b.nodeId, {
        nodeId: b.nodeId,
        path: pathOf(ws, b.nodeId).map((p) => p.title),
        where: "içerik",
        blockTitle: b.title,
        snippet: snippetAround(b.contentText, fq),
      });
    }
  }
  return [...hits.values()].slice(0, limit);
}

// ── Bütünlük doğrulaması (kayıttan önce; sunucuda da aynısı) ─────────────────

export function validateWorkspace(ws: Workspace): string[] {
  const errors: string[] = [];
  const ids = new Map(ws.nodes.map((n) => [n.id, n]));
  for (const n of ws.nodes) {
    if (n.ownerId !== ws.ownerId) errors.push(`Yabancı sahip: konu ${n.id}`);
    if (n.parentId && !ids.has(n.parentId)) errors.push(`Üst başlık yok: ${n.id}`);
    // döngü / derinlik
    const seen = new Set<string>();
    let cur: TopicNode | undefined = n;
    let depth = 0;
    while (cur) {
      if (seen.has(cur.id)) {
        errors.push(`Döngü: ${n.id}`);
        break;
      }
      seen.add(cur.id);
      depth++;
      cur = cur.parentId ? ids.get(cur.parentId) : undefined;
    }
    if (depth > MAX_DEPTH) errors.push(`Derinlik aşımı: ${n.id}`);
    if (!n.deletedAt && n.parentId && ids.get(n.parentId)?.deletedAt) errors.push(`Canlı konu silinmiş üst altında: ${n.id}`);
  }
  const tplSeen = new Set<string>();
  for (const n of ws.nodes) {
    if (!n.templateKey || n.deletedAt) continue;
    const k = `${n.parentId}|${n.templateKey}`;
    if (tplSeen.has(k)) errors.push(`Aynı hazır başlık iki kez: ${n.templateKey}`);
    tplSeen.add(k);
    if (!/^(grup|konu|bolum):[a-z0-9_]+$/.test(n.templateKey)) errors.push(`Geçersiz sistem anahtarı: ${n.id}`);
    if (n.templateKey.startsWith("bolum:") && (!n.parentId || ids.get(n.parentId)?.parentId !== null)) {
      errors.push(`Sistem bölümü yalnız ana konunun hemen altında olabilir: ${n.id}`);
    }
  }
  for (const b of ws.blocks) {
    if (b.ownerId !== ws.ownerId) errors.push(`Yabancı sahip: kutu ${b.id}`);
    if (!ids.has(b.nodeId)) errors.push(`Kutunun konusu yok: ${b.id}`);
  }
  for (const l of ws.links) {
    if (l.ownerId !== ws.ownerId) errors.push(`Yabancı sahip: bağlantı ${l.id}`);
    if (!ids.has(l.fromNodeId) || !ids.has(l.toNodeId)) errors.push(`Bağlantı ucu yok: ${l.id}`);
  }
  return errors;
}

// ── Kaydedilmemiş değişiklik özeti (Kaydet'te sunucuya gidecek değişiklik kümesi) ──

export type ChangeSummary = { nodes: number; blocks: number; links: number; total: number };

function changedCount<T extends { id: string }>(a: T[], b: T[]): number {
  const am = new Map(a.map((x) => [x.id, JSON.stringify(x)]));
  const bm = new Map(b.map((x) => [x.id, JSON.stringify(x)]));
  let n = 0;
  for (const [id, v] of bm) if (am.get(id) !== v) n++;
  for (const id of am.keys()) if (!bm.has(id)) n++;
  return n;
}

export function summarizeChanges(saved: Workspace, draft: Workspace): ChangeSummary {
  const nodes = changedCount(saved.nodes, draft.nodes);
  const blocks = changedCount(saved.blocks, draft.blocks);
  const links = changedCount(saved.links, draft.links);
  return { nodes, blocks, links, total: nodes + blocks + links };
}
