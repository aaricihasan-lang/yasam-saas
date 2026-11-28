/**
 * Şifa Rehberi V2 prototip — SAF mantık harness'ı (DB/ağ YOK).
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/tree.harness.ts
 */
import assert from "node:assert/strict";
import { keyBetween } from "@/lib/sifa-rehberi-v2/sortKey";
import {
  addBlock, addLink, addNode, blocksOf, childrenOf, linksTo, moveNode, nodeById, pathOf, renameNode,
  reorderBlock, reorderNode, restoreBatch, searchWorkspace, softDeleteBlock, softDeleteNode,
  subtreeIds, summarizeChanges, trashEntries, validateWorkspace, type Ctx,
} from "@/lib/sifa-rehberi-v2/tree";
import { PrototypeRepo, memoryStore } from "@/lib/sifa-rehberi-v2/repo";
import { seedWorkspace } from "@/lib/sifa-rehberi-v2/seed";
import { isSafeHref, isSafeImageSrc, normalizeDoi, sanitizeContent } from "@/lib/sifa-rehberi-v2/contentSafety";
import { MAX_DEPTH, type Workspace } from "@/lib/sifa-rehberi-v2/types";
import { applyTemplate, missingTemplateCount, TEMPLATE_ENTRIES, templateEntry } from "@/lib/sifa-rehberi-v2/template";
import { TOPIC_GROUPS } from "@/lib/sifa-rehberi/topicTree";
import { addRelatedSection, isRelatedSection, linkRelated, relatedEntries, relatedSectionOf, upgradeLegacyLabels, RELATED_SECTION_TITLE } from "@/lib/sifa-rehberi-v2/related";
import { buildReading, rootOf, type ReadingSection } from "@/lib/sifa-rehberi-v2/reading";
import { RELATED_SECTION_KEY } from "@/lib/sifa-rehberi-v2/related";
import { applySaveResult, buildChangeset, isEmptyChangeset, parseChangeset } from "@/lib/sifa-rehberi-v2/changeset";
import { planLegacyImport, uuidV5 } from "@/lib/sifa-rehberi-v2/server/legacyImport";
import { directV2Decision, sifaScreen, sifaV2EnabledFromEnv } from "@/lib/sifa-rehberi-v2/versionRoute";

let pass = 0;
let failCount = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failCount++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}
let seq = 0;
const ctx: Ctx = { now: "2026-11-19T10:00:00.000Z", newId: () => `id-${++seq}` };
function must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(`beklenmeyen hata: ${r.error}`);
  return r.value;
}
const empty = (ownerId = "u1"): Workspace => ({ ownerId, nodes: [], blocks: [], links: [] });

console.log("sortKey");
test("keyBetween sıralı ve aralara sınırsız ekleme", () => {
  let a = keyBetween(null, null);
  const b = keyBetween(a, null);
  assert.ok(a < b);
  for (let i = 0; i < 200; i++) {
    const m = keyBetween(a, b);
    assert.ok(a < m && m < b, `${a} < ${m} < ${b}`);
    a = m;
  }
  const first = keyBetween(null, "1");
  assert.ok(first < "1");
});

console.log("Basit kullanıcı akışı (Ayşe)");
test("konu → iki adlandırılmış kutu → arama → aynı kayıt", () => {
  let ws = empty("proto-ayse");
  const { ws: w1, node } = must(addNode(ws, { parentId: null, title: "  Şiddetli   Öksürük " }, ctx));
  assert.equal(node.title, "Şiddetli Öksürük");
  ws = must(addBlock(w1, { nodeId: node.id, title: "Refleksoloji Notları" }, ctx)).ws;
  ws = must(addBlock(ws, { nodeId: node.id, title: "Geleneksel Yaklaşımlar" }, ctx)).ws;
  assert.deepEqual(blocksOf(ws, node.id).map((b) => b.title), ["Refleksoloji Notları", "Geleneksel Yaklaşımlar"]);
  const hits = searchWorkspace(ws, "siddetli oksuruk");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].nodeId, node.id);
  assert.deepEqual(validateWorkspace(ws), []);
});
test("boş başlık reddedilir", () => {
  assert.equal(addNode(empty(), { parentId: null, title: "   " }, ctx).ok, false);
});

console.log("Hiyerarşi");
test("sınırsız seviye (MAX_DEPTH teknik tavanına kadar), tavan aşımı reddedilir", () => {
  let ws = empty();
  let parent: string | null = null;
  for (let i = 0; i < MAX_DEPTH; i++) {
    const r: { ws: Workspace; node: { id: string } } = must(addNode(ws, { parentId: parent, title: `Seviye ${i + 1}` }, ctx));
    ws = r.ws;
    parent = r.node.id;
  }
  assert.equal(pathOf(ws, parent!).length, MAX_DEPTH);
  assert.equal(addNode(ws, { parentId: parent, title: "fazla" }, ctx).ok, false);
});
test("taşıma: kendi altına / torun altına → RED (döngü yok)", () => {
  let ws = empty();
  const a = must(addNode(ws, { parentId: null, title: "A" }, ctx)); ws = a.ws;
  const b = must(addNode(ws, { parentId: a.node.id, title: "B" }, ctx)); ws = b.ws;
  const c = must(addNode(ws, { parentId: b.node.id, title: "C" }, ctx)); ws = c.ws;
  assert.equal(moveNode(ws, a.node.id, a.node.id, ctx).ok, false);
  assert.equal(moveNode(ws, a.node.id, c.node.id, ctx).ok, false);
  const moved = must(moveNode(ws, c.node.id, null, ctx));
  assert.equal(nodeById(moved, c.node.id)!.parentId, null);
  assert.deepEqual(validateWorkspace(moved), []);
});
test("taşıma alt ağacı birlikte götürür ve derinlik tavanını korur", () => {
  let ws = empty();
  const a = must(addNode(ws, { parentId: null, title: "A" }, ctx)); ws = a.ws;
  const x = must(addNode(ws, { parentId: null, title: "X" }, ctx)); ws = x.ws;
  const xc = must(addNode(ws, { parentId: x.node.id, title: "X1" }, ctx)); ws = xc.ws;
  ws = must(moveNode(ws, x.node.id, a.node.id, ctx));
  assert.deepEqual(pathOf(ws, xc.node.id).map((n) => n.title), ["A", "X", "X1"]);
});
test("yeniden adlandırma + sıralama yalnız ilgili düğümün anahtarını değiştirir", () => {
  let ws = empty();
  const ids: string[] = [];
  for (const tt of ["Bir", "İki", "Üç"]) {
    const r = must(addNode(ws, { parentId: null, title: tt }, ctx));
    ws = r.ws;
    ids.push(r.node.id);
  }
  const before = new Map(ws.nodes.map((n) => [n.id, n.sortKey]));
  ws = must(reorderNode(ws, ids[2], "up", ctx));
  assert.deepEqual(childrenOf(ws, null).map((n) => n.title), ["Bir", "Üç", "İki"]);
  for (const n of ws.nodes) if (n.id !== ids[2]) assert.equal(n.sortKey, before.get(n.id));
  ws = must(reorderNode(ws, ids[2], "up", ctx));
  assert.deepEqual(childrenOf(ws, null).map((n) => n.title), ["Üç", "Bir", "İki"]);
  ws = must(renameNode(ws, ids[0], "Birinci", ctx));
  assert.equal(nodeById(ws, ids[0])!.title, "Birinci");
});

