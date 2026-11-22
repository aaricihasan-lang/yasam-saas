/**
 * Şifa Rehberi V1 (healing_guides / healing_guide_sections) → V2 aktarım PLANLAYICISI (SAF).
 *
 * 7. aşama Owner kararı: V1 kayıtları TENANT'ın KURUM ORTAK kaydı olur (owner_key = tenant_id,
 * scope = 'kurum'); hiçbir uzmana kişisel kayıt olarak atanmaz; tenant'taki yetkili uzmanlar OKUR,
 * başka tenant asla göremez; varsayılan SALT-OKUNUR.
 *
 * KAYNAK DEĞİŞTİRİLMEZ: planlayıcı yalnız V1 satırlarını OKUR. Uygulama tek DB işlemiyle yapılır
 * (public.sifa_v2_import_legacy). Kimlikler DETERMİNİSTİK (UUID v5, tenant + V1 kimliği) → aynı kayıt
 * tekrar aktarıldığında mükerrer satır oluşmaz; harita (sifa_legacy_import_map) aktarılanı atlar.
 *
 * EŞLEME KURALLARI (tahmin YOK, veri ATILMAZ):
 *  - Kayıt (guide)        → kurum ana konusu (+ 25 hazır başlık, kararlı anahtarlarla).
 *                           Ad 200 karakteri aşarsa başlık kısaltılır ("…") ve TAM ad "V1 kayıt bilgileri"
 *                           kutusunda korunur → raporlanır ("ad_kisaltildi").
 *  - Bölüm notu (section) → (section_type, mode) production TOPICS'te TAM eşleşirse o hazır başlığa kutu.
 *                           TAM eşleşmeyen (V1'in "yedek başlığa düşürdüğü") notlar ATILMAZ ve rastgele
 *                           başlığa da KONMAZ: ana konunun altındaki "V1'den Eşleşmeyen Notlar" sistem
 *                           bölümüne (bolum:v1_eslesmeyen), ÖZGÜN V1 konumu + ham içerikle, işaretli konur.
 *  - Bölüm yoksa düz kolonlar → V1 ekranıyla aynı: legacyKey'i tanımlı hazır başlığa kutu.
 *                           Bölüm VARSA düz kolonları V1 de göstermez → ATILMAZ: "V1 kayıt bilgileri"
 *                           kutusunda "V1'de gösterilmeyen eski alanlar" olarak korunur, raporlanır.
 *  - Görsel               → V1'in KENDİ çözümleyicisi (resolveHealingImagePath): file_path ya da eski
 *                           public URL (yalnız izinli Supabase alan adı) → aynı tenant yolu. Kurum görseli
 *                           salt-okunur referans + içerikte görünür figür (sifa-asset:<id>). Başka tenant /
 *                           çözülemeyen yol aktarılmaz, raporlanır.
 */
import crypto from "node:crypto";
import { normalizeModeKey } from "@/lib/sifa-rehberi/sectionModel";
import { resolveHealingImagePath } from "@/lib/sifa-rehberi/stonePhotoStorage";
import { resolveTopicId, TOPICS } from "@/lib/sifa-rehberi/topicTree";
import { keyBetween } from "@/lib/sifa-rehberi-v2/sortKey";
import { TEMPLATE_ENTRIES } from "@/lib/sifa-rehberi-v2/template";
import { childrenOf, blocksOf, nodeById } from "@/lib/sifa-rehberi-v2/tree";
import type { JSONContent } from "@tiptap/core";
import type { Workspace } from "@/lib/sifa-rehberi-v2/types";

export const UNMATCHED_SECTION_KEY = "bolum:v1_eslesmeyen";
export const UNMATCHED_SECTION_TITLE = "V1'den Eşleşmeyen Notlar";

export type V1Image = { id?: string; name?: string; file_path?: string | null; url?: string | null; section?: string };
export type V1Guide = Record<string, unknown> & { id: string; tenant_id: string; name: string | null; images?: unknown };
export type V1Section = {
  id: string;
  guide_id: string;
  section_type: string;
  mode: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
  source_kind: string | null;
  expert_note: string | null;
  attention: string | null;
  images: unknown;
  sort_order: number | null;
};
export type MapRow = { legacy_kind: "guide" | "section" | "image"; legacy_id: string; target_kind: "topic" | "block" | "asset"; target_id: string; source_hash: string };

