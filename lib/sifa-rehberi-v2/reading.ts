/**
 * "Bütüncül Okuma" modeli — seçili ana konunun dolu başlıklarını ve içerik kutularını tek sayfada,
 * hiyerarşi ve kullanıcı sırasıyla (sortKey) verir. SAF ve salt-okunur: Workspace'i değiştirmez.
 *
 *  - Yalnız ana konunun KENDİ alt ağacı okunur; başka konudaki kayıtların içeriği gösterilmez,
 *    yalnız bağlantı olarak (ad + aslının yeri) listelenir.
 *  - Boş başlık (kendisinde ve altında dolu kutu yok) varsayılan olarak gizlenir.
 *  - Numara görünen kardeşler arasında verilir: 1, 1.1, 1.1.1 …
 */
import { blocksOf, childrenOf, linksFrom, nodeById, pathOf } from "@/lib/sifa-rehberi-v2/tree";
import { isRelatedSection, relatedEntries, type RelatedEntry } from "@/lib/sifa-rehberi-v2/related";
import type { Block, TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";

/** Kutu boş mu? (metin yok ve görsel yok) — BlockCard'daki kuralla aynı. */
export function isBlockEmpty(b: Block): boolean {
  return !b.contentText.trim() && !JSON.stringify(b.contentJson ?? {}).includes('"figure"');
}

export type ReadingSection = {
  node: TopicNode;
  number: string;
  /** 1 = ana konunun doğrudan alt başlığı. */
  depth: number;
  blocks: Block[];
  children: ReadingSection[];
  /** Yalnız İlişkili Rahatsızlıklar bölümünde: aslı burada olanlar + bağlananlar. */
  related: RelatedEntry[] | null;
  /** Bu başlıktan verilen bağlantılar (içerik kopyalanmaz; yalnız ad + aslının yeri). */
  links: LinkRef[];
};

export type LinkRef = { node: TopicNode; originPath: string[] };

export type TocItem = { id: string; number: string; title: string; depth: number };

export type Reading = {
  root: TopicNode;
  rootBlocks: Block[];
  sections: ReadingSection[];
  toc: TocItem[];
  /** Ana konudan doğrudan verilen bağlantılar (içerik gösterilmez). */
  rootLinks: LinkRef[];
  stats: { sections: number; blocks: number; hiddenEmpty: number };
};

export function rootOf(ws: Workspace, nodeId: string): TopicNode | null {
  return pathOf(ws, nodeId)[0] ?? null;
}

/** `keep`: boş olsa da gösterilecek başlık (ör. adı etkin aramayla eşleşen başlık gizlenmesin). */
export function buildReading(ws: Workspace, rootId: string, opts: { includeEmpty?: boolean; keep?: (n: TopicNode) => boolean } = {}): Reading | null {
  const root = nodeById(ws, rootId);
  if (!root) return null;
  const includeEmpty = Boolean(opts.includeEmpty);
  let hiddenEmpty = 0;
  let blockCount = 0;
  const filled = (id: string) => blocksOf(ws, id).filter((b) => !isBlockEmpty(b));

  const walk = (parentId: string, prefix: string, depth: number): ReadingSection[] => {
    const out: ReadingSection[] = [];
    for (const n of childrenOf(ws, parentId)) {
      const blocks = filled(n.id);
      const related = isRelatedSection(n) ? relatedEntries(ws, n.id) : null;
      const links = related ? [] : linkRefs(ws, n.id);
      const number = `${prefix}${out.length + 1}`;
      const children = walk(n.id, `${number}.`, depth + 1);
      const hasContent = blocks.length > 0 || children.length > 0 || Boolean(related?.length) || links.length > 0;
      if (!hasContent && !includeEmpty && !opts.keep?.(n)) {
        hiddenEmpty += 1; // altındakiler özyinelemede zaten sayıldı
        continue;
      }
      blockCount += blocks.length;
      out.push({ node: n, number, depth, blocks, children, related, links });
    }
    return out;
  };

  const rootBlocks = filled(rootId);
  blockCount += rootBlocks.length;
  const sections = walk(rootId, "", 1);
  const toc: TocItem[] = [];
  const flat = (list: ReadingSection[]) => {
    for (const s of list) {
      toc.push({ id: s.node.id, number: s.number, title: s.node.title, depth: s.depth });
      flat(s.children);
    }
  };
  flat(sections);
  const rootLinks = linkRefs(ws, rootId);
  return { root, rootBlocks, sections, toc, rootLinks, stats: { sections: toc.length, blocks: blockCount, hiddenEmpty } };
}

function linkRefs(ws: Workspace, nodeId: string): LinkRef[] {
  return linksFrom(ws, nodeId).map(({ node }) => ({ node, originPath: pathOf(ws, node.id).map((p) => p.title) }));
}