console.log("Kutular");
test("kutular konuya özel, sıralanabilir, karışmaz", () => {
  let ws = empty();
  const a = must(addNode(ws, { parentId: null, title: "A" }, ctx)); ws = a.ws;
  const b = must(addNode(ws, { parentId: null, title: "B" }, ctx)); ws = b.ws;
  const k1 = must(addBlock(ws, { nodeId: a.node.id, title: "K1" }, ctx)); ws = k1.ws;
  const k2 = must(addBlock(ws, { nodeId: a.node.id, title: "K2" }, ctx)); ws = k2.ws;
  ws = must(addBlock(ws, { nodeId: b.node.id, title: "Başka" }, ctx)).ws;
  ws = must(reorderBlock(ws, k2.block.id, "up", ctx));
  assert.deepEqual(blocksOf(ws, a.node.id).map((x) => x.title), ["K2", "K1"]);
  assert.deepEqual(blocksOf(ws, b.node.id).map((x) => x.title), ["Başka"]);
});

console.log("Güvenli silme / kurtarma");
test("konu silme alt ağaç + kutuları çöpe atar; geri yükleme her şeyi getirir", () => {
  let ws = seedWorkspace("proto-uzman");
  const bronsit = "proto-uzman-n-bronsit";
  const totalBlocks = ws.blocks.filter((b) => !b.deletedAt).length;
  const del = must(softDeleteNode(ws, bronsit, ctx));
  assert.equal(del.count.nodes, 6);
  assert.ok(del.count.blocks >= 6);
  ws = del.ws;
  assert.equal(nodeById(ws, bronsit), null);
  // "Şiddetli Öksürük" notunun METNİ "Bronşit" kelimesini içerir → o konu bulunabilir;
  // ama silinen alt ağaçtan hiçbir konu sonuçlarda olmamalı.
  const deletedIds = new Set(ws.nodes.filter((n) => n.deleteBatchId === del.batchId).map((n) => n.id));
  assert.equal(searchWorkspace(ws, "Bronşit").filter((x) => deletedIds.has(x.nodeId)).length, 0);
  assert.equal(linksTo(ws, bronsit).length, 0, "çöpteki konuya bağlantı görünmez");
  const tr = trashEntries(ws);
  assert.equal(tr.length, 1);
  assert.equal(tr[0].title, "Bronşit");
  assert.equal(tr[0].originPath, "AKCİĞER › İlişkili Rahatsızlıklar"); // 4. aşama: yalnız görünen ad
  ws = must(restoreBatch(ws, del.batchId, ctx)).ws;
  assert.ok(nodeById(ws, bronsit));
  assert.equal(ws.blocks.filter((b) => !b.deletedAt).length, totalBlocks);
  assert.equal(linksTo(ws, bronsit).length, 2, "bağlantılar geri geldi");
  assert.deepEqual(validateWorkspace(ws), []);
});
test("üst başlığı da silinmişse geri yükleme en üst seviyeye yapar (veri kaybı yok)", () => {
  let ws = seedWorkspace("proto-uzman");
  // 6. aşama: İlişkili Rahatsızlıklar artık kilitli sistem bölümü → senaryo Bronşit › Bronşit nedir? ile.
  const d1 = must(softDeleteNode(ws, "proto-uzman-n-bronsit-nedir", ctx)); ws = d1.ws;
  const d2 = must(softDeleteNode(ws, "proto-uzman-n-bronsit", ctx)); ws = d2.ws;
  const r = must(restoreBatch(ws, d1.batchId, ctx));
  assert.equal(r.movedToRoot, true);
  assert.equal(nodeById(r.ws, "proto-uzman-n-bronsit-nedir")!.parentId, null);
  assert.deepEqual(validateWorkspace(r.ws), []);
});
test("tek kutu silme/geri yükleme", () => {
  let ws = seedWorkspace("proto-uzman");
  const bid = "proto-uzman-n-akciger-b1";
  const d = must(softDeleteBlock(ws, bid, ctx)); ws = d.ws;
  assert.equal(blocksOf(ws, "proto-uzman-n-akciger").length, 0);
  assert.equal(trashEntries(ws)[0].kind, "kutu");
  ws = must(restoreBatch(ws, d.batchId, ctx)).ws;
  assert.equal(blocksOf(ws, "proto-uzman-n-akciger").length, 1);
});