export type ImportIssue = {
  guideId: string;
  sectionId?: string;
  kind: "belirsiz_eslesme" | "ad_kisaltildi" | "gorsel_reddedildi" | "gorsel_cozulemedi" | "duz_kolon_gosterilmiyor" | "kaynak_degismis" | "silinmis_hedef";
  detail: string;
};
export type GuidePlan = {
  guideId: string;
  status: "yeni" | "eksik_tamamlandi" | "zaten_aktarildi" | "aktarilmadi";
  changes: { topics: unknown[]; blocks: unknown[]; assets: unknown[] };
  map: MapRow[];
  counts: { sections: number; sectionsExact: number; sectionsUnmatched: number; legacyColumns: number; images: number; imagesImported: number };
};
export type ImportPlan = { guides: GuidePlan[]; issues: ImportIssue[] };

// ── UUID v5 (RFC 4122, SHA-1) ────────────────────────────────────────────────
const NS = "6f0d1c39-2b8e-5a51-9d3c-5f1a0b7e2c44"; // Şifa V2 aktarım ad alanı (sabit)
export function uuidV5(name: string, namespace = NS): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = crypto.createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** Kaynak satırın kanonik özeti — kaynak sonradan değişirse tespit edilir. */
export function sourceHash(row: unknown): string {
  const canon = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
  return crypto.createHash("sha256").update(JSON.stringify(canon(row))).digest("hex");
}

const textOf = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Düz metni paragraflara çevirir (boş satır = yeni paragraf, tek satır sonu = satır kırılımı). */
function paragraphs(text: string, label?: string): JSONContent[] {
  const out: JSONContent[] = [];
  text.split(/\n{2,}/).forEach((chunk, i) => {
    const lines = chunk.split("\n");
    const content: JSONContent[] = [];
    if (label && i === 0) content.push({ type: "text", text: `${label}: `, marks: [{ type: "bold" }] });
    lines.forEach((ln, j) => {
      if (j > 0) content.push({ type: "hardBreak" });
      if (ln) content.push({ type: "text", text: ln });
    });
    if (content.length) out.push({ type: "paragraph", content });
  });
  return out;
}

function images(v: unknown): V1Image[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as V1Image[]) : [];
}

function labelOfRelated(v: unknown): string {
  if (!Array.isArray(v)) return "";
  return v
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).title ?? JSON.stringify(x)) : String(x)))
    .filter(Boolean)
    .join(", ");
}

const TEMPLATE_BY_TOPIC = new Map(TEMPLATE_ENTRIES.filter((e) => e.key.startsWith("konu:")).map((e) => [e.key.slice(5), e]));

/**
 * Bir tenant için aktarım planı (kurum kapsamı).
 * @param ws        tenant'ın MEVCUT kurum kayıtları (sifa_v2_load çıktısının scope='kurum' kısmı yeterli)
 * @param existing  tenant'ın aktarım haritası satırları
 * @param opts.supabaseHost  V1 eski public URL'lerinin izinli alan adı (V1 resolveHealingImagePath ile aynı)
 */
