/**
 * "İlişkili Rahatsızlıklar" bölümü — bir ana konunun ilişkili rahatsızlıklarını taşıyan alt başlık.
 *
 * Bölüm, KARARLI sistem anahtarıyla tanınır: templateKey = "bolum:iliskili_rahatsizliklar"
 * (görünen ad değil). Kullanıcının kendi açıp "İlişkili Rahatsızlıklar" adını verdiği başlık
 * sistem bölümü SAYILMAZ; ileride farklı dilde etiket de kimliği değiştirmez.
 * Sistem bölümü hazır başlık gibi kilitlidir: adı/yeri sabit, yalnız ana konunun hemen altında,
 * ana konu başına en fazla bir tane (DB: sifa_topics_template_once_uq).
 *  - Aslı bu konuda olan rahatsızlık  → bölümün ALT BAŞLIĞI (tek özgün kayıt).
 *  - Aslı başka konuda olan rahatsızlık → bölümden mevcut kayda BAĞLANTI (TopicLink); içerik
 *    kopyalanmaz, kayıt taşınmaz, mükerrer kayıt oluşmaz.
 */
import { addLink, addNode, childrenOf, linksFrom, nodeById, pathOf, subtreeIds, type Ctx } from "@/lib/sifa-rehberi-v2/tree";
import type { OpResult, TopicLink, TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";

export const RELATED_SECTION_TITLE = "İlişkili Rahatsızlıklar";
/** Kararlı sistem anahtarı — veritabanında template_key olarak saklanır. */
export const RELATED_SECTION_KEY = "bolum:iliskili_rahatsizliklar";
/** Önceki prototip etiketi; yalnız tohum kaydının görünen adı yükseltilir (kimlik değişmez). */
const LEGACY_SEED_TITLE = "Rahatsızlıklar";
const LEGACY_SEED_SUFFIX = "-n-rahatsizliklar";

export function isRelatedSection(n: TopicNode | null | undefined): boolean {
  return n?.templateKey === RELATED_SECTION_KEY;
}

/** Ana konunun (doğrudan alt başlığı olan) İlişkili Rahatsızlıklar bölümü. */
export function relatedSectionOf(ws: Workspace, rootId: string): TopicNode | null {
  return childrenOf(ws, rootId).find(isRelatedSection) ?? null;
}

export type RelatedEntry =
  | { kind: "asil"; node: TopicNode }
  | { kind: "bagli"; node: TopicNode; link: TopicLink; originPath: string[] };

/** Bölümdeki kayıtlar: önce aslı burada olanlar (kullanıcı sırası), sonra bağlananlar. */
export function relatedEntries(ws: Workspace, sectionId: string): RelatedEntry[] {
  const own: RelatedEntry[] = childrenOf(ws, sectionId).map((node) => ({ kind: "asil", node }));
  const linked: RelatedEntry[] = linksFrom(ws, sectionId).map(({ link, node }) => ({
    kind: "bagli",
    node,
    link,
    originPath: pathOf(ws, node.id).map((p) => p.title),
  }));
  return [...own, ...linked];
}

/** Bölümü ekler (varsa aynısını döner — idempotent). Yalnız ana konuya eklenir. */
export function addRelatedSection(ws: Workspace, rootId: string, ctx: Ctx): OpResult<{ ws: Workspace; sectionId: string }> {
  const root = nodeById(ws, rootId);
  if (!root || root.parentId !== null) return { ok: false, error: "İlişkili Rahatsızlıklar bölümü yalnız ana konuya eklenir." };
  const existing = relatedSectionOf(ws, rootId);
  if (existing) return { ok: true, value: { ws, sectionId: existing.id } };
  const r = addNode(ws, { parentId: rootId, title: RELATED_SECTION_TITLE }, ctx);
  if (!r.ok) return r;
  const id = r.value.node.id;
  const next = { ...r.value.ws, nodes: r.value.ws.nodes.map((n) => (n.id === id ? { ...n, templateKey: RELATED_SECTION_KEY } : n)) };
  return { ok: true, value: { ws: next, sectionId: id } };
}

/**
 * Başka yerde aslı bulunan bir kaydı bu bölüme BAĞLAR. Kayıt yerinden oynamaz; aynı bağlantı
 * ikinci kez eklenmez. Aslı zaten bu bölümde olan kayıt ya da bölümün kendi konusu reddedilir.
 */
export function linkRelated(ws: Workspace, sectionId: string, targetId: string, ctx: Ctx): OpResult {
  const section = nodeById(ws, sectionId);
  const target = nodeById(ws, targetId);
  if (!section || !target) return { ok: false, error: "Kayıt bulunamadı." };
  if (target.parentId === sectionId) return { ok: false, error: `“${target.title}” zaten bu bölümde (aslı burada); ayrıca bağlamaya gerek yok.` };
  if (pathOf(ws, sectionId).some((p) => p.id === targetId) || subtreeIds(ws, sectionId).has(targetId)) {
    return { ok: false, error: "Bir bölüm kendi konusuna veya kendi alt başlığına bağlanamaz." };
  }
  return addLink(ws, sectionId, targetId, ctx);
}

/**
 * Tarayıcıda önceki aşamalardan kalmış SENTETİK kayıtlar için yalnız TOHUM düğümünü (kimliğiyle)
 * yükseltir: görünen ad "İlişkili Rahatsızlıklar" + sistem anahtarı. Kimlik, yer, bağlantı,
 * zaman damgası değişmez; kullanıcının kendi açtığı başlıklara (adı ne olursa olsun) dokunulmaz.
 */
export function upgradeLegacyLabels(ws: Workspace): Workspace {
  const id = `${ws.ownerId}${LEGACY_SEED_SUFFIX}`;
  const n = ws.nodes.find((x) => x.id === id);
  if (!n || (n.templateKey === RELATED_SECTION_KEY && n.title === RELATED_SECTION_TITLE)) return ws;
  if (n.templateKey && n.templateKey !== RELATED_SECTION_KEY) return ws;
  if (n.title !== LEGACY_SEED_TITLE && n.title !== RELATED_SECTION_TITLE) return ws;
  return { ...ws, nodes: ws.nodes.map((x) => (x.id === id ? { ...x, title: RELATED_SECTION_TITLE, templateKey: RELATED_SECTION_KEY } : x)) };
}