console.log("Bağlantılar (kopyasız)");
test("iki farklı yerden aynı tek kayıt", () => {
  const ws = seedWorkspace("proto-uzman");
  const from = linksTo(ws, "proto-uzman-n-bronsit").map((x) => x.node.title).sort();
  assert.deepEqual(from, ["El Analizinde Karşılığı", "Şiddetli Öksürük"]);
  assert.equal(ws.nodes.filter((n) => n.title === "Bronşit").length, 1, "kopya yok");
  assert.equal(addLink(ws, "proto-uzman-n-bronsit", "proto-uzman-n-bronsit", ctx).ok, false);
  const again = must(addLink(ws, "proto-uzman-n-oksuruk", "proto-uzman-n-bronsit", ctx));
  assert.equal(again.links.length, ws.links.length, "mükerrer bağlantı yok");
});

console.log("Arama");
test("Türkçe katlama + içerik + yol", () => {
  const ws = seedWorkspace("proto-uzman");
  const h1 = searchWorkspace(ws, "BRONSIT");
  assert.ok(h1.some((x) => x.nodeId === "proto-uzman-n-bronsit" && x.where === "başlık"));
  const h2 = searchWorkspace(ws, "alveoller");
  assert.ok(h2.some((x) => x.path.join(" › ") === "AKCİĞER › Belirtiler / Sebepler › Genel / Özet › Akciğerin anatomisi › Alveoller"));
  const h3 = searchWorkspace(ws, "çokuzunbirkelime");
  assert.ok(h3.some((x) => x.where === "içerik" && x.blockTitle === "Uzun Araştırma Metni (test)"));
});

console.log("İzolasyon (uzman bazında)");
test("depo yalnız oturum sahibinin alanını döndürür; yabancı yazım RED", () => {
  const repo = new PrototypeRepo(memoryStore(), seedWorkspace);
  const ayse = repo.load("proto-ayse");
  const uzman = repo.load("proto-uzman");
  assert.equal(ayse.nodes.length, 0);
  assert.equal(searchWorkspace(ayse, "akciğer").length, 0, "Ayşe uzmanın kaydını göremez");
  assert.equal(repo.save("proto-ayse", uzman).ok, false);
  const forged: Workspace = { ...ayse, nodes: [{ ...uzman.nodes[0] }] };
  assert.equal(repo.save("proto-ayse", forged).ok, false, "başka sahibin düğümü içeren yazım reddedilir");
});
test("bütünlük: döngülü veri kaydedilemez", () => {
  const repo = new PrototypeRepo(memoryStore(), seedWorkspace);
  const ws = repo.load("proto-uzman");
  const broken: Workspace = {
    ...ws,
    nodes: ws.nodes.map((n) =>
      n.id === "proto-uzman-n-akciger" ? { ...n, parentId: "proto-uzman-n-sag" } : n,
    ),
  };
  const r = repo.save("proto-uzman", broken);
  assert.equal(r.ok, false);
});
test("değişiklik özeti (Kaydet butonu sayacı)", () => {
  const saved = seedWorkspace("proto-uzman");
  const draft = must(renameNode(saved, "proto-uzman-n-migren", "Migren (güncel)", ctx));
  assert.equal(summarizeChanges(saved, draft).total, 1);
  assert.equal(summarizeChanges(saved, saved).total, 0);
});

console.log("İçerik güvenliği");
test("tehlikeli bağlantı/görsel/bilinmeyen düğüm süzülür", () => {
  assert.equal(isSafeHref("javascript:alert(1)"), false);
  assert.equal(isSafeHref("https://doi.org/10.1000/x"), true);
  assert.equal(isSafeImageSrc("data:image/svg+xml;base64,AAAA"), false);
  const out = sanitizeContent({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "link", attrs: { href: "javascript:x" } }, { type: "bold" }] }] },
      { type: "script", content: [{ type: "text", text: "kalır" }] },
      { type: "figure", attrs: { src: "http://evil/x.png", caption: "c" } },
    ],
  });
  const json = JSON.stringify(out);
  assert.ok(!json.includes("javascript"));
  assert.ok(json.includes('"bold"'));
  assert.ok(json.includes("kalır"));
  assert.ok(!json.includes("evil"));
});
test("DOI normalizasyonu", () => {
  assert.equal(normalizeDoi("https://doi.org/10.1234/abc.5"), "10.1234/abc.5");
  assert.equal(normalizeDoi("doi: 10.12345/X-1"), "10.12345/X-1");
  assert.equal(normalizeDoi("11.1/abc"), null);
});

console.log("Sentetik tohum");
test("profesyonel ağaç geçerli ve 5 seviye derin (şablon + uzman başlıkları)", () => {
  const ws = seedWorkspace("proto-uzman");
  assert.deepEqual(validateWorkspace(ws), []);
  assert.equal(pathOf(ws, "proto-uzman-n-sag").length, 5);
  assert.ok(ws.blocks.every((b) => b.contentText.includes("[ÖRNEK METİN]") || b.title.includes("Tablo")), "tüm metinler örnek etiketli");
});