export function planLegacyImport(
  input: { tenantId: string; guides: V1Guide[]; sections: V1Section[] },
  ws: Workspace,
  existing: MapRow[],
  opts: { supabaseHost?: string } = {},
): ImportPlan {
  const issues: ImportIssue[] = [];
  const guides: GuidePlan[] = [];
  const mapped = new Map(existing.map((m) => [`${m.legacy_kind}:${m.legacy_id}`, m]));
  const { tenantId } = input;
  const host = opts.supabaseHost ?? "";

  for (const g of [...input.guides].filter((x) => x.tenant_id === tenantId).sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const secs = input.sections.filter((s) => s.guide_id === g.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id));
    const plan: GuidePlan = {
      guideId: g.id,
      status: "yeni",
      changes: { topics: [], blocks: [], assets: [] },
      map: [],
      counts: { sections: secs.length, sectionsExact: 0, sectionsUnmatched: 0, legacyColumns: 0, images: 0, imagesImported: 0 },
    };
    const fullName = textOf(g.name) || "(adsız V1 kaydı)";
    const title = fullName.length > 200 ? `${fullName.slice(0, 199)}…` : fullName;
    const gHash = sourceHash({ ...g, images: undefined });
    const rootId = uuidV5(`guide:${tenantId}:${g.id}`);
    const prevGuide = mapped.get(`guide:${g.id}`);
    const rootExists = Boolean(ws.nodes.find((n) => n.id === rootId));
    if (prevGuide && prevGuide.source_hash !== gHash) {
      issues.push({ guideId: g.id, kind: "kaynak_degismis", detail: "V1 kaydının üst bilgileri ilk aktarımdan sonra değişmiş; V2'deki kurum kopyası GÜNCELLENMEDİ (üzerine yazma yok)." });
    }
    if (rootExists && !nodeById(ws, rootId)) {
      issues.push({ guideId: g.id, kind: "silinmis_hedef", detail: "Hedef kurum kaydı V2'de çöpte; yeni bölümler eklenmedi." });
      plan.status = "aktarilmadi";
      guides.push(plan);
      continue;
    }
    if (!rootExists && fullName.length > 200) {
      issues.push({ guideId: g.id, kind: "ad_kisaltildi", detail: `Ad ${fullName.length} karakter; başlık 200'e kısaltıldı, TAM ad "V1 kayıt bilgileri" kutusunda korundu.` });
    }

    const tplId = (key: string) => uuidV5(`tpl:${rootId}:${key}`);
    const unmatchedId = uuidV5(`unmatched:${rootId}`);
    let unmatchedCreated = Boolean(ws.nodes.find((n) => n.id === unmatchedId));
    if (!rootExists) {
      plan.changes.topics.push({ id: rootId, parent_id: null, title, sort_key: rootSortKey(ws, g, input.guides), template_key: null, deleted_at: null, delete_batch_id: null, base_version: null });
      const lastInGroup = new Map<string | null, string | null>();
      for (const e of TEMPLATE_ENTRIES) {
        const parent = e.parentKey ? tplId(e.parentKey) : rootId;
        const sk = keyBetween(lastInGroup.get(parent) ?? null, null);
        lastInGroup.set(parent, sk);
        plan.changes.topics.push({ id: tplId(e.key), parent_id: parent, title: e.label, sort_key: sk, template_key: e.key, deleted_at: null, delete_batch_id: null, base_version: null });
      }
      plan.map.push({ legacy_kind: "guide", legacy_id: g.id, target_kind: "topic", target_id: rootId, source_hash: gHash });
    } else {
      plan.status = "zaten_aktarildi";
    }

    const nextKey = new Map<string, string | null>();
    const appendKey = (topicId: string) => {
      const prev = nextKey.has(topicId) ? nextKey.get(topicId)! : (blocksOf(ws, topicId).at(-1)?.sortKey ?? null);
      const k = keyBetween(prev, null);
      nextKey.set(topicId, k);
      return k;
    };
    /** Görselleri çözer: kurum referans satırı + içeriğe görünür figür. */
    const figures = (blockId: string, list: V1Image[], ownerLabel: string, legacyPrefix: string): JSONContent[] => {
      const out: JSONContent[] = [];
      for (const [i, im] of list.entries()) {
        plan.counts.images++;
        const legacyId = `${legacyPrefix}:${im.id ?? i}`;
        const assetId = uuidV5(`asset:${tenantId}:${legacyId}`);
        const caption = textOf(im.name);
        if (mapped.has(`image:${legacyId}`)) {
          out.push({ type: "figure", attrs: { src: `sifa-asset:${assetId}`, alt: caption, caption } });
          continue;
        }
        const path = resolveHealingImagePath(im as never, tenantId, host);
        if (!path) {
          const fp = typeof im.file_path === "string" ? im.file_path : "";
          const foreign = fp && !fp.startsWith(`healing-guides/${tenantId}/`);
          issues.push({
            guideId: g.id,
            kind: foreign ? "gorsel_reddedildi" : "gorsel_cozulemedi",
            detail: foreign ? `${ownerLabel}: yol bu tenant'a ait değil / güvensiz; aktarılmadı.` : `${ownerLabel}: file_path yok ve eski URL izinli alan adıyla çözülemedi; aktarılmadı.`,
          });
          continue;
        }
        plan.changes.assets.push({ id: assetId, block_id: blockId, storage_path: path, caption: caption || null });
        plan.map.push({ legacy_kind: "image", legacy_id: legacyId, target_kind: "asset", target_id: assetId, source_hash: sourceHash(im) });
        plan.counts.imagesImported++;
        out.push({ type: "figure", attrs: { src: `sifa-asset:${assetId}`, alt: caption, caption } });
      }
      return out;
    };

    const flatCols = TEMPLATE_ENTRIES.filter((e) => e.legacyKey && textOf(g[e.legacyKey]));
    // Kayıt üst bilgileri + kayıt düzeyi görseller (+ uzun tam ad, V1'de gösterilmeyen düz kolonlar)
    if (!rootExists) {
      const info: JSONContent[] = [];
      if (fullName.length > 200) info.push(...paragraphs(fullName, "Özgün ad (tam)"));
      const cat = textOf(g.category);
      if (cat) info.push(...paragraphs(cat, "Kategori"));
      const sym = textOf(g.symptoms);
      if (sym) info.push(...paragraphs(sym, "Belirtiler (V1 alanı)"));
      const st = labelOfRelated(g.related_stones);
      if (st) info.push(...paragraphs(st, "İlişkili doğaltaşlar (V1)"));
      const rf = labelOfRelated(g.related_reflexology);
      if (rf) info.push(...paragraphs(rf, "İlişkili refleksoloji (V1)"));
      if (secs.length && flatCols.length) {
        info.push({ type: "paragraph", content: [{ type: "text", text: "V1'de gösterilmeyen eski alanlar (bölüm notları olduğu için V1 ekranında görünmüyordu):", marks: [{ type: "bold" }] }] });
        for (const e of flatCols) info.push(...paragraphs(textOf(g[e.legacyKey!]), e.label));
        plan.counts.legacyColumns = flatCols.length;
        issues.push({ guideId: g.id, kind: "duz_kolon_gosterilmiyor", detail: `${flatCols.length} eski düz kolon dolu ama kayıtta bölüm var; V1 göstermiyor → ATILMADI, "V1 kayıt bilgileri" kutusunda işaretli korundu.` });
      }
      const gImgs = images(g.images);
      if (info.length || gImgs.length) {
        const bid = uuidV5(`guideinfo:${tenantId}:${g.id}`);
        const figs = figures(bid, gImgs, "kayıt görseli", `guide:${g.id}`);
        const content = [...info, ...figs];
        plan.changes.blocks.push(block(bid, rootId, "V1 kayıt bilgileri", { type: "doc", content: content.length ? content : [{ type: "paragraph", content: [{ type: "text", text: "V1 kayıt görselleri" }] }] }, appendKey(rootId)));
      }
    }

    if (secs.length) {
      for (const s of secs) {
        if (mapped.has(`section:${s.id}`)) continue;
        const modeKey = normalizeModeKey(s.mode);
        const exact = TOPICS.find((t) => t.section_type === s.section_type && t.mode === modeKey);
        const v1Topic = resolveTopicId(s);
        const isExact = Boolean(exact && exact.id === v1Topic && TEMPLATE_BY_TOPIC.get(exact.id));
        let target: string;
        let blockTitle: string;
        const content: JSONContent[] = [];
        if (isExact) {
          const entry = TEMPLATE_BY_TOPIC.get(exact!.id)!;
          target = tplId(entry.key);
          blockTitle = textOf(s.title) || entry.label;
          plan.counts.sectionsExact++;
        } else {
          if (!unmatchedCreated) {
            plan.changes.topics.push({ id: unmatchedId, parent_id: rootId, title: UNMATCHED_SECTION_TITLE, sort_key: "zz", template_key: UNMATCHED_SECTION_KEY, deleted_at: null, delete_batch_id: null, base_version: null });
            unmatchedCreated = true;
          }
          target = unmatchedId;
          blockTitle = `${textOf(s.title) || "Not"} — V1: ${s.section_type}/${s.mode ?? "(boş)"}`.slice(0, 200);
          content.push({
            type: "paragraph",
            content: [
              { type: "text", text: "Özgün V1 konumu: ", marks: [{ type: "bold" }] },
              { type: "text", text: `section_type="${s.section_type}", mode="${s.mode ?? ""}". V1 bu notu "${TOPICS.find((t) => t.id === v1Topic)?.label ?? v1Topic}" başlığında (yedek eşleşmeyle) gösteriyordu; tam eşleşme olmadığı için buraya, olduğu gibi konuldu.` },
            ],
          });
          plan.counts.sectionsUnmatched++;
          issues.push({ guideId: g.id, sectionId: s.id, kind: "belirsiz_eslesme", detail: `section_type='${s.section_type}', mode='${s.mode ?? ""}' tam eşleşmiyor (V1 yedek: '${v1Topic}') → "${UNMATCHED_SECTION_TITLE}" bölümüne ham içerik + özgün konumla işaretli konuldu.` });
        }
        content.push(
          ...paragraphs(textOf(s.note)),
          ...paragraphs(textOf(s.attention), "Dikkat"),
          ...paragraphs(textOf(s.expert_note), "Uzman notu"),
          ...paragraphs([textOf(s.source), textOf(s.source_kind) ? `(${textOf(s.source_kind)})` : ""].filter(Boolean).join(" "), "Kaynak"),
        );
        const bid = uuidV5(`section:${tenantId}:${s.id}`);
        content.push(...figures(bid, images(s.images), `bölüm ${s.id}`, `section:${s.id}`));
        if (!content.length) content.push({ type: "paragraph", content: [{ type: "text", text: "(V1 bölümünde metin yok)" }] });
        plan.changes.blocks.push(block(bid, target, blockTitle, { type: "doc", content }, appendKey(target)));
        plan.map.push({ legacy_kind: "section", legacy_id: s.id, target_kind: "block", target_id: bid, source_hash: sourceHash({ ...s, images: undefined }) });
      }
    } else if (!rootExists) {
      for (const e of flatCols) {
        const bid = uuidV5(`legacycol:${tenantId}:${g.id}:${e.legacyKey}`);
        plan.changes.blocks.push(block(bid, tplId(e.key), "Not", { type: "doc", content: paragraphs(textOf(g[e.legacyKey!])) }, appendKey(tplId(e.key))));
        plan.counts.legacyColumns++;
      }
    }

    if (plan.status === "zaten_aktarildi" && (plan.changes.blocks.length || plan.changes.assets.length || plan.changes.topics.length)) plan.status = "eksik_tamamlandi";
    guides.push(plan);
  }
  return { guides, issues };
}

function block(id: string, topicId: string, title: string, doc: JSONContent, sortKey: string) {
  return {
    id,
    topic_id: topicId,
    title: title.slice(0, 200),
    content_json: doc,
    content_text: plainText(doc),
    classification: null,
    sort_key: sortKey,
    deleted_at: null,
    delete_batch_id: null,
    base_version: null,
    sources: [],
  };
}

export function plainText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(plainText);
  return node.type === "doc" ? inner.join("\n") : inner.join("");
}

/** Ana konular V1 kimlik sırasına göre (deterministik) mevcut köklerin SONUNA eklenir. */
function rootSortKey(ws: Workspace, g: V1Guide, all: V1Guide[]): string {
  const roots = childrenOf(ws, null);
  let k = roots.length ? roots[roots.length - 1].sortKey : null;
  const order = [...all].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const x of order) {
    k = keyBetween(k, null);
    if (x.id === g.id) return k;
  }
  return keyBetween(k, null);
}
