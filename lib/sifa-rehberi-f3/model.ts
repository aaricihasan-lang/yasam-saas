/**
 * Şifa Rehberi F3 — sunucu çalışma alanı (sifa_v2_load) ↔ onaylı F2 ekran durumu; ve "Kaydet" farkı (değişiklik kümesi).
 *
 * Ekran durumu, onaylı prototipin (C:\YasamSistemi-Gorsel-Tasarim\sifa-rehberi-sade-F2-onayli-rev7) veri biçimidir:
 *   topics  : ana konular            { id, title, createdAt, deletedAt }
 *   nodes   : başlıklar              { id, rootId, parentId(null = ana başlık), title, templateKey, kind?, order, deletedAt, deleteBatch? }
 *   notes   : başlık → notlar        { id, title, html, cls, sources, images, boxes, createdAt, updatedAt, deletedAt, deleteBatch?, inBatch? }
 *             not.boxes : kutular    { id, title, html, images, sources, links, deletedAt }
 *   links   : ilgili konular         { a, b }
 * Sunucuya özgü bilgiler (sürüm, sıralama anahtarı, parti, bağlantı kimliği) ayrı "meta" içinde tutulur; ekran durumunu
 * değiştirmez → "kaydedilmemiş değişiklik" karşılaştırması prototiptekiyle aynı kalır.
 *
 * Saf modül (DOM yok): HTML ↔ JSON çevirisi çağırandan verilir (tarayıcıda DOMParser; testte saf çevirici).
 */
import type { JSONContent } from "@tiptap/core";
import type { Changeset, SourceChange } from "@/lib/sifa-rehberi-v2/changeset";
import type { Block, SourceRef, Workspace } from "@/lib/sifa-rehberi-v2/types";
import { keyBetween } from "@/lib/sifa-rehberi-v2/sortKey";

export type Img = { id: string; src: string; caption: string };
export type Src = { id: string; title: string; authors?: string; year?: string; doi?: string; url?: string; kind?: string };
export type Link = { id: string; title: string; url: string };
export type Box = { id: string; title: string; html: string; images: Img[]; sources: Src[]; links: Link[]; deletedAt: string | null; deleteBatch?: string };
export type Note = {
  id: string;
  title: string;
  html: string;
  cls: string;
  sources: Src[];
  images: Img[];
  boxes: Box[];
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  deleteBatch?: string;
  inBatch?: boolean;
};
export type TopicRow = { id: string; title: string; createdAt: string; deletedAt: string | null };
export type NodeRow = {
  id: string;
  rootId: string;
  parentId: string | null;
  title: string;
  templateKey: string | null;
  kind?: "grup";
  order: number;
  deletedAt: string | null;
  deleteBatch?: string;
};
export type State = { topics: TopicRow[]; nodes: NodeRow[]; notes: Record<string, Note[]>; links: { a: string; b: string }[] };
export type Meta = {
  rows: Record<string, { version: number; sortKey: string; deleteBatchId: string | null }>;
  links: Record<string, string>;
};
export type HtmlCodec = { toHtml: (doc: JSONContent | null) => string; toJson: (html: string) => JSONContent; toText: (doc: JSONContent) => string };

export const ASSET_SRC_PREFIX = "asset:";
const CLS_TO_SERVER: Record<string, string> = { bilimsel: "bilimsel", geleneksel: "geleneksel", dini: "dini", uzman: "uzman_notu", diger: "diger" };
const CLS_FROM_SERVER: Record<string, string> = { bilimsel: "bilimsel", geleneksel: "geleneksel", dini: "dini", uzman_notu: "uzman", diger: "diger" };

/** Kanonik sıralama anahtarı (0-9a-z, '0' ile bitmez → lib/sifa-rehberi-v2/sortKey ile uyumlu, sözlük sırası = sayı sırası). */
export const canonKey = (i: number) => `${(i + 1).toString(36).padStart(5, "0")}m`;
/**
 * F3-R1 (Owner: içerik sayısına yapay sınır YOK): bir kardeş grubunun yeni sırası için ANAHTAR ATAMASI.
 * Sırası hâlâ doğru olan öğeler (mevcut anahtarların en uzun artan alt dizisi) anahtarını KORUR; yalnız yeni, taşınan
 * veya sırası bozulan öğeler komşularının ARASINA kesirli anahtar alır (lib/sifa-rehberi-v2/sortKey). Böylece bir
 * değişiklik yalnız gerçekten yer değiştiren satırları yazar; kardeş sayısı ne olursa olsun kayıt isteği büyümez
 * (eskiden gruptaki HER öğe yeniden anahtarlanıp tam içeriğiyle gönderiliyordu → istek başına teknik sınır, kalabalık
 * gruplarda fiilen sayı sınırına dönüşüyordu). Görünen sıra AYNIDIR (yalnız anahtar değerleri farklı).
 */