console.log("Şifa Rehberi şablonu (production başlıkları)");
test("şablon production TOPIC_GROUPS ile BİREBİR (ad, sıra, grup; tahmin yok)", () => {
  const expected: string[] = [];
  for (const g of TOPIC_GROUPS) {
    if (g.kind === "rahatsizlik") continue;
    if (g.topics.length === 1) expected.push(`${g.topics[0].label}|-`);
    else {
      expected.push(`${g.label}|-`);
      for (const t of g.topics) expected.push(`${t.label}|${g.label}`);
    }
  }
  const actual = TEMPLATE_ENTRIES.map((e) => `${e.label}|${e.parentKey ? templateEntry(e.parentKey)!.label : "-"}`);
  assert.deepEqual(actual, expected);
  const allProductionTopics = TOPIC_GROUPS.flatMap((g) => g.topics.map((t) => t.label));
  const templateLabels = new Set(TEMPLATE_ENTRIES.map((e) => e.label));
  const missing = allProductionTopics.filter((l) => !templateLabels.has(l));
  assert.deepEqual(missing, [], `eksik: ${missing}`);
  for (const must of ["Genel / Özet", "Tıbbi Nedenler", "Bilinçaltı Sebepleri", "Mizaç Sebepleri", "El Analizinde Karşılığı", "İslami Öneriler", "Hacamat & Sülük", "Refleksoloji"]) {
    assert.ok(templateLabels.has(must), must);
  }
  // her alt başlık production section_type/mode karşılığını taşır
  for (const g of TOPIC_GROUPS) for (const t of g.topics) {
    const e = TEMPLATE_ENTRIES.find((x) => x.key === `konu:${t.id}`)!;
    assert.equal(`${e.sectionType}/${e.mode}`, `${t.section_type}/${t.mode}`);
  }
  return;
});
test("boş konuya şablon: tüm hazır başlıklar gelir; ikinci kez eklemek kopya üretmez", () => {
  let ws = empty();
  const r = must(addNode(ws, { parentId: null, title: "AKCİĞER" }, ctx)); ws = r.ws;
  ws = must(addBlock(ws, { nodeId: r.node.id, title: "Önceki not" }, ctx)).ws;
  const user = must(addNode(ws, { parentId: r.node.id, title: "Kendi başlığım" }, ctx)); ws = user.ws;
  const a1 = must(applyTemplate(ws, r.node.id, ctx));
  assert.equal(a1.added, TEMPLATE_ENTRIES.length);
  ws = a1.ws;
  assert.equal(missingTemplateCount(ws, r.node.id), 0);
  const a2 = must(applyTemplate(ws, r.node.id, ctx));
  assert.equal(a2.added, 0);
  assert.equal(a2.ws.nodes.length, ws.nodes.length);
  assert.ok(nodeById(ws, user.node.id), "kullanıcı başlığı korunur");
  assert.equal(blocksOf(ws, r.node.id).length, 1, "mevcut not korunur");
  assert.deepEqual(validateWorkspace(ws), []);
});
test("hazır başlık: adı/yeri/silinmesi kilitli; altına başlık + kutu eklenir; içerikler karışmaz", () => {
  let ws = must(applyTemplate(must(addNode(empty(), { parentId: null, title: "K" }, ctx)).ws, "id-" + seq, ctx)).ws;
  const genel = ws.nodes.find((n) => n.templateKey === "konu:genel_ozet")!;
  assert.equal(renameNode(ws, genel.id, "Başka ad", ctx).ok, false);
  assert.equal(moveNode(ws, genel.id, null, ctx).ok, false);
  assert.equal(softDeleteNode(ws, genel.id, ctx).ok, false);
  ws = must(addBlock(ws, { nodeId: genel.id, title: "Doğrudan not" }, ctx)).ws;
  const c1 = must(addNode(ws, { parentId: genel.id, title: "Akciğer nedir?" }, ctx)); ws = c1.ws;
  const c2 = must(addNode(ws, { parentId: c1.node.id, title: "Alt alt" }, ctx)); ws = c2.ws;
  ws = must(addBlock(ws, { nodeId: c1.node.id, title: "Kutu A" }, ctx)).ws;
  ws = must(addBlock(ws, { nodeId: c1.node.id, title: "Kutu B" }, ctx)).ws;
  assert.deepEqual(blocksOf(ws, genel.id).map((b) => b.title), ["Doğrudan not"]);
  assert.deepEqual(blocksOf(ws, c1.node.id).map((b) => b.title), ["Kutu A", "Kutu B"]);
  // kullanıcı başlığı hazır başlığın altına taşınabilir
  const free = must(addNode(ws, { parentId: null, title: "Serbest" }, ctx)); ws = free.ws;
  const bil = ws.nodes.find((n) => n.templateKey === "konu:bilincalti")!;
  ws = must(moveNode(ws, free.node.id, bil.id, ctx));
  assert.equal(nodeById(ws, free.node.id)!.parentId, bil.id);
  // hazır başlığa şablon uygulanamaz
  assert.equal(applyTemplate(ws, genel.id, ctx).ok, false);
});
test("şablonlu konuyu silme/geri yükleme: hazır başlıklar eksiksiz döner", () => {
  let ws = seedWorkspace("proto-uzman");
  assert.equal(missingTemplateCount(ws, "proto-uzman-n-akciger"), 0);
  const d = must(softDeleteNode(ws, "proto-uzman-n-akciger", ctx)); ws = d.ws;
  ws = must(restoreBatch(ws, d.batchId, ctx)).ws;
  assert.equal(missingTemplateCount(ws, "proto-uzman-n-akciger"), 0);
  assert.deepEqual(validateWorkspace(ws), []);
});
test("bütünlük: aynı hazır başlık aynı yerde iki kez → kayıt reddi", () => {
  const ws = seedWorkspace("proto-uzman");
  const g = ws.nodes.find((n) => n.templateKey === "konu:genel_ozet")!;
  const dup: Workspace = { ...ws, nodes: [...ws.nodes, { ...g, id: "kopya" }] };
  assert.ok(validateWorkspace(dup).some((e) => e.includes("iki kez")));
});
test("tohum: Genel / Özet, Bilinçaltı ve İslami Öneriler altında çok seviyeli uzman başlıkları", () => {
  const ws = seedWorkspace("proto-uzman");
  const t = (k: string) => ws.nodes.find((n) => n.templateKey === k)!;
  assert.deepEqual(childrenOf(ws, t("konu:genel_ozet").id).map((n) => n.title), ["Akciğer nedir?", "Akciğerin anatomisi", "Akciğerin görevleri"]);
  assert.deepEqual(childrenOf(ws, t("konu:islamic_suggestions").id).map((n) => n.title), ["Kur'an araştırmaları", "Hadis araştırmaları", "Âlimlerin görüşleri"]);
  const duygusal = childrenOf(ws, t("konu:bilincalti").id)[0];
  assert.equal(duygusal.title, "Duygusal Yük Araştırması");
  assert.equal(blocksOf(ws, duygusal.id).length, 3);
  assert.equal(pathOf(ws, "proto-uzman-n-yas-gorusme").length, 6);
});

