/**
 * SENTETİK prototip verisi. Gerçek kullanıcı/kayıt YOK.
 * Sağlık ve dinî içerikler yalnız "ÖRNEK METİN" yer tutucularıdır: uydurma tıbbi kanıt,
 * ayet, hadis veya kaynak İÇERMEZ. Kaynak örneği yalnız BİÇİM gösterir ve öyle etiketlenir.
 * Hazır başlık adları ELLE YAZILMAZ: production şablonundan (template.ts → topicTree.ts) gelir.
 */
import type { JSONContent } from "@tiptap/core";
import { keyBetween } from "@/lib/sifa-rehberi-v2/sortKey";
import { TEMPLATE_ENTRIES } from "@/lib/sifa-rehberi-v2/template";
import type { Block, BlockClass, OwnerProfile, SourceRef, TopicLink, TopicNode, Workspace } from "@/lib/sifa-rehberi-v2/types";

export const PROTO_OWNERS: readonly OwnerProfile[] = [
  { id: "proto-ayse", tenantId: "proto-tenant-ayse", name: "Ayşe Hanım", kind: "basit" },
  { id: "proto-uzman", tenantId: "proto-tenant-uzman", name: "Örnek Uzman", kind: "profesyonel" },
];

const SEED_TIME = "2026-11-19T09:00:00.000Z";
const ORNEK = "[ÖRNEK METİN] ";