export function orderKeys(ids: readonly string[], existing: (id: string) => string | undefined): Map<string, string> {
  const keys = ids.map((id) => existing(id));
  // En uzun KESİN artan alt dizi (O(n log n)); anahtarı olmayan öğeler dışarıda.
  const tails: number[] = [];
  const prev: number[] = new Array(ids.length).fill(-1);
  for (let i = 0; i < ids.length; i++) {
    const k = keys[i];
    if (k === undefined) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((keys[tails[mid]] as string) < k) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep.add(i);
  const out = new Map<string, string>();
  let last: string | null = null;
  for (let i = 0; i < ids.length; i++) {
    if (keep.has(i)) {
      last = keys[i] as string;
      out.set(ids[i], last);
      continue;
    }
    let next: string | null = null;
    for (let j = i + 1; j < ids.length; j++) {
      if (keep.has(j)) {
        next = keys[j] as string;
        break;
      }
    }
    last = keyBetween(last, next);
    out.set(ids[i], last);
  }
  return out;
}
const bySort = <T extends { sortKey: string; id: string }>(a: T, b: T) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1);

function srcFromServer(s: SourceRef): Src {
  return { id: s.id, title: s.title, authors: s.authors ?? "", year: s.year ?? "", doi: s.doi ?? "", url: s.url ?? "", kind: s.kind };
}
const imgsOf = (b: Block): Img[] => (b.assets ?? []).map((a) => ({ id: a.id, src: `${ASSET_SRC_PREFIX}${a.id}`, caption: a.caption ?? "" }));