// ── 4. AŞAMA: İlişkili Rahatsızlıklar + Bütüncül Okuma ───────────────────────
const AK = "proto-uzman-n-akciger";
const REL = "proto-uzman-n-rahatsizliklar";
const BRONSIT = "proto-uzman-n-bronsit";
const live = (ws: Workspace) => ({ nodes: ws.nodes.filter((n) => !n.deletedAt).length, blocks: ws.blocks.filter((b) => !b.deletedAt).length });

test("İlişkili Rahatsızlıklar: AKCİĞER altında, kimlik aynı, Bronşit/Kanser/Pnömotoraks yerinde", () => {
  const ws = seedWorkspace("proto-uzman");
  const sec = relatedSectionOf(ws, AK)!;
  assert.equal(sec.id, REL, "kimlik değişmedi");
  assert.equal(sec.title, RELATED_SECTION_TITLE);
  assert.ok(isRelatedSection(sec));
  assert.deepEqual(childrenOf(ws, REL).map((n) => n.title), ["Bronşit", "Akciğer Kanseri", "Pnömotoraks"]);
  assert.equal(nodeById(ws, BRONSIT)!.parentId, REL);
  assert.equal(linksTo(ws, BRONSIT).length, 2, "önceki bağlantılar korunuyor");
  assert.equal(relatedSectionOf(ws, "proto-uzman-n-oksuruk"), null, "başka konu kendi bölümünü taşımıyor");
});
test("eski tarayıcı kaydı: yalnız tohum düğümünün görünen adı yükselir; kimlik/bağlantı/kullanıcı başlığı aynı", () => {
  const seed = seedWorkspace("proto-uzman");
  const old: Workspace = {
    ...seed,
    nodes: [
      ...seed.nodes.map((n) => (n.id === REL ? { ...n, title: "Rahatsızlıklar" } : n)),
      { ...nodeById(seed, "proto-uzman-n-migren")!, id: "kullanici-baslik", parentId: "proto-uzman-n-migren", title: "Rahatsızlıklar", sortKey: "a0" },
    ],
  };
  const store = memoryStore();
  store.setItem("sifa-v2-prototip:v2:proto-uzman", JSON.stringify(old));
  const ws = new PrototypeRepo(store, seedWorkspace).load("proto-uzman");
  assert.equal(nodeById(ws, REL)!.title, RELATED_SECTION_TITLE);
  assert.equal(nodeById(ws, REL)!.updatedAt, nodeById(old, REL)!.updatedAt, "zaman damgası değişmedi");
  assert.equal(nodeById(ws, "kullanici-baslik")!.title, "Rahatsızlıklar", "kullanıcının kendi başlığına dokunulmadı");
  assert.deepEqual(ws.links, old.links);
  assert.equal(ws.nodes.length, old.nodes.length);
  assert.equal(upgradeLegacyLabels(ws), ws, "ikinci kez çalışınca değişiklik yok");
});
test("başka konudan aynı özgün kayda bağlanma: kopya yok, taşıma yok, ikinci bağlantı yok", () => {
  let ws = seedWorkspace("proto-uzman");
  const before = live(ws);
  const r = must(addRelatedSection(ws, "proto-uzman-n-migren", ctx));
  ws = r.ws;
  assert.equal(must(addRelatedSection(ws, "proto-uzman-n-migren", ctx)).sectionId, r.sectionId, "bölüm idempotent");
  ws = must(linkRelated(ws, r.sectionId, BRONSIT, ctx));
  const linkCount = ws.links.length;
  ws = must(linkRelated(ws, r.sectionId, BRONSIT, ctx));
  assert.equal(ws.links.length, linkCount, "aynı bağlantı iki kez eklenmedi");
  assert.equal(nodeById(ws, BRONSIT)!.parentId, REL, "Bronşit AKCİĞER'de kaldı");
  assert.deepEqual(live(ws), { nodes: before.nodes + 1, blocks: before.blocks }, "yalnız bölüm eklendi; kayıt/kutu kopyalanmadı");
  assert.equal(ws.nodes.filter((n) => n.title === "Bronşit" && !n.deletedAt).length, 1);
  const entries = relatedEntries(ws, r.sectionId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "bagli");
  assert.equal(entries[0].node.id, BRONSIT);
  assert.ok(!linkRelated(ws, REL, BRONSIT, ctx).ok, "aslı zaten bölümde olan kayıt bağlanamaz");
  assert.ok(!linkRelated(ws, REL, AK, ctx).ok, "bölüm kendi konusuna bağlanamaz");
  assert.ok(!addRelatedSection(ws, BRONSIT, ctx).ok, "alt başlığa bölüm eklenmez");
  assert.deepEqual(validateWorkspace(ws), []);
});
test("Bütüncül Okuma: hiyerarşi + numara + kullanıcı sırası; boş başlık gizli", () => {
  const ws = seedWorkspace("proto-uzman");
  const r = buildReading(ws, AK)!;
  const toc = r.toc.map((t) => `${t.number} ${t.title}`);
  assert.equal(toc[0], "1 Belirtiler / Sebepler");
  assert.equal(toc[1], "1.1 Genel / Özet");
  assert.deepEqual(toc.slice(2, 5), ["1.1.1 Akciğer nedir?", "1.1.2 Akciğerin anatomisi", "1.1.3 Akciğerin görevleri"]);
  assert.ok(toc.includes("1.2.1.1.1 Görüşme Notları (anonim)"), "derin seviye");
  assert.ok(!r.toc.some((t) => t.title === "Sağ akciğer"), "boş başlık gizli");
  assert.ok(!r.toc.some((t) => t.title === "Tıbbi Nedenler"), "boş hazır başlık gizli");
  assert.ok(r.stats.hiddenEmpty > 0);
  assert.ok(buildReading(ws, AK, { includeEmpty: true })!.toc.some((t) => t.title === "Sağ akciğer"), "istenirse gösterilir");
  // Görünen sıra = ağaç sırası (sortKey)
  const visibleOrder = r.sections.map((s) => s.node.id);
  assert.deepEqual(visibleOrder, childrenOf(ws, AK).filter((n) => visibleOrder.includes(n.id)).map((n) => n.id));
  const relSec = r.sections.find((s) => s.node.id === REL)!;
  assert.deepEqual(relSec.related!.map((e) => e.node.title), ["Bronşit", "Akciğer Kanseri", "Pnömotoraks"], "ilişkili listesi boş olanları da sayar");
});
test("Bütüncül Okuma: sıralama değişince numara değişir; çoklu kutu ve içerik tam", () => {
  let ws = seedWorkspace("proto-uzman");
  ws = must(reorderNode(ws, "proto-uzman-n-gorevler", "up", ctx));
  const toc = buildReading(ws, AK)!.toc.map((t) => `${t.number} ${t.title}`);
  assert.deepEqual(toc.slice(2, 5), ["1.1.1 Akciğer nedir?", "1.1.2 Akciğerin görevleri", "1.1.3 Akciğerin anatomisi"]);
  const flat = (secs: ReadingSection[]): ReadingSection[] => secs.flatMap((s) => [s, ...flat(s.children)]);
  const all = flat(buildReading(ws, AK)!.sections);
  const duygusal = all.find((s) => s.node.id === "proto-uzman-n-duygusal")!;
  assert.deepEqual(duygusal.blocks.map((b) => b.title), ["Kaynak Taraması", "Geleneksel Yorumlar", "Uzmanın Kendi Notları"]);
  const longB = all.flatMap((s) => s.blocks).find((b) => b.title === "Uzun Araştırma Metni (test)")!;
  assert.equal(longB, ws.blocks.find((b) => b.id === longB.id), "içerik kısaltılmadan aynı kayıt");
});
test("Bütüncül Okuma: yalnız seçili konu; bağlı kaydın içeriği gösterilmez; veri değişmez", () => {
  const ws = seedWorkspace("proto-uzman");
  const snapshot = JSON.stringify(ws);
  const ok = buildReading(ws, "proto-uzman-n-oksuruk")!;
  const okIds = subtreeIds(ws, "proto-uzman-n-oksuruk");
  assert.ok(ok.rootBlocks.every((b) => okIds.has(b.nodeId)));
  assert.equal(ok.sections.length, 0);
  assert.deepEqual(ok.rootLinks.map((l) => l.node.title).sort(), ["Akciğerin görevleri", "Bronşit"].sort(), "bağlantılar yalnız ad olarak");
  const ak = buildReading(ws, AK)!;
  const akIds = subtreeIds(ws, AK);
  const flat = (secs: typeof ak.sections): typeof ak.sections => secs.flatMap((s) => [s, ...flat(s.children)]);
  assert.ok([...ak.rootBlocks, ...flat(ak.sections).flatMap((s) => s.blocks)].every((b) => akIds.has(b.nodeId)), "başka konunun kutusu yok");
  assert.equal(JSON.stringify(ws), snapshot, "okuma veriyi değiştirmedi");
  const empty = buildReading(ws, "proto-uzman-n-migren")!;
  assert.equal(empty.sections.length + empty.rootBlocks.length + empty.rootLinks.length, 0, "boş konu → boş durum");
  assert.equal(buildReading(seedWorkspace("proto-ayse"), AK), null, "başka uzmanın konusu okunamaz");
});