const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, ...(marks ? { marks } : {}) });
const p = (...parts: (string | JSONContent)[]): JSONContent => ({
  type: "paragraph",
  content: parts.map((x) => (typeof x === "string" ? t(x) : x)),
});
const h = (level: 2 | 3, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [t(text)] });
const ul = (...items: string[]): JSONContent => ({
  type: "bulletList",
  content: items.map((i) => ({ type: "listItem", content: [p(i)] })),
});
const ol = (...items: string[]): JSONContent => ({
  type: "orderedList",
  attrs: { start: 1 },
  content: items.map((i) => ({ type: "listItem", content: [p(i)] })),
});
const cell = (text: string, header = false): JSONContent => ({
  type: header ? "tableHeader" : "tableCell",
  attrs: { colspan: 1, rowspan: 1, colwidth: null },
  content: [p(text)],
});
const table = (rows: string[][]): JSONContent => ({
  type: "table",
  content: rows.map((r, i) => ({ type: "tableRow", content: r.map((c) => cell(c, i === 0)) })),
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  const inner = (node.content ?? []).map(textOf).join(node.type === "doc" ? "\n" : " ");
  return inner;
}

type BlockSpec = { title: string; cls?: BlockClass; body: JSONContent; sources?: SourceRef[] };
type NodeSpec = { key: string; title: string; tpl?: string; blocks?: BlockSpec[]; children?: NodeSpec[] };
type Extra = { blocks?: BlockSpec[]; children?: NodeSpec[] };

/**
 * Production şablonundan hazır başlık düğümleri üretir; `extras` ile belirli hazır başlıkların
 * altına uzmanın kendi başlık/kutuları eklenir. Hazır başlıklar grubun başında, uzmanınkiler sonda.
 */
function templated(prefix: string, extras: Record<string, Extra>): NodeSpec[] {
  const out: NodeSpec[] = [];
  const groups = new Map<string, NodeSpec>();
  for (const e of TEMPLATE_ENTRIES) {
    const x = extras[e.key] ?? {};
    const spec: NodeSpec = {
      key: `${prefix}-${e.key.replace(":", "-")}`,
      title: e.label,
      tpl: e.key,
      blocks: x.blocks,
      children: [...(x.children ?? [])],
    };
    if (e.parentKey) {
      const g = groups.get(e.parentKey)!;
      const firstUser = g.children!.findIndex((c) => !c.tpl);
      if (firstUser === -1) g.children!.push(spec);
      else g.children!.splice(firstUser, 0, spec);
    } else {
      out.push(spec);
      groups.set(e.key, spec);
    }
  }
  return out;
}

function build(ownerId: string, roots: NodeSpec[], links: [string, string][]): Workspace {
  const nodes: TopicNode[] = [];
  const blocks: Block[] = [];
  const idOf = (key: string) => `${ownerId}-n-${key}`;
  const walk = (specs: NodeSpec[], parentId: string | null) => {
    let prev: string | null = null;
    for (const s of specs) {
      const sortKey = keyBetween(prev, null);
      prev = sortKey;
      const id = idOf(s.key);
      nodes.push({ id, ownerId, parentId, title: s.title, sortKey, templateKey: s.tpl ?? null, createdAt: SEED_TIME, updatedAt: SEED_TIME, deletedAt: null, deleteBatchId: null });
      let bprev: string | null = null;
      (s.blocks ?? []).forEach((b, i) => {
        const bk = keyBetween(bprev, null);
        bprev = bk;
        blocks.push({
          id: `${id}-b${i + 1}`,
          ownerId,
          nodeId: id,
          title: b.title,
          contentJson: b.body,
          contentText: textOf(b.body),
          classification: b.cls ?? null,
          sources: b.sources ?? [],
          sortKey: bk,
          createdAt: SEED_TIME,
          updatedAt: SEED_TIME,
          deletedAt: null,
          deleteBatchId: null,
        });
      });
      walk(s.children ?? [], id);
    }
  };
  walk(roots, null);
  const linkRows: TopicLink[] = links.map(([from, to], i) => ({
    id: `${ownerId}-l${i + 1}`,
    ownerId,
    fromNodeId: idOf(from),
    toNodeId: idOf(to),
    createdAt: SEED_TIME,
  }));
  return { ownerId, nodes, blocks, links: linkRows };
}

const FORMAT_ORNEGI: SourceRef = {
  id: "src-format-ornegi",
  kind: "makale",
  title: "KAYNAK BİÇİMİ ÖRNEĞİ — gerçek bir yayın değildir",
  authors: "Yazar Soyadı, A.",
  year: "Yıl",
  doi: "10.0000/ornek-bicim",
};

function longResearch(): JSONContent {
  const parts: JSONContent[] = [h(2, "Uzun araştırma metni — ekran dayanıklılık testi")];
  for (let i = 1; i <= 36; i++) {
    parts.push(
      p(
        ORNEK,
        t(`Paragraf ${i}. `, [{ type: "bold" }]),
        "Bu paragraf yalnızca uzun içeriklerin ekranı bozup bozmadığını sınamak için eklenmiş sentetik bir metindir. " +
          "Herhangi bir tıbbi bilgi, kanıt ya da öneri taşımaz. Çokuzunbirkelimeninsatırsonundataşmayapıpyapmadığınıkontroletmekiçinbilerekeklenmişbirifade.",
      ),
    );
    if (i === 12) {
      parts.push(
        table([
          ["Sütun A", "Sütun B", "Sütun C", "Sütun D", "Sütun E", "Sütun F"],
          ["Örnek hücre", "Örnek hücre", "Uzun bir örnek hücre metni (sentetik)", "—", "—", "—"],
          ["Örnek hücre", "—", "—", "Örnek hücre", "—", "Örnek"],
        ]),
      );
    }
    if (i === 24) parts.push(ol("Örnek madde bir", "Örnek madde iki", "Örnek madde üç"));
  }
  return doc(...parts);
}

function seedPro(ownerId: string): Workspace {
  const akcigerTemplate = templated("ak", {
    "konu:genel_ozet": {
      blocks: [{ title: "Özet", cls: "uzman_notu", body: doc(p(ORNEK, "Genel / Özet hazır başlığına doğrudan yazılmış not. Alttaki başlıklar uzmanın kendi eklediği araştırma başlıklarıdır.")) }],
      children: [
        { key: "nedir", title: "Akciğer nedir?", blocks: [{ title: "Tanım", body: doc(p(ORNEK, "Tanım notları bu kutuya yazılır.")) }] },
        {
          key: "anatomi",
          title: "Akciğerin anatomisi",
          blocks: [
            {
              title: "Bölümler Tablosu",
              body: doc(
                p(ORNEK, "Tablo özelliğini göstermek için sentetik tablo:"),
                table([
                  ["Bölüm", "Not"],
                  ["Sağ akciğer", "Örnek not"],
                  ["Sol akciğer", "Örnek not"],
                  ["Alveoller", "Örnek not"],
                ]),
              ),
            },
          ],
          children: [
            { key: "sag", title: "Sağ akciğer" },
            { key: "sol", title: "Sol akciğer" },
            { key: "alveol", title: "Alveoller" },
          ],
        },
        { key: "gorevler", title: "Akciğerin görevleri", blocks: [{ title: "Notlar", body: doc(ul(ORNEK + "Madde bir", ORNEK + "Madde iki")) }] },
      ],
    },
    "konu:bilincalti": {
      blocks: [{ title: "Hazır Başlık Notu", body: doc(p(ORNEK, "Bilinçaltı Sebepleri hazır başlığına doğrudan yazılmış not; alt başlıkların içeriğiyle karışmaz.")) }],
      children: [
        {
          key: "duygusal",
          title: "Duygusal Yük Araştırması",
          blocks: [
            { title: "Kaynak Taraması", cls: "bilimsel", body: doc(p(ORNEK, "Okunan kaynakların özetleri. Aşağıdaki kaynak yalnız BİÇİM örneğidir.")), sources: [FORMAT_ORNEGI] },
            { title: "Geleneksel Yorumlar", cls: "geleneksel", body: doc(p(ORNEK, "Geleneksel kaynaklardaki yorum notları.")) },
            { title: "Uzmanın Kendi Notları", cls: "uzman_notu", body: doc(p(ORNEK, "Kişisel gözlem ve değerlendirmeler.")) },
          ],
          children: [
            {
              key: "yas",
              title: "Yas ve Kayıp Teması",
              children: [{ key: "yas-gorusme", title: "Görüşme Notları (anonim)", blocks: [{ title: "Notlar", body: doc(p(ORNEK, "Derin seviyede örnek not.")) }] }],
            },
            { key: "nefes-tutma", title: "Nefes Tutma Alışkanlığı" },
          ],
        },
      ],
    },
    "konu:el_analizi": {
      blocks: [{ title: "Gözlem Notları", cls: "uzman_notu", body: doc(p(ORNEK, "El analizi gözlem notları.")) }],
    },
    "konu:refleksoloji": {
      blocks: [{ title: "Refleksoloji Notları", cls: "geleneksel", body: doc(p(ORNEK, "Refleksoloji notları.")) }],
    },
    "konu:islamic_suggestions": {
      children: [
        { key: "kuran", title: "Kur'an araştırmaları", blocks: [{ title: "Araştırma Notları", cls: "dini", body: doc(p(ORNEK, "Bu kutuya kendi araştırma notlarınızı kaynak künyesiyle yazabilirsiniz. Örnekte ayet metni yoktur.")) }] },
        { key: "hadis", title: "Hadis araştırmaları", blocks: [{ title: "Araştırma Notları", cls: "dini", body: doc(p(ORNEK, "Örnekte hadis metni yoktur; künye alanı kaynak eklemek içindir.")) }] },
        { key: "alimler", title: "Âlimlerin görüşleri", blocks: [{ title: "Araştırma Notları", cls: "dini", body: doc(p(ORNEK, "Örnek yer tutucu.")) }] },
      ],
    },
  });

  const roots: NodeSpec[] = [
    {
      key: "akciger",
      title: "AKCİĞER",
      blocks: [
        {
          title: "Genel Not",
          cls: "uzman_notu",
          body: doc(p(ORNEK, "Bu konu “Şifa Rehberi Şablonuyla Başla” seçeneğiyle oluşturuldu: Şifa Rehberi'nin bütün hazır başlıkları eklendi; uzman bunların altına kendi araştırma başlıklarını açtı.")),
        },
      ],
      children: [
        ...akcigerTemplate,
        {
          key: "rahatsizliklar",
          // Görünen ad 4. aşamada güncellendi; kimlik (key → id) bilerek aynı kaldı.
          // 6. aşama: bölüm adla değil KARARLI sistem anahtarıyla tanınır.
          title: "İlişkili Rahatsızlıklar",
          tpl: "bolum:iliskili_rahatsizliklar",
          children: [
            {
              key: "bronsit",
              title: "Bronşit",
              blocks: [{ title: "Özet", cls: "uzman_notu", body: doc(p(ORNEK, "Bronşit başlığı altındaki araştırmaların kısa özeti bu kutuda tutulabilir.")) }],
              children: [
                { key: "bronsit-nedir", title: "Bronşit nedir?", blocks: [{ title: "Tanım", body: doc(p(ORNEK, "Tanım notları.")) }] },
                {
                  key: "bronsit-belirti",
                  title: "Belirtiler ve nedenler",
                  blocks: [
                    { title: "Belirtiler", body: doc(ul(ORNEK + "Belirti notu", ORNEK + "Belirti notu")) },
                    { title: "Nedenler", body: doc(p(ORNEK, "Neden notları.")) },
                  ],
                },
                {
                  key: "bronsit-bilimsel",
                  title: "Bilimsel araştırmalar",
                  blocks: [
                    {
                      title: "Makale Notları",
                      cls: "bilimsel",
                      body: doc(p(ORNEK, "Bilimsel makale özetleri ve künyeleri bu kutuda tutulur. Aşağıdaki kaynak yalnız BİÇİM örneğidir.")),
                      sources: [FORMAT_ORNEGI],
                    },
                    { title: "Uzun Araştırma Metni (test)", cls: "bilimsel", body: longResearch() },
                  ],
                },
                { key: "bronsit-refleks", title: "Refleksoloji araştırmaları", blocks: [{ title: "Refleksoloji Notları", cls: "geleneksel", body: doc(p(ORNEK, "Refleksoloji notları.")) }] },
                { key: "bronsit-geleneksel", title: "Geleneksel yaklaşımlar", blocks: [{ title: "Geleneksel Kaynaklar", cls: "geleneksel", body: doc(p(ORNEK, "Geleneksel kaynak notları.")) }] },
              ],
            },
            { key: "kanser", title: "Akciğer Kanseri" },
            { key: "pnomotoraks", title: "Pnömotoraks" },
          ],
        },
      ],
    },
    {
      key: "oksuruk",
      title: "Şiddetli Öksürük",
      blocks: [
        {
          title: "Not",
          body: doc(p(ORNEK, "Boş konu olarak açıldı (şablonsuz). Bronşit başlığına İÇERİK KOPYALAMADAN bağlandı; bağlantıya tıklayınca aynı tek kayıt açılır.")),
        },
      ],
    },
    { key: "migren", title: "Migren" },
    { key: "tirnak", title: "El Tırnakları" },
  ];
  return build(ownerId, roots, [
    ["oksuruk", "bronsit"],
    ["ak-konu-el_analizi", "bronsit"],
    ["oksuruk", "gorevler"],
  ]);
}

/** Ayşe Hanım boş başlar — ilk konusunu kendisi açar. */
export function seedWorkspace(ownerId: string): Workspace {
  if (ownerId === "proto-uzman") return seedPro(ownerId);
  return { ownerId, nodes: [], blocks: [], links: [] };
}