/** Sunucu çalışma alanı → ekran durumu + meta. */
export function workspaceToState(ws: Workspace, codec: Pick<HtmlCodec, "toHtml">): { state: State; meta: Meta } {
  const meta: Meta = { rows: {}, links: {} };
  const byId = new Map(ws.nodes.map((n) => [n.id, n]));
  const rootOf = (id: string): string => {
    let cur = byId.get(id);
    for (let i = 0; cur && cur.parentId && i < 40; i++) cur = byId.get(cur.parentId);
    return cur?.id ?? id;
  };
  for (const n of ws.nodes) meta.rows[n.id] = { version: n.version ?? 1, sortKey: n.sortKey, deleteBatchId: n.deleteBatchId };
  for (const b of ws.blocks) meta.rows[b.id] = { version: b.version ?? 1, sortKey: b.sortKey, deleteBatchId: b.deleteBatchId };

  const topics: TopicRow[] = ws.nodes
    .filter((n) => n.parentId === null)
    .map((n) => ({ id: n.id, title: n.title, createdAt: n.createdAt, deletedAt: n.deletedAt }));
  const rootIds = new Set(topics.map((t) => t.id));

  // Başlıklar: kendi başlıklarının sırası kardeşler arasında sıralama anahtarından (1..n); hazır başlıklar şablon sırasıyla gösterilir.
  const heads = ws.nodes.filter((n) => n.parentId !== null);
  const groups = new Map<string, typeof heads>();
  for (const n of heads) {
    if (n.templateKey) continue;
    const k = n.parentId as string;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  const orderOf = new Map<string, number>();
  for (const arr of groups.values()) arr.sort(bySort).forEach((n, i) => orderOf.set(n.id, i + 1));
  const nodes: NodeRow[] = heads.map((n) => ({
    id: n.id,
    rootId: rootOf(n.id),
    parentId: rootIds.has(n.parentId as string) ? null : n.parentId,
    title: n.title,
    templateKey: n.templateKey ?? null,
    ...(n.nodeKind === "grup" ? { kind: "grup" as const } : {}),
    order: n.templateKey ? 0 : (orderOf.get(n.id) ?? 1),
    deletedAt: n.deletedAt,
    ...(n.deletedAt && n.deleteBatchId ? { deleteBatch: n.deleteBatchId } : {}),
  }));

  // Notlar (üst kutular) ve içerik kutuları (alt kutular).
  const kids = new Map<string, Block[]>();
  for (const b of ws.blocks) if (b.parentBlockId) kids.set(b.parentBlockId, [...(kids.get(b.parentBlockId) ?? []), b]);
  const nodeBatch = new Map(ws.nodes.filter((n) => n.deletedAt).map((n) => [n.id, n.deleteBatchId]));
  const notes: Record<string, Note[]> = {};
  for (const b of [...ws.blocks.filter((x) => !x.parentBlockId)].sort(bySort)) {
    const boxes: Box[] = (kids.get(b.id) ?? []).sort(bySort).map((x) => ({
      id: x.id,
      title: x.title,
      html: codec.toHtml(x.contentJson),
      images: imgsOf(x),
      sources: x.sources.filter((s) => s.kind !== "baglanti").map(srcFromServer),
      links: x.sources.filter((s) => s.kind === "baglanti").map((s) => ({ id: s.id, title: s.title === s.url ? "" : s.title, url: s.url ?? "" })),
      deletedAt: x.deletedAt,
      ...(x.deletedAt && x.deleteBatchId ? { deleteBatch: x.deleteBatchId } : {}),
    }));
    const note: Note = {
      id: b.id,
      title: b.title,
      html: codec.toHtml(b.contentJson),
      cls: b.classification ? (CLS_FROM_SERVER[b.classification] ?? "") : "",
      sources: b.sources.filter((s) => s.kind !== "baglanti").map(srcFromServer),
      images: imgsOf(b),
      boxes,
      createdAt: b.createdAt,
      updatedAt: b.contentUpdatedAt ?? b.updatedAt,
      deletedAt: b.deletedAt,
      ...(b.deletedAt && b.deleteBatchId ? { deleteBatch: b.deleteBatchId } : {}),
      ...(b.deletedAt && b.deleteBatchId && batchOfAncestors(b.nodeId, byId, nodeBatch).has(b.deleteBatchId) ? { inBatch: true } : {}),
    };
    (notes[b.nodeId] ??= []).push(note);
  }

  const links: { a: string; b: string }[] = [];
  for (const l of ws.links) {
    links.push({ a: l.fromNodeId, b: l.toNodeId });
    meta.links[`${l.fromNodeId}|${l.toNodeId}`] = l.id;
  }
  return { state: { topics, nodes, notes, links }, meta };
}

function batchOfAncestors(id: string, byId: Map<string, Workspace["nodes"][number]>, nodeBatch: Map<string, string | null>): Set<string> {
  const out = new Set<string>();
  let cur = byId.get(id);
  for (let i = 0; cur && i < 40; i++) {
    const b = nodeBatch.get(cur.id);
    if (b) out.add(b);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

const sourceKind = (s: Src): SourceRef["kind"] =>
  s.kind && s.kind !== "baglanti" ? (s.kind as SourceRef["kind"]) : s.doi ? "makale" : s.url ? "web" : "diger";
function serverSources(sources: Src[], links: Link[]): SourceChange[] {
  return [
    ...sources.map((s) => ({ id: s.id, kind: sourceKind(s), title: s.title, authors: s.authors || undefined, year: s.year || undefined, doi: s.doi || undefined, url: s.url || undefined })),
    ...links.map((l) => ({ id: l.id, kind: "baglanti" as const, title: l.title?.trim() ? l.title : l.url, url: l.url })),
  ];
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Ekran durumu farkı → değişiklik kümesi. `newId` yeni kimlik üretir (bağlantı / çöp partisi).
 * Sıralama: bir kardeş grubunda üye/sıra değiştiyse grubun TAMAMI kanonik anahtar alır (karışık anahtar sırası bozulmaz).
 */
export function stateToChangeset(saved: State, draft: State, meta: Meta, codec: Pick<HtmlCodec, "toJson" | "toText">, newId: () => string): Changeset {
  const cs: Changeset = { topics: [], blocks: [], links_add: [], links_remove: [] };
  const ver = (id: string) => meta.rows[id]?.version ?? null;
  const batchFor = (id: string, local?: string) => local ?? meta.rows[id]?.deleteBatchId ?? newId();

  // ── Ana konular
  const sTopic = new Map(saved.topics.map((t) => [t.id, t]));
  for (const t of draft.topics) {
    const p = sTopic.get(t.id);
    if (p && p.title === t.title && !!p.deletedAt === !!t.deletedAt) continue;
    cs.topics.push({
      id: t.id,
      parent_id: null,
      title: t.title,
      sort_key: meta.rows[t.id]?.sortKey ?? "m",
      template_key: null,
      deleted_at: t.deletedAt ? t.deletedAt : null,
      delete_batch_id: t.deletedAt ? batchFor(t.id) : null,
      base_version: ver(t.id),
    });
  }

  // ── Başlıklar (sıralama grubu = aynı konu + aynı üst; yalnız kendi başlıkları)
  const groupKey = (n: NodeRow) => `${n.rootId}|${n.parentId ?? ""}`;
  const orderSig = (list: NodeRow[]) => (g: string) =>
    list.filter((n) => !n.templateKey && groupKey(n) === g).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1)).map((n) => n.id).join(",");
  const sSig = orderSig(saved.nodes);
  const dSig = orderSig(draft.nodes);
  const reKey = new Map<string, string>();
  const groupsDraft = new Set(draft.nodes.filter((n) => !n.templateKey).map(groupKey));
  for (const g of groupsDraft) {
    if (sSig(g) === dSig(g)) continue;
    for (const [nid, k] of orderKeys(dSig(g).split(",").filter(Boolean), (x) => meta.rows[x]?.sortKey)) reKey.set(nid, k);
  }
  const TPL_KEY = (n: NodeRow, idx: number) => meta.rows[n.id]?.sortKey ?? canonKey(idx);
  const sNode = new Map(saved.nodes.map((n) => [n.id, n]));
  draft.nodes.forEach((n, idx) => {
    const p = sNode.get(n.id);
    const sortKey = n.templateKey ? TPL_KEY(n, idx) : (reKey.get(n.id) ?? meta.rows[n.id]?.sortKey ?? canonKey(n.order));
    const changed =
      !p ||
      p.title !== n.title ||
      p.parentId !== n.parentId ||
      (p.kind ?? null) !== (n.kind ?? null) ||
      !!p.deletedAt !== !!n.deletedAt ||
      (p.deleteBatch ?? null) !== (n.deleteBatch ?? null) ||
      sortKey !== (meta.rows[n.id]?.sortKey ?? null);
    if (!changed) return;
    cs.topics.push({
      id: n.id,
      parent_id: n.parentId ?? n.rootId,
      title: n.title,
      sort_key: sortKey,
      template_key: n.templateKey ?? null,
      node_kind: n.kind === "grup" ? "grup" : null,
      deleted_at: n.deletedAt ? n.deletedAt : null,
      delete_batch_id: n.deletedAt ? batchFor(n.id, n.deleteBatch) : null,
      base_version: ver(n.id),
    });
  });

  // ── Notlar ve kutular
  const savedNote = new Map<string, Note>();
  const savedBox = new Map<string, { box: Box; noteId: string }>();
  const savedImg = new Map<string, { img: Img; blockId: string }>();
  for (const arr of Object.values(saved.notes)) {
    for (const n of arr) {
      savedNote.set(n.id, n);
      for (const g of n.images ?? []) savedImg.set(g.id, { img: g, blockId: n.id });
      for (const b of n.boxes ?? []) {
        savedBox.set(b.id, { box: b, noteId: n.id });
        for (const g of b.images ?? []) savedImg.set(g.id, { img: g, blockId: b.id });
      }
    }
  }
  const draftBoxIds = new Set<string>();
  const draftImgIds = new Set<string>();
  const sig = (arr: { id: string }[] | undefined) => (arr ?? []).map((x) => x.id).join(",");
  for (const [hid, arr] of Object.entries(draft.notes)) {
    const reNotes = sig(saved.notes[hid]) !== sig(arr);
    const noteKeys = reNotes ? orderKeys(arr.map((x) => x.id), (x) => meta.rows[x]?.sortKey) : null;
    arr.forEach((n, i) => {
      const p = savedNote.get(n.id);
      const sortKey = noteKeys?.get(n.id) ?? meta.rows[n.id]?.sortKey ?? canonKey(i);
      const changed =
        !p ||
        p.title !== n.title ||
        p.html !== n.html ||
        p.cls !== n.cls ||
        !same(p.sources, n.sources) ||
        !!p.deletedAt !== !!n.deletedAt ||
        (p.deleteBatch ?? null) !== (n.deleteBatch ?? null) ||
        sortKey !== (meta.rows[n.id]?.sortKey ?? null);
      if (changed) {
        const json = codec.toJson(n.html);
        cs.blocks.push({
          id: n.id,
          topic_id: hid,
          parent_block_id: null,
          title: n.title,
          content_json: json,
          content_text: codec.toText(json),
          classification: n.cls ? (CLS_TO_SERVER[n.cls] ?? null) : null,
          sort_key: sortKey,
          deleted_at: n.deletedAt ? n.deletedAt : null,
          delete_batch_id: n.deletedAt ? batchFor(n.id, n.deleteBatch) : null,
          base_version: ver(n.id),
          sources: serverSources(n.sources ?? [], []),
        });
      }
      const pBoxes = p?.boxes ?? [];
      const reBoxes = sig(pBoxes) !== sig(n.boxes);
      const boxKeys = reBoxes ? orderKeys((n.boxes ?? []).map((x) => x.id), (x) => meta.rows[x]?.sortKey) : null;
      (n.boxes ?? []).forEach((b, j) => {
        draftBoxIds.add(b.id);
        const pb = savedBox.get(b.id)?.box;
        const bKey = boxKeys?.get(b.id) ?? meta.rows[b.id]?.sortKey ?? canonKey(j);
        const bChanged =
          !pb ||
          pb.title !== b.title ||
          pb.html !== b.html ||
          !same(pb.sources, b.sources) ||
          !same(pb.links, b.links) ||
          !!pb.deletedAt !== !!b.deletedAt ||
          bKey !== (meta.rows[b.id]?.sortKey ?? null);
        if (!bChanged) return;
        const json = codec.toJson(b.html);
        cs.blocks.push({
          id: b.id,
          topic_id: hid,
          parent_block_id: n.id,
          title: b.title,
          content_json: json,
          content_text: codec.toText(json),
          classification: null,
          sort_key: bKey,
          deleted_at: b.deletedAt ? b.deletedAt : null,
          delete_batch_id: b.deletedAt ? batchFor(b.id, b.deleteBatch) : null,
          base_version: ver(b.id),
          sources: serverSources(b.sources ?? [], b.links ?? []),
        });
      });
      // Görseller (not + kutular): yeni bağlanan ya da açıklaması değişen.
      const owners: { blockId: string; images: Img[] }[] = [{ blockId: n.id, images: n.images ?? [] }, ...(n.boxes ?? []).map((b) => ({ blockId: b.id, images: b.images ?? [] }))];
      for (const o of owners) {
        for (const g of o.images) {
          draftImgIds.add(g.id);
          const s = savedImg.get(g.id);
          if (s && s.blockId === o.blockId && (s.img.caption ?? "") === (g.caption ?? "")) continue;
          (cs.assets_set ??= []).push({ id: g.id, block_id: o.blockId, caption: g.caption?.trim() ? g.caption : null });
        }
      }
    });
  }

  // Kalıcı silinen İÇERİK KUTULARI (Silinenler'e gitmez). Görselleri sunucuda kutuyla birlikte silinir.
  const goneBoxImgs = new Set<string>();
  for (const [bid, { box }] of savedBox) {
    if (draftBoxIds.has(bid)) continue;
    (cs.blocks_delete ??= []).push({ id: bid, base_version: ver(bid) ?? 1 });
    for (const g of box.images ?? []) goneBoxImgs.add(g.id);
  }
  // Kaldırılan görseller (silinen kutunun görselleri hariç — onları sunucu kutuyla siler).
  for (const gid of savedImg.keys()) {
    if (draftImgIds.has(gid) || goneBoxImgs.has(gid)) continue;
    (cs.assets_delete ??= []).push(gid);
  }

  // ── İlgili konu bağlantıları
  const k = (l: { a: string; b: string }) => `${l.a}|${l.b}`;
  const sLinks = new Set(saved.links.map(k));
  const dLinks = new Set(draft.links.map(k));
  for (const l of draft.links) if (!sLinks.has(k(l))) cs.links_add.push({ id: newId(), from_topic_id: l.a, to_topic_id: l.b });
  for (const l of saved.links) if (!dLinks.has(k(l)) && meta.links[k(l)]) cs.links_remove.push(meta.links[k(l)]);
  return cs;
}