// ── 5. AŞAMA: Ana Konularım ⇄ Konu Ayrıntısı (üst-alt ilişkisi + kimlik) ────────
const ROOTS = ["proto-uzman-n-akciger", "proto-uzman-n-oksuruk", "proto-uzman-n-migren", "proto-uzman-n-tirnak"];
test("ana konular = üst kaydı olmayanlar; AKCİĞER alt ağacında diğer ana konular yok", () => {
  const ws = seedWorkspace("proto-uzman");
  assert.deepEqual(childrenOf(ws, null).map((n) => n.id), ROOTS);
  const ak = subtreeIds(ws, AK);
  for (const other of ROOTS.slice(1)) assert.ok(!ak.has(other), `${other} AKCİĞER ağacında olmamalı`);
  for (const id of [BRONSIT, "proto-uzman-n-kanser", "proto-uzman-n-pnomotoraks"]) {
    assert.equal(rootOf(ws, id)!.id, AK);
    assert.equal(nodeById(ws, id)!.parentId, REL, "yerinde");
  }
});
test("FITIK: yeni bağımsız ana konu AKCİĞER ağacına eklenmez; kendi ağacı yalnız kendisi", () => {
  let ws = seedWorkspace("proto-uzman");
  const r = must(addNode(ws, { parentId: null, title: "FITIK" }, ctx));
  ws = r.ws;
  const fitik = r.node.id;
  assert.equal(nodeById(ws, fitik)!.parentId, null);
  assert.ok(childrenOf(ws, null).some((n) => n.id === fitik));
  assert.ok(!subtreeIds(ws, AK).has(fitik));
  ws = must(addNode(ws, { parentId: fitik, title: "Bel Fıtığı" }, ctx)).ws;
  assert.deepEqual([...subtreeIds(ws, fitik)].map((id) => nodeById(ws, id)!.title).sort(), ["Bel Fıtığı", "FITIK"]);
});
test("ayrım metne bakmaz: AKCİĞER altındaki 'Migren' alt başlığı bağımsız Migren ile karışmaz", () => {
  let ws = seedWorkspace("proto-uzman");
  const r = must(addNode(ws, { parentId: REL, title: "Migren" }, ctx));
  ws = r.ws;
  assert.equal(childrenOf(ws, null).filter((n) => n.title === "Migren").length, 1, "tek bağımsız Migren");
  assert.equal(childrenOf(ws, null).find((n) => n.title === "Migren")!.id, "proto-uzman-n-migren", "kimliği aynı");
  assert.equal(rootOf(ws, r.node.id)!.id, AK, "aynı adlı alt başlığın kökü AKCİĞER");
});
// F3 (26.11.2026): eski V2 arayüzünün adres modülü (components/sifa-rehberi-v2/navigation) kaldırıldı → adres testleri de kaldırıldı.

