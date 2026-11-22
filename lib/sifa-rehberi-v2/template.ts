/**
 * "Şifa Rehberi Şablonu" — production Şifa Rehberi'nin HAZIR başlıkları.
 *
 * TEK KAYNAK: production `lib/sifa-rehberi/topicTree.ts#TOPIC_GROUPS` (SALT-OKUNUR içe aktarım).
 * Burada hiçbir başlık adı/grubu elle yazılmaz → adlar, sıra ve gruplar production ile birebir.
 *
 * Production ekran kuralları aynen izlenir:
 *  - "rahatsizlik" grubu = kaydın kendisi (ad/kategori/görsel; not yok) → V2'de KONUNUN KENDİSİ,
 *    ayrı başlık oluşturulmaz.
 *  - Tek alt konulu gruplar (Doğaltaş & Mineral, Aromaterapi, İslami Öneriler) production'da tek
 *    düğüm gösterilir (app/sifa-rehberi/page.tsx `single`) → V2'de de TEK başlık.
 *  - Çok alt konulu gruplar → grup başlığı + altında hazır alt başlıklar.
 * Her hazır başlık production `section_type` + `mode` karşılığını taşır → ileride mevcut
 * healing_guide_sections notları doğru başlığa KAYIPSIZ taşınabilir (bu aşamada taşıma YOK).
 */
import { TOPIC_GROUPS } from "@/lib/sifa-rehberi/topicTree";
import { keyBetween } from "@/lib/sifa-rehberi-v2/sortKey";
import { childrenOf, nodeById, type Ctx } from "@/lib/sifa-rehberi-v2/tree";
import type { OpResult, TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";

export type TemplateEntry = {
  key: string;
  label: string;
  icon: string;
  parentKey: string | null;
  /** Production grup etiketi (bilgi rozeti için). */
  groupLabel: string;
  /** Production karşılığı (grup başlığında yok). */
  sectionType?: string;
  mode?: string;
  legacyKey?: string;
};

function buildEntries(): TemplateEntry[] {
  const out: TemplateEntry[] = [];
  for (const g of TOPIC_GROUPS) {
    if (g.kind === "rahatsizlik") continue; // konunun kendisi
    if (g.topics.length === 1) {
      const t = g.topics[0];
      out.push({ key: `konu:${t.id}`, label: t.label, icon: t.icon, parentKey: null, groupLabel: g.label, sectionType: t.section_type, mode: t.mode, legacyKey: t.legacyKey });
      continue;
    }
    const gk = `grup:${g.id}`;
    out.push({ key: gk, label: g.label, icon: g.icon, parentKey: null, groupLabel: g.label });
    for (const t of g.topics) {
      out.push({ key: `konu:${t.id}`, label: t.label, icon: t.icon, parentKey: gk, groupLabel: g.label, sectionType: t.section_type, mode: t.mode, legacyKey: t.legacyKey });
    }
  }
  return out;
}

export const TEMPLATE_ENTRIES: readonly TemplateEntry[] = buildEntries();
const BY_KEY = new Map(TEMPLATE_ENTRIES.map((e) => [e.key, e]));

export function templateEntry(key: string | null | undefined): TemplateEntry | null {
  return key ? (BY_KEY.get(key) ?? null) : null;
}

export function isTemplateNode(n: TopicNode | null | undefined): boolean {
  return Boolean(n?.templateKey);
}

/** Şablon yalnız kullanıcı başlığına (hazır başlık olmayan) uygulanabilir. */
export function canApplyTemplate(ws: Workspace, nodeId: string): boolean {
  const n = nodeById(ws, nodeId);
  return Boolean(n && !n.templateKey);
}

function liveTemplateChild(ws: Workspace, parentId: string, key: string): TopicNode | null {
  return childrenOf(ws, parentId).find((c) => c.templateKey === key) ?? null;
}

/** Konuda eksik olan hazır başlık sayısı (0 → şablon tam). */
export function missingTemplateCount(ws: Workspace, rootId: string): number {
  let missing = 0;
  const groupIds = new Map<string, string | null>();
  for (const e of TEMPLATE_ENTRIES) {
    const parentId = e.parentKey ? (groupIds.get(e.parentKey) ?? null) : rootId;
    const found = parentId ? liveTemplateChild(ws, parentId, e.key) : null;
    if (!e.parentKey) groupIds.set(e.key, found?.id ?? null);
    if (!found) missing++;
  }
  return missing;
}

/**
 * Şablonu bir konuya uygular. İDEMPOTENT: var olan hazır başlıklar tekrar eklenmez, mevcut
 * kullanıcı başlıklarına ve içeriklere DOKUNULMAZ; yalnız eksik hazır başlıklar sona eklenir.
 */
export function applyTemplate(ws: Workspace, rootId: string, ctx: Ctx): OpResult<{ ws: Workspace; added: number }> {
  if (!canApplyTemplate(ws, rootId)) {
    return { ok: false, error: "Şablon yalnız kendi oluşturduğunuz bir konuya eklenebilir." };
  }
  const nodes = [...ws.nodes];
  let cur: Workspace = { ...ws, nodes };
  const groupIds = new Map<string, string>();
  let added = 0;
  for (const e of TEMPLATE_ENTRIES) {
    const parentId = e.parentKey ? groupIds.get(e.parentKey) : rootId;
    if (!parentId) continue;
    const existing = liveTemplateChild(cur, parentId, e.key);
    if (existing) {
      if (!e.parentKey) groupIds.set(e.key, existing.id);
      continue;
    }
    const sibs = childrenOf(cur, parentId);
    const node: TopicNode = {
      id: ctx.newId(),
      ownerId: ws.ownerId,
      parentId,
      title: e.label,
      sortKey: keyBetween(sibs.length ? sibs[sibs.length - 1].sortKey : null, null),
      templateKey: e.key,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
      deleteBatchId: null,
    };
    nodes.push(node);
    cur = { ...ws, nodes };
    if (!e.parentKey) groupIds.set(e.key, node.id);
    added++;
  }
  return { ok: true, value: { ws: cur, added } };
}
