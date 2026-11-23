/**
 * Şifa Rehberi V2 — "Kaydet" değişiklik kümesi (istemci + sunucu ortak, SAF).
 *
 * İstemci: son kayıt (saved) ile taslak (draft) arasındaki farkı üretir.
 * Sunucu : gelen kümeyi SIKI doğrular (biçim, boyut, sınırlar) ve içerikleri yeniden süzer.
 * Sahiplik ve tenant İSTEMCİDEN ALINMAZ — sunucu oturumdan verir; DB fonksiyonu satırları
 * yalnız o kapsamda yazar (bkz. supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql).
 */
import { assetIdsIn, sanitizeContent } from "@/lib/sifa-rehberi-v2/contentSafety";
import type { JSONContent } from "@tiptap/core";
import type { Block, SourceRef, TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";

export type TopicChange = {
  id: string;
  parent_id: string | null;
  title: string;
  sort_key: string;
  template_key: string | null;
  deleted_at: string | null;
  delete_batch_id: string | null;
  base_version: number | null;
};
export type SourceChange = { id: string; kind: SourceRef["kind"]; title: string; authors?: string; year?: string; doi?: string; url?: string };
export type BlockChange = {
  id: string;
  topic_id: string;
  title: string;
  content_json: JSONContent | null;
  content_text: string;
  classification: string | null;
  sort_key: string;
  deleted_at: string | null;
  delete_batch_id: string | null;
  base_version: number | null;
  sources: SourceChange[];
};
export type Changeset = {
  topics: TopicChange[];
  blocks: BlockChange[];
  links_add: { id: string; from_topic_id: string; to_topic_id: string }[];
  links_remove: string[];
  /** Yeni/değişen kutularda başvurulan kendi taslak görsellerini kutuya bağlar. */
  asset_links?: { asset_id: string; block_id: string }[];
};
export type Conflict = { kind: "topic" | "block"; id: string; title: string };
export type SaveResult = { topics: Record<string, number>; blocks: Record<string, number> };

export const CHANGESET_LIMITS = {
  maxTopics: 2000,
  maxBlocks: 2000,
  maxLinks: 2000,
  maxSourcesPerBlock: 200,
  maxBlockJsonBytes: 2_000_000,
  maxContentTextBytes: 1_000_000,
  maxBodyBytes: 20_000_000,
} as const;

/**
 * KANONİK karşılaştırma: nesne anahtarları sıralanır. PostgreSQL jsonb, içerikteki anahtarların sırasını
 * kendi düzenine göre yeniden dizer; düz JSON.stringify karşılaştırması DB'den gelen HER kutuyu "değişmiş"
 * sanıp gereksiz yazıma, sürüm artışına ve SAHTE çakışmalara yol açıyordu (7. aşamada yakalandı).
 */
export function canonicalJson(v: unknown): string {
  const norm = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(norm)
      : x && typeof x === "object"
        ? Object.fromEntries(Object.keys(x as object).filter((k) => (x as Record<string, unknown>)[k] !== undefined).sort().map((k) => [k, norm((x as Record<string, unknown>)[k])]))
        : x;
  return JSON.stringify(norm(v));
}
const topicKey = (n: TopicNode) =>
  canonicalJson([n.parentId, n.title, n.sortKey, n.templateKey ?? null, n.deletedAt, n.deleteBatchId]);
const blockKey = (b: Block) =>
  canonicalJson([b.nodeId, b.title, b.contentJson, b.contentText, b.classification, b.sortKey, b.deletedAt, b.deleteBatchId, b.sources]);

/**
 * saved → draft farkı. Yeni satır: base_version=null; değişen satır: kayıtlı sürüm.
 * KURUM (ortak) kayıtları hiçbir zaman gönderilmez — salt-okunurdur (sunucu da reddeder).
 */
export function buildChangeset(saved: Workspace, draft: Workspace): Changeset {
  const sharedIds = new Set([...saved.nodes, ...draft.nodes].filter((n) => n.scope === "kurum").map((n) => n.id));
  const sTopics = new Map(saved.nodes.map((n) => [n.id, n]));
  const sBlocks = new Map(saved.blocks.map((b) => [b.id, b]));
  const sLinks = new Set(saved.links.map((l) => l.id));
  const dLinks = new Set(draft.links.map((l) => l.id));
  const topics: TopicChange[] = [];
  for (const n of draft.nodes) {
    if (sharedIds.has(n.id)) continue;
    const prev = sTopics.get(n.id);
    if (prev && topicKey(prev) === topicKey(n)) continue;
    topics.push({
      id: n.id,
      parent_id: n.parentId,
      title: n.title,
      sort_key: n.sortKey,
      template_key: n.templateKey ?? null,
      deleted_at: n.deletedAt,
      delete_batch_id: n.deleteBatchId,
      base_version: prev ? (prev.version ?? 1) : null,
    });
  }
  const blocks: BlockChange[] = [];
  const asset_links: { asset_id: string; block_id: string }[] = [];
  for (const b of draft.blocks) {
    if (b.scope === "kurum" || sharedIds.has(b.nodeId)) continue;
    const prev = sBlocks.get(b.id);
    if (prev && blockKey(prev) === blockKey(b)) continue;
    blocks.push({
      id: b.id,
      topic_id: b.nodeId,
      title: b.title,
      content_json: b.contentJson,
      content_text: b.contentText,
      classification: b.classification,
      sort_key: b.sortKey,
      deleted_at: b.deletedAt,
      delete_batch_id: b.deleteBatchId,
      base_version: prev ? (prev.version ?? 1) : null,
      sources: b.sources.map((s) => ({ id: s.id, kind: s.kind, title: s.title, authors: s.authors, year: s.year, doi: s.doi, url: s.url })),
    });
    for (const a of assetIdsIn(b.contentJson)) asset_links.push({ asset_id: a, block_id: b.id });
  }
  return {
    topics,
    blocks,
    links_add: draft.links.filter((l) => !sLinks.has(l.id) && !sharedIds.has(l.fromNodeId)).map((l) => ({ id: l.id, from_topic_id: l.fromNodeId, to_topic_id: l.toNodeId })),
    links_remove: saved.links.filter((l) => !dLinks.has(l.id) && !sharedIds.has(l.fromNodeId)).map((l) => l.id),
    ...(asset_links.length ? { asset_links } : {}),
  };
}

export function isEmptyChangeset(c: Changeset): boolean {
  return !c.topics.length && !c.blocks.length && !c.links_add.length && !c.links_remove.length && !c.asset_links?.length;
}

/** Başarılı kayıttan sonra yeni sürümleri çalışma alanına işler. */
export function applySaveResult(ws: Workspace, res: SaveResult): Workspace {
  return {
    ...ws,
    nodes: ws.nodes.map((n) => (res.topics[n.id] !== undefined ? { ...n, version: res.topics[n.id] } : n)),
    blocks: ws.blocks.map((b) => (res.blocks[b.id] !== undefined ? { ...b, version: res.blocks[b.id] } : b)),
  };
}

// ── Sunucu doğrulaması ─────────────────────────────────────────────────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SORT_KEY = /^[0-9a-z]*[1-9a-z]$/;
const TEMPLATE_KEY = /^(grup|konu|bolum):[a-z0-9_]+$/;
const CLASSES = new Set(["bilimsel", "geleneksel", "dini", "uzman_notu", "diger"]);
const SOURCE_KINDS = new Set(["makale", "kitap", "web", "geleneksel", "diger"]);
const DOI = /^10\.[0-9]{4,9}\/\S+$/;
const URL_RE = /^https?:\/\/\S+$/i;

export class ChangesetError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== "string") throw new ChangesetError(`${field}: metin bekleniyordu`);
  const t = v.trim();
  if (t.length < min || v.length > max) throw new ChangesetError(`${field}: uzunluk ${min}–${max}`);
  return v;
}
function optStr(v: unknown, field: string, max: number, re?: RegExp): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = str(v, field, 1, max);
  if (re && !re.test(s)) throw new ChangesetError(`${field}: geçersiz biçim`);
  return s;
}
function uuid(v: unknown, field: string): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new ChangesetError(`${field}: geçersiz kimlik`);
  return v.toLowerCase();
}
function nullableUuid(v: unknown, field: string): string | null {
  return v === null || v === undefined ? null : uuid(v, field);
}
function ts(v: unknown, field: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new ChangesetError(`${field}: geçersiz zaman`);
  return v;
}
function version(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || (v as number) < 1) throw new ChangesetError("base_version: geçersiz");
  return v as number;
}
function arr(v: unknown, field: string, max: number): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new ChangesetError(`${field}: dizi bekleniyordu`);
  if (v.length > max) throw new ChangesetError(`${field}: en fazla ${max} öğe`);
  return v;
}