// ── 6. AŞAMA: kararlı sistem anahtarı · değişiklik kümesi · aktarım planı ──────
test("İlişkili Rahatsızlıklar ADLA değil KARARLI anahtarla tanınır; aynı adlı kullanıcı başlığı sistem bölümü değildir", () => {
  let ws = seedWorkspace("proto-uzman");
  assert.equal(nodeById(ws, REL)!.templateKey, RELATED_SECTION_KEY);
  const u = must(addNode(ws, { parentId: "proto-uzman-n-migren", title: "İlişkili Rahatsızlıklar" }, ctx));
  ws = u.ws;
  assert.equal(relatedSectionOf(ws, "proto-uzman-n-migren"), null, "kullanıcı başlığı sistem bölümü sayılmaz");
  assert.ok(must(renameNode(ws, u.node.id, "Benim listem", ctx)), "kullanıcı başlığı serbestçe adlandırılır");
  assert.ok(!renameNode(ws, REL, "Başka ad", ctx).ok, "sistem bölümü adı kilitli");
  assert.ok(!softDeleteNode(ws, REL, ctx).ok, "sistem bölümü tek başına silinemez");
  const bad: Workspace = { ...ws, nodes: ws.nodes.map((n) => (n.id === "proto-uzman-n-bronsit" ? { ...n, templateKey: RELATED_SECTION_KEY } : n)) };
  assert.ok(validateWorkspace(bad).some((e) => e.includes("Sistem bölümü")), "alt başlıkta sistem bölümü geçersiz");
});
test("Eski tarayıcı kaydı: tohum bölümüne anahtar eklenir; kullanıcının aynı adlı başlığına dokunulmaz", () => {
  const seed = seedWorkspace("proto-uzman");
  const old: Workspace = { ...seed, nodes: seed.nodes.map((n) => (n.id === REL ? { ...n, title: "Rahatsızlıklar", templateKey: null } : n)) };
  const store = memoryStore();
  store.setItem("sifa-v2-prototip:v2:proto-uzman", JSON.stringify(old));
  const ws = new PrototypeRepo(store, seedWorkspace).load("proto-uzman");
  assert.equal(nodeById(ws, REL)!.templateKey, RELATED_SECTION_KEY);
  assert.deepEqual(validateWorkspace(ws), []);
});
test("Değişiklik kümesi: yalnız değişen satırlar + sürüm; yeni → base_version null; bağlantı ekle/kaldır", () => {
  const saved: Workspace = { ...seedWorkspace("proto-uzman") };
  const withV: Workspace = { ...saved, nodes: saved.nodes.map((n) => ({ ...n, version: 3 })), blocks: saved.blocks.map((b) => ({ ...b, version: 2 })) };
  assert.ok(isEmptyChangeset(buildChangeset(withV, withV)));
  let d = must(renameNode(withV, "proto-uzman-n-kanser", "Akciğer Kanseri (güncel)", ctx));
  const nb = must(addBlock(d, { nodeId: "proto-uzman-n-kanser", title: "Yeni Kutu" }, ctx));
  d = nb.ws;
  d = { ...d, links: d.links.slice(1) };
  const cs = buildChangeset(withV, d);
  assert.deepEqual(cs.topics.map((t) => [t.id, t.base_version]), [["proto-uzman-n-kanser", 3]]);
  assert.deepEqual(cs.blocks.map((b) => [b.title, b.base_version]), [["Yeni Kutu", null]]);
  assert.deepEqual(cs.links_remove, [withV.links[0].id]);
  const after = applySaveResult(d, { topics: { "proto-uzman-n-kanser": 4 }, blocks: { [nb.block.id]: 1 } });
  assert.equal(nodeById(after, "proto-uzman-n-kanser")!.version, 4);
});
test("Sunucu doğrulaması: sahiplik alanları ATILIR, güvensiz bağlantı süzülür, bozuk istek reddedilir", () => {
  const id = "0b9d3d8e-2c55-4a5e-9a3c-1f0e7c1d2a3b";
  const parsed = parseChangeset({
    topics: [{ id, parent_id: null, title: "Konu", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, owner_user_id: "kotu", tenant_id: "kotu" }],
    blocks: [{ id: "1b9d3d8e-2c55-4a5e-9a3c-1f0e7c1d2a3b", topic_id: id, title: "K", content_json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] }, content_text: "x", classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] }],
  });
  assert.ok(!("owner_user_id" in parsed.topics[0]) && !("tenant_id" in parsed.topics[0]));
  assert.ok(!JSON.stringify(parsed.blocks[0].content_json).includes("javascript"));
  for (const bad of [{ topics: [{ id: "x" }] }, { owner: 1 }, { links_add: [{ id, from_topic_id: id, to_topic_id: id }] }, { topics: [{ id, parent_id: null, title: "a", sort_key: "A!", base_version: null }] }]) {
    assert.throws(() => parseChangeset(bad));
  }
});
test("Aktarım planı (7. aşama, KURUM kapsamı): deterministik; belirsiz not ATILMAZ (işaretli bölüm); uzun ad korunur", () => {
  const T = "11111111-1111-4111-8111-111111111111";
  const T2 = "22222222-2222-4222-8222-222222222222";
  const guides = [
    { id: "g1", tenant_id: T, name: "Bronşit" },
    { id: "g2", tenant_id: T, name: "x".repeat(201) },
    { id: "g9", tenant_id: T2, name: "Başka tenant" },
  ];
  const sections = [
    { id: "s1", guide_id: "g1", section_type: "reasons", mode: "genel_ozet", title: null, note: "Not bir", source: null, source_kind: null, expert_note: null, attention: null, images: [], sort_order: 0 },
    { id: "s2", guide_id: "g1", section_type: "applications", mode: "hacamat", title: null, note: "Belirsiz", source: null, source_kind: null, expert_note: null, attention: null, images: [], sort_order: 1 },
  ];
  const snapshot = JSON.stringify({ guides, sections });
  const empty: Workspace = { ownerId: T, nodes: [], blocks: [], links: [] };
  const p1 = planLegacyImport({ tenantId: T, guides, sections }, empty, []);
  const p2 = planLegacyImport({ tenantId: T, guides, sections }, empty, []);
  assert.equal(JSON.stringify(p1), JSON.stringify(p2), "deterministik");
  assert.equal(JSON.stringify({ guides, sections }), snapshot, "girdi değişmedi");
  assert.equal(p1.guides.length, 2, "yalnız hedef tenant'ın kayıtları");
  const g1 = p1.guides.find((g) => g.guideId === "g1")!;
  assert.deepEqual([g1.counts.sectionsExact, g1.counts.sectionsUnmatched], [1, 1]);
  const unmatched = g1.changes.topics.find((t) => (t as { template_key: string | null }).template_key === "bolum:v1_eslesmeyen") as { id: string; parent_id: string };
  assert.ok(unmatched && unmatched.parent_id === uuidV5(`guide:${T}:g1`), "eşleşmeyenler bölümü ana konunun altında");
  const ambBlock = g1.changes.blocks.find((b) => (b as { topic_id: string }).topic_id === unmatched.id) as { content_text: string };
  assert.ok(ambBlock.content_text.includes("Belirsiz") && ambBlock.content_text.includes('mode="hacamat"'), "ham içerik + özgün konum");
  const g2 = p1.guides.find((g) => g.guideId === "g2")!;
  assert.equal((g2.changes.topics[0] as { title: string }).title.length, 200);
  assert.ok(JSON.stringify(g2.changes.blocks).includes("x".repeat(201)), "tam ad korundu");
  assert.deepEqual([...new Set(p1.issues.map((i) => i.kind))].sort(), ["ad_kisaltildi", "belirsiz_eslesme"]);
  const other = planLegacyImport({ tenantId: T2, guides, sections }, empty, []);
  assert.equal(other.guides.length, 1);
  assert.notEqual((other.guides[0].changes.topics[0] as { id: string }).id, uuidV5(`guide:${T}:g1`), "farklı tenant → farklı kimlik");
});

// ── 7. AŞAMA: sürüm seçimi · kurum kaydı değişiklik kümesine girmez · çakışma çözümü ──
test("Sürüm seçimi (yöntem B, layout): bayrak '1' → V2; başka her değer → V1; doğrudan V2 adresi açıkken yönlenir, kapalıyken 404", () => {
  assert.equal(sifaV2EnabledFromEnv({ SIFA_REHBERI_V2_ENABLED: "1" }), true);
  for (const v of [undefined, "", "0", "true", "yes", " 1"]) assert.equal(sifaV2EnabledFromEnv({ SIFA_REHBERI_V2_ENABLED: v }), false, String(v));
  assert.equal(sifaScreen(true), "v2");
  assert.equal(sifaScreen(false), "v1");
  assert.deepEqual(directV2Decision(true), { kind: "redirect", to: "/sifa-rehberi" });
  assert.deepEqual(directV2Decision(false), { kind: "notFound" });
});
test("Değişiklik kümesi KURUM kayıtlarını hiçbir zaman göndermez (yerelde değişse bile)", () => {
  const base = seedWorkspace("proto-uzman");
  const shared: Workspace = {
    ...base,
    nodes: base.nodes.map((n) => (subtreeIds(base, AK).has(n.id) ? { ...n, scope: "kurum" as const, version: 1 } : n)),
    blocks: base.blocks.map((b) => (subtreeIds(base, AK).has(b.nodeId) ? { ...b, scope: "kurum" as const, version: 1 } : b)),
  };
  const draft: Workspace = {
    ...shared,
    nodes: shared.nodes.map((n) => (n.id === AK ? { ...n, title: "DEĞİŞTİ" } : n)),
    blocks: shared.blocks.map((b) => (b.nodeId === AK ? { ...b, contentText: "DEĞİŞTİ" } : b)),
    links: [...shared.links, { id: "l-yeni", ownerId: "x", fromNodeId: AK, toNodeId: "proto-uzman-n-migren", createdAt: "x" }],
  };
  const cs = buildChangeset(shared, draft);
  assert.ok(isEmptyChangeset(cs), JSON.stringify(cs).slice(0, 200));
});
// F3: eski V2 arayüzünün çakışma penceresi (rebaseOnto) kaldırıldı; çakışma sunucuda 409 ile sınanır (scripts/sifa-rehberi-f3).
test("Değişiklik algılama KANONİK: DB'nin (jsonb) anahtar sırası farklı ama içerik aynı → değişmemiş sayılır", () => {
  const base = seedWorkspace("proto-uzman");
  const reorder = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(reorder) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x as object).reverse().map(([k, v]) => [k, reorder(v)])) : x;
  const fromDb: Workspace = { ...base, blocks: base.blocks.map((b) => ({ ...b, contentJson: reorder(b.contentJson) as typeof b.contentJson, sources: b.sources.map((s) => reorder(s) as typeof s) })) };
  assert.ok(isEmptyChangeset(buildChangeset(fromDb, base)), "yalnız anahtar sırası farklı → boş küme");
  const one = { ...base, blocks: base.blocks.map((b, i) => (i === 0 ? { ...b, contentText: b.contentText + " X" } : b)) };
  assert.equal(buildChangeset(fromDb, one).blocks.length, 1, "gerçekten değişen tek kutu");
});

console.log(`\nSONUÇ: ${pass} PASS, ${failCount} FAIL`);
process.exit(failCount ? 1 : 0);