/**
 * Sunucuda gelen gövdeyi doğrular ve GÜVENLİ bir kopyasını döner. Sahiplik alanları kabul
 * edilmez (owner/tenant yalnız oturumdan). İçerik yeniden süzülür (XSS / güvensiz bağlantı).
 */
export function parseChangeset(body: unknown): Changeset {
  if (!isObj(body)) throw new ChangesetError("Gövde nesne olmalı");
  for (const k of Object.keys(body)) {
    if (!["topics", "blocks", "links_add", "links_remove", "asset_links"].includes(k)) throw new ChangesetError(`Bilinmeyen alan: ${k}`);
  }
  const topics = arr(body.topics, "topics", CHANGESET_LIMITS.maxTopics).map((raw, i): TopicChange => {
    if (!isObj(raw)) throw new ChangesetError(`topics[${i}]`);
    const tk = raw.template_key === null || raw.template_key === undefined ? null : str(raw.template_key, "template_key", 1, 80);
    if (tk && !TEMPLATE_KEY.test(tk)) throw new ChangesetError("template_key: geçersiz");
    const sk = str(raw.sort_key, "sort_key", 1, 200);
    if (!SORT_KEY.test(sk)) throw new ChangesetError("sort_key: geçersiz");
    const deleted_at = ts(raw.deleted_at, "deleted_at");
    const delete_batch_id = nullableUuid(raw.delete_batch_id, "delete_batch_id");
    if ((deleted_at === null) !== (delete_batch_id === null)) throw new ChangesetError("silme alanları birlikte olmalı");
    return {
      id: uuid(raw.id, "topics.id"),
      parent_id: nullableUuid(raw.parent_id, "parent_id"),
      title: str(raw.title, "title", 1, 200),
      sort_key: sk,
      template_key: tk,
      deleted_at,
      delete_batch_id,
      base_version: version(raw.base_version),
    };
  });
  const blocks = arr(body.blocks, "blocks", CHANGESET_LIMITS.maxBlocks).map((raw, i): BlockChange => {
    if (!isObj(raw)) throw new ChangesetError(`blocks[${i}]`);
    const cls = raw.classification === null || raw.classification === undefined ? null : String(raw.classification);
    if (cls !== null && !CLASSES.has(cls)) throw new ChangesetError("classification: geçersiz");
    const sk = str(raw.sort_key, "sort_key", 1, 200);
    if (!SORT_KEY.test(sk)) throw new ChangesetError("sort_key: geçersiz");
    const content = raw.content_json === null || raw.content_json === undefined ? null : sanitizeContent(raw.content_json as JSONContent);
    if (content && JSON.stringify(content).length > CHANGESET_LIMITS.maxBlockJsonBytes) throw new ChangesetError("İçerik kutusu çok büyük (en fazla ~2 MB)");
    const text = typeof raw.content_text === "string" ? raw.content_text : "";
    if (Buffer.byteLength(text, "utf8") > CHANGESET_LIMITS.maxContentTextBytes) throw new ChangesetError("İçerik metni çok uzun");
    const deleted_at = ts(raw.deleted_at, "deleted_at");
    const delete_batch_id = nullableUuid(raw.delete_batch_id, "delete_batch_id");
    if ((deleted_at === null) !== (delete_batch_id === null)) throw new ChangesetError("silme alanları birlikte olmalı");
    const sources = arr(raw.sources, "sources", CHANGESET_LIMITS.maxSourcesPerBlock).map((s, j): SourceChange => {
      if (!isObj(s)) throw new ChangesetError(`sources[${j}]`);
      const kind = String(s.kind);
      if (!SOURCE_KINDS.has(kind)) throw new ChangesetError("source.kind: geçersiz");
      return {
        id: uuid(s.id, "source.id"),
        kind: kind as SourceRef["kind"],
        title: str(s.title, "source.title", 1, 500),
        authors: optStr(s.authors, "source.authors", 500),
        year: optStr(s.year, "source.year", 9),
        doi: optStr(s.doi, "source.doi", 300, DOI),
        url: optStr(s.url, "source.url", 2000, URL_RE),
      };
    });
    return {
      id: uuid(raw.id, "blocks.id"),
      topic_id: uuid(raw.topic_id, "topic_id"),
      title: str(raw.title, "title", 1, 200),
      content_json: content,
      content_text: text,
      classification: cls,
      sort_key: sk,
      deleted_at,
      delete_batch_id,
      base_version: version(raw.base_version),
      sources,
    };
  });
  const links_add = arr(body.links_add, "links_add", CHANGESET_LIMITS.maxLinks).map((raw, i) => {
    if (!isObj(raw)) throw new ChangesetError(`links_add[${i}]`);
    const from = uuid(raw.from_topic_id, "from_topic_id");
    const to = uuid(raw.to_topic_id, "to_topic_id");
    if (from === to) throw new ChangesetError("Bir konu kendisine bağlanamaz");
    return { id: uuid(raw.id, "links_add.id"), from_topic_id: from, to_topic_id: to };
  });
  const links_remove = arr(body.links_remove, "links_remove", CHANGESET_LIMITS.maxLinks).map((v) => uuid(v, "links_remove"));
  const asset_links = arr(body.asset_links, "asset_links", CHANGESET_LIMITS.maxBlocks).map((raw, i) => {
    if (!isObj(raw)) throw new ChangesetError(`asset_links[${i}]`);
    return { asset_id: uuid(raw.asset_id, "asset_id"), block_id: uuid(raw.block_id, "block_id") };
  });
  const ids = new Set<string>();
  for (const x of [...topics, ...blocks]) {
    if (ids.has(x.id)) throw new ChangesetError("Aynı kimlik iki kez");
    ids.add(x.id);
  }
  return { topics, blocks, links_add, links_remove, ...(asset_links.length ? { asset_links } : {}) };
}
