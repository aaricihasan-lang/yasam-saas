/**
 * Şifa Rehberi V2 — ENTEGRASYON TESTİ · 8. aşama GERÇEK SUPABASE varyantı.
 * integration.pg.mts'nin BİREBİR kopyası; YALNIZ bağlantı değişti: gömülü PostgreSQL yerine
 * ayrı test projesi (guard.mts fail-closed: ref dbyfbuqsbgfsoaakmvsx + işaret tablosu) — session pooler.
 * Supabase'de anon/authenticated/service_role rolleri hazır olduğundan CREATE ROLE atlanır.
 * TEK SEFERLİK: A/B bölümleri V1 Şifa şemasını ve V2 migration'ını kurar (boş healing şemasında çalışır).
 *
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/integration.real.mts
 *
 * Sınar:
 *  A) V1 şeması — GERÇEK supabase/migrations dosyalarıyla (+ repoda olmayan healing_guides tabanı)
 *  B) V2 migration'ı (supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql) V1'in YANINA kurulur
 *  C) Kalıcı kayıt: GERÇEK sunucu servisi (lib/sifa-rehberi-v2/server/service.ts) + gerçek SQL
 *     — kaydet/yükle, sürüm çakışması, atomiklik, aynı tenant'ta iki uzman, farklı tenant,
 *       sahiplik sahteciliği, tarayıcı rollerinin reddi, depolama yolu kısıtları, içerik süzgeci
 *  D) V1 → V2 aktarım: sayılar, metin/görsel bütünlüğü, tekrarlanabilirlik, kaynak değişmezliği
 *  E) Geri dönüş: V2 kurulu + dolu iken V1 RPC'leri ve verisi çalışır/değişmez; V2 tabloları silinmez
 *  F) Word: DB'den yüklenen uzman verisinden .docx — başlık/numara/tablo/görsel/bağlantı/Türkçe
 */
import { connectTestDb } from "./guard";
import JSZip from "jszip";
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { seedWorkspace } from "@/lib/sifa-rehberi-v2/seed";
import { applySaveResult, buildChangeset } from "@/lib/sifa-rehberi-v2/changeset";
import { loadWorkspace, mapDbError, registerUpload, saveChangeset, visibleAssets, type Scope } from "@/lib/sifa-rehberi-v2/server/service";
import { pgDb } from "@/lib/sifa-rehberi-v2/server/dbAdapters";
import { planLegacyImport, uuidV5, type MapRow, type V1Guide, type V1Section } from "@/lib/sifa-rehberi-v2/server/legacyImport";
import { buildTopicWord } from "@/lib/sifa-rehberi-v2/word";
import { addBlock, addLink, addNode, childrenOf, moveNode, nodeById, pathOf, renameNode, reorderNode, softDeleteNode, validateWorkspace, type Ctx } from "@/lib/sifa-rehberi-v2/tree";
import { RELATED_SECTION_KEY } from "@/lib/sifa-rehberi-v2/related";
import { TEMPLATE_ENTRIES } from "@/lib/sifa-rehberi-v2/template";
import type { Workspace } from "@/lib/sifa-rehberi-v2/types";

/** F3: servis sarmalayıcısı kaldırıldı (kurum kopyası ucu yok); DB fonksiyonu burada doğrudan sınanır. */
async function copySharedToPersonal(db: { rpc(fn: string, a: Record<string, unknown>): Promise<unknown> }, s: Scope, rootId: string) {
  try {
    const r = (await db.rpc("sifa_v2_copy_shared", { p_tenant: s.tenantId, p_user: s.userId, p_root: rootId })) as { root_id: string; created: boolean };
    return { ok: true as const, value: { rootId: String(r.root_id), created: Boolean(r.created) } };
  } catch (e) {
    return { ok: false as const, ...mapDbError(e) };
  }
}

// ── Test çerçevesi ───────────────────────────────────────────────────────────
type Status = "PASS" | "FAIL";
const results: { group: string; name: string; status: Status; detail?: string }[] = [];
let group = "";
async function test(name: string, fn: () => Promise<string | void>) {
  try {
    const d = await fn();
    results.push({ group, name, status: "PASS", detail: d ?? undefined });
    console.log(`  ✓ ${name}${d ? ` — ${d}` : ""}`);
  } catch (e) {
    results.push({ group, name, status: "FAIL", detail: (e as Error).message });
    console.log(`  ✗ ${name}\n      ${(e as Error).message.split("\n")[0]}`);
  }
}
function section(n: string) {
  group = n;
  console.log(`\n${n}`);
}
function assert(c: unknown, msg: string): asserts c {
  if (!c) throw new Error(msg);
}

// ── GERÇEK Supabase test projesi (fail-closed guard) ─────────────────────────
void net;
void os;
const c = await connectTestDb();
if ((await c.query("select to_regclass('public.healing_guides') r")).rows[0].r !== null) {
  console.error("DUR: healing_guides zaten var — bu betik TEK SEFERLİKTİR (boş healing şeması bekler).");
  await c.end();
  process.exit(2);
}
const q = (sql: string, p?: unknown[]) => c.query(sql, p);
const db = pgDb(c);

const MIG = path.resolve("supabase/migrations");
const V1_MIGRATIONS = [
  "20260520120000_healing_guide_sections.sql",
  "20260521120000_healing_guide_applications_section.sql",
  "20261201000000_lock_healing_guide_sections_anon.sql",
  "20261202000000_healing_guide_sections_faz2_provenance_notes.sql",
  "20261211000000_sifa_rehberi_search.sql",
  "20261213000000_healing_guides_transfer_provenance.sql",
  "20270108000000_sifa_create_healing_guide_with_sections.sql",
];
const V2_SQL = readFileSync(path.resolve("supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql"), "utf8");

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const A: Scope = { tenantId: T1, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }; // uzman A (T1)
const B: Scope = { tenantId: T1, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }; // uzman B (AYNI tenant T1)
const C: Scope = { tenantId: T2, userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }; // uzman C (farklı tenant T2)
const ctx: Ctx = { now: "2026-11-21T10:00:00.000Z", newId: () => crypto.randomUUID() };

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Tohum verisini (metin kimlikli) UUID kimlikli gerçek çalışma alanına çevirir + görsel ekler. */
function seedAsUuid(ownerKey: string): Workspace {
  const ws = seedWorkspace("proto-uzman");
  const id = (x: string) => uuidV5(`seed:${x}`);
  const ws2: Workspace = {
    ownerId: ownerKey,
    nodes: ws.nodes.map((x) => ({ ...x, ownerId: ownerKey, id: id(x.id), parentId: x.parentId ? id(x.parentId) : null })),
    blocks: ws.blocks.map((b) => ({ ...b, ownerId: ownerKey, id: id(b.id), nodeId: id(b.nodeId), sources: b.sources.map((s) => ({ ...s, id: uuidV5(`src:${b.id}:${s.id}`) })) })),
    links: ws.links.map((l) => ({ ...l, ownerId: ownerKey, id: id(l.id), fromNodeId: id(l.fromNodeId), toNodeId: id(l.toNodeId) })),
  };
  // Görselli + bağlantılı kutu (Word ve bütünlük için)
  const hacamat = ws2.nodes.find((x) => x.templateKey === "konu:hacamat_suluk")!;
  const r = addBlock(ws2, { nodeId: hacamat.id, title: "Uygulama Notu" }, ctx);
  assert(r.ok, "kutu");
  const bid = r.value.block.id;
  const content = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Çağdaş uygulama notu — ışığı, üzümü, şişeyi; ÇĞİÖŞÜ. " }, { type: "text", text: "Kaynak", marks: [{ type: "link", attrs: { href: "https://example.org/hacamat" } }] }] },
      { type: "figure", attrs: { src: PNG_1x1, caption: "Sentetik görsel" } },
      { type: "paragraph", content: [{ type: "text", text: "Kötü bağlantı", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
    ],
  };
  return { ...r.value.ws, blocks: r.value.ws.blocks.map((b) => (b.id === bid ? { ...b, contentJson: content, contentText: "Çağdaş uygulama notu" } : b)) };
}
const AK = uuidV5("seed:proto-uzman-n-akciger");
const REL = uuidV5("seed:proto-uzman-n-rahatsizliklar");
const BRONSIT = uuidV5("seed:proto-uzman-n-bronsit");

const pathOfRoot = (ws: Workspace, id: string) => pathOf(ws, id)[0]?.id ?? null;

async function v1Checksum(): Promise<string> {
  const g = await q("select md5(coalesce(string_agg(t::text, '|' order by id), '')) h from public.healing_guides t");
  const s = await q("select md5(coalesce(string_agg(t::text, '|' order by id), '')) h from public.healing_guide_sections t");
  const o = await q("select md5(coalesce(string_agg(t::text, '|' order by id), '')) h from public.other_module_records t");
  return `${g.rows[0].h}/${s.rows[0].h}/${o.rows[0].h}`;
}
async function count(table: string, where = "true", params: unknown[] = []) {
  return Number((await q(`select count(*)::int n from public.${table} where ${where}`, params)).rows[0].n);
}
async function load(s: Scope, key = s.userId) {
  const r = await loadWorkspace(db, s, key);
  assert(r.ok, `yükleme: ${!r.ok ? r.error : ""}`);
  return r.value;
}

try {
  // ══════════════════════════════════════════════════════════════════════════
  section("A) V1 ŞEMASI — gerçek migration dosyalarıyla");
  // Supabase: anon / authenticated / service_role rolleri hazır (CREATE ROLE atlanır).
  await test("healing_guides tabanı (repoda CREATE yok → denetimden kolon listesi) + diğer modül tablosu", async () => {
    const legacyCols = ["general_summary", "medical_causes", "subconscious_causes", "temperament_causes", "other_causes", "iridology_match", "hand_analysis_match", "cupping_leech", "reflexology", "diet_recommendations", "herbal_methods", "stone_recommendations", "aromatherapy", "meditation", "breathwork", "bioenergy", "massage", "daily_routine", "sleep_routine", "supportive_alternative_methods", "islamic_recommendations"];
    await q(`CREATE TABLE public.healing_guides (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, name text NOT NULL, category text, symptoms text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz, images jsonb DEFAULT '[]'::jsonb,
      related_stones jsonb, related_reflexology jsonb, ${legacyCols.map((x) => `${x} text`).join(", ")})`);
    await q("CREATE TABLE public.other_module_records (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, payload text NOT NULL)");
    return `${legacyCols.length} eski düz kolon`;
  });
  for (const f of V1_MIGRATIONS) {
    await test(`V1 migration: ${f}`, async () => {
      await q(readFileSync(path.join(MIG, f), "utf8"));
    });
  }
  await test("V1 RPC'leri yalnız service_role'e açık (anon/authenticated reddedilir)", async () => {
    const r = await q("select has_function_privilege('authenticated', 'public.create_healing_guide_with_sections(uuid,jsonb,jsonb,uuid)', 'EXECUTE') a, has_function_privilege('service_role', 'public.create_healing_guide_with_sections(uuid,jsonb,jsonb,uuid)', 'EXECUTE') s");
    assert(r.rows[0].a === false && r.rows[0].s === true, JSON.stringify(r.rows[0]));
  });

  // Sentetik V1 verisi (T1 + T2) — V1'in kendi RPC'siyle oluşturulur
  const v1Create = async (tenant: string, guide: object, sections: object[]) =>
    (await q("select public.create_healing_guide_with_sections($1::uuid, $2::jsonb, $3::jsonb, null) r", [tenant, JSON.stringify(guide), JSON.stringify(sections)])).rows[0].r;
  let G1 = "", G2 = "", G3 = "", G4 = "";
  await test("Sentetik V1 kayıtları V1 RPC'siyle oluşturuldu (T1: 4 kayıt, T2: 1 kayıt) + diğer modül verisi", async () => {
    const r1 = await v1Create(T1, { name: "Sentetik Bronşit (V1)", category: "Solunum", symptoms: "Öksürük\nBalgam", related_stones: ["Ametist", { name: "Kuvars" }] }, [
      { section_type: "reasons", mode: "genel_ozet", title: "Genel bakış", note: "Paragraf bir.\n\nParagraf iki — ÇĞİÖŞÜ çğıöşü.", source: "Örnek Kitap s.12", source_kind: "kitap", images: [{ id: "im1", name: "Şema", file_path: `healing-guides/${T1}/staging/x1.png` }] },
      { section_type: "reasons", mode: "bilincalti", note: "Bilinçaltı notu", attention: "Dikkat metni", expert_note: "Uzman yorumu" },
      { section_type: "applications", mode: "hacamat", note: "Eski 'hacamat' modlu not (V1 yedek başlığa düşürür)" },
      { section_type: "supportive", mode: "aromaterapi", note: "Aromaterapi notu", images: [{ id: "im2", name: "Yabancı", file_path: `healing-guides/${T2}/staging/x2.png` }, { id: "im3", name: "Yalnız URL", url: "https://eski.example/x.png" }, { id: "im4", name: "Eski public URL", url: `https://proje.supabase.co/storage/v1/object/public/stone-photos/healing-guides/${T1}/eski/y.png` }] },
      { section_type: "islamic_suggestions", mode: "islamic_suggestions", note: "İslami öneri notu" },
    ]);
    G1 = r1.guide_id ?? r1.id ?? r1.guide?.id;
    assert(G1, `G1 kimliği: ${JSON.stringify(r1)}`);
    G2 = (await q(`insert into public.healing_guides (tenant_id, name, general_summary, cupping_leech, images) values ($1, 'Sentetik Migren (bölümsüz V1)', 'Düz kolon özeti', 'Düz kolon hacamat', $2::jsonb) returning id`, [T1, JSON.stringify([{ id: "g2i", name: "Kapak", file_path: `healing-guides/${T1}/g2/kapak.jpg` }])])).rows[0].id;
    G3 = (await q("insert into public.healing_guides (tenant_id, name) values ($1, $2) returning id", [T1, "U".repeat(240)])).rows[0].id;
    const r4 = await v1Create(T1, { name: "Bölümlü + düz kolonlu", general_summary: "Gösterilmeyen düz kolon" }, [{ section_type: "herbal", mode: "bitkisel", note: "Bitkisel not" }]);
    G4 = r4.guide_id ?? r4.id ?? r4.guide?.id;
    await q("update public.healing_guides set general_summary = 'Gösterilmeyen düz kolon' where id = $1", [G4]);
    await v1Create(T2, { name: "T2 kaydı (başka tenant)" }, [{ section_type: "reasons", mode: "genel_ozet", note: "T2 notu" }]);
    await q("insert into public.other_module_records values (gen_random_uuid(), $1, 'doğaltaş kaydı'), (gen_random_uuid(), $1, 'refleksoloji kaydı')", [T1]);
    return `G1=${G1.slice(0, 8)}… (5 bölüm), G2 bölümsüz, G3 ad 240 karakter, G4 bölüm+düz kolon`;
  });
  const v1Before = await v1Checksum();

  // ══════════════════════════════════════════════════════════════════════════
  section("B) V2 MIGRATION — V1'in yanına");
  await test("V2 migration hatasız kuruluyor; healing_* nesnelerine dokunmuyor (DDL taraması)", async () => {
    assert(!/(ALTER|DROP|TRUNCATE)\s+(TABLE|FUNCTION|INDEX)?\s*(IF\s+EXISTS\s+)?public\.(healing|sifa_fold|search_healing)/i.test(V2_SQL), "V2 SQL V1 nesnesine dokunuyor");
    await q(V2_SQL);
    assert((await v1Checksum()) === v1Before, "V2 kurulumu V1 verisini değiştirdi");
  });
  await test("Tarayıcı rolleri (anon/authenticated) V2 tablolarına ve fonksiyonlarına ERİŞEMEZ", async () => {
    for (const role of ["anon", "authenticated"]) {
      await q("BEGIN");
      await q(`SET LOCAL ROLE ${role}`);
      let denied = 0;
      for (const sql of ["select * from public.sifa_topics", `select public.sifa_v2_load('${A.tenantId}','${A.userId}')`, "select * from public.sifa_block_assets"]) {
        await q("SAVEPOINT s");
        try {
          await q(sql);
        } catch (e) {
          if (/permission denied/.test((e as Error).message)) denied++;
        }
        await q("ROLLBACK TO SAVEPOINT s");
      }
      await q("ROLLBACK");
      assert(denied === 3, `${role}: ${denied}/3 reddedildi`);
    }
    await q("BEGIN; SET LOCAL ROLE service_role;");
    await q(`select public.sifa_v2_load('${A.tenantId}','${A.userId}')`);
    await q("ROLLBACK");
    return "anon 3/3, authenticated 3/3 reddedildi; service_role erişebildi";
  });

  // ══════════════════════════════════════════════════════════════════════════
  section("C) KALICI KAYIT — gerçek servis + gerçek SQL");
  let wsA = seedAsUuid(A.userId);
  await test("İlk Kaydet: 51 başlık + 25 kutu + 3 bağlantı + kaynaklar DB'ye yazılır; yeniden yüklemede birebir", async () => {
    assert(validateWorkspace(wsA).length === 0, "tohum geçerli");
    const empty: Workspace = { ownerId: A.userId, nodes: [], blocks: [], links: [] };
    const r = await saveChangeset(db, A, buildChangeset(empty, wsA));
    assert(r.ok, `kaydet: ${!r.ok ? r.error : ""}`);
    wsA = applySaveResult(wsA, r.value);
    const got = await load(A);
    assert(got.nodes.length === wsA.nodes.length && got.blocks.length === wsA.blocks.length && got.links.length === wsA.links.length, `sayılar ${got.nodes.length}/${got.blocks.length}/${got.links.length}`);
    for (const nd of wsA.nodes) {
      const g = got.nodes.find((x) => x.id === nd.id)!;
      assert(g && g.title === nd.title && g.parentId === nd.parentId && g.sortKey === nd.sortKey && (g.templateKey ?? null) === (nd.templateKey ?? null), `başlık farkı ${nd.title}`);
    }
    const srcCount = wsA.blocks.reduce((a, b) => a + b.sources.length, 0);
    assert((await count("sifa_block_sources", "owner_key = $1", [A.userId])) === srcCount, "kaynak sayısı");
    const rel = got.nodes.find((x) => x.id === REL)!;
    assert(rel.templateKey === RELATED_SECTION_KEY, "sistem bölümü anahtarı DB'de");
    return `${got.nodes.length} başlık, ${got.blocks.length} kutu, ${got.links.length} bağlantı, ${srcCount} kaynak`;
  });
  await test("Sunucu içerik süzgeci: javascript: bağlantısı DB'ye yazılmaz; güvenli bağlantı + görsel korunur", async () => {
    const got = await load(A);
    const b = got.blocks.find((x) => x.title === "Uygulama Notu")!;
    const json = JSON.stringify(b.contentJson);
    assert(!json.includes("javascript:"), "javascript: bağlantısı kalmış");
    assert(json.includes("https://example.org/hacamat") && json.includes("data:image/png;base64"), "güvenli içerik kaybolmuş");
  });
  await test("Düzenleme kümesi: yeniden adlandırma, taşıma, sıralama, kutu metni, çöpe atma — hepsi tek işlemde", async () => {
    let d = wsA;
    const nu = addNode(d, { parentId: REL, title: "Astım" }, ctx);
    assert(nu.ok, "ekle");
    d = nu.value.ws;
    const astim = nu.value.node.id;
    const ren = renameNode(d, astim, "Astım (yeni)", ctx);
    assert(ren.ok, "ad");
    d = ren.value;
    const kanser = uuidV5("seed:proto-uzman-n-kanser");
    const ro = reorderNode(d, kanser, "up", ctx);
    assert(ro.ok, "sıra");
    d = ro.value;
    const mv = moveNode(d, uuidV5("seed:proto-uzman-n-migren"), REL, ctx);
    assert(mv.ok, "taşı");
    d = mv.value;
    const del = softDeleteNode(d, uuidV5("seed:proto-uzman-n-tirnak"), ctx);
    assert(del.ok, "sil");
    d = del.value.ws;
    const bi = d.blocks.findIndex((x) => x.title === "Tanım");
    d = { ...d, blocks: d.blocks.map((x, i) => (i === bi ? { ...x, contentText: "Yeni tanım", contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Yeni tanım" }] }] } } : x)) };
    const r = await saveChangeset(db, A, buildChangeset(wsA, d));
    assert(r.ok, `kaydet: ${!r.ok ? r.error : ""}`);
    wsA = applySaveResult(d, r.value);
    const got = await load(A);
    assert(nodeById(got, astim)?.title === "Astım (yeni)", "ad");
    assert(nodeById(got, uuidV5("seed:proto-uzman-n-migren"))?.parentId === REL, "taşıma");
    assert(nodeById(got, uuidV5("seed:proto-uzman-n-tirnak")) === null && got.nodes.some((x) => x.id === uuidV5("seed:proto-uzman-n-tirnak") && x.deletedAt), "çöpte");
    assert(childrenOf(got, REL).map((x) => x.title).join("|") === childrenOf(wsA, REL).map((x) => x.title).join("|"), "sıra");
    assert(got.blocks.find((x) => x.title === "Tanım" && x.contentText === "Yeni tanım"), "kutu metni");
    const v = got.blocks.find((x) => x.title === "Tanım")!.version;
    assert(v === 2, `sürüm ${v}`);
    return `sürüm 1→${v}; ${Object.keys(r.value.topics).length} başlık + ${Object.keys(r.value.blocks).length} kutu yazıldı`;
  });
  await test("AYNI ANDA İKİ DÜZENLEME: ikinci kayıt sürüm çakışmasıyla REDDEDİLİR; o kümenin HİÇBİR parçası yazılmaz", async () => {
    const tab1 = await load(A);
    const tab2 = await load(A);
    const target = tab1.blocks.find((x) => x.title === "Özet" && x.classification === "uzman_notu")!;
    const edit = (ws: Workspace, text: string) => ({ ...ws, blocks: ws.blocks.map((x) => (x.id === target.id ? { ...x, contentText: text, contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } } : x)) });
    const r1 = await saveChangeset(db, A, buildChangeset(tab1, edit(tab1, "SEKME-1")));
    assert(r1.ok, "ilk kayıt");
    let t2 = edit(tab2, "SEKME-2");
    const extra = addNode(t2, { parentId: null, title: "Sekme-2 yeni konu" }, ctx);
    assert(extra.ok, "ek");
    t2 = extra.value.ws;
    const r2 = await saveChangeset(db, A, buildChangeset(tab2, t2));
    assert(!r2.ok && r2.status === 409 && r2.code === "SIFA_V2_CONFLICT", `beklenen 409: ${JSON.stringify(r2)}`);
    const got = await load(A);
    assert(got.blocks.find((x) => x.id === target.id)!.contentText === "SEKME-1", "ilk kayıt korunmalı");
    assert(!got.nodes.some((x) => x.title === "Sekme-2 yeni konu"), "çakışan kümenin yeni konusu YAZILMAMALI");
    wsA = got;
    return `409 "${r2.error.slice(0, 48)}…"`;
  });
  await test("Kısmi başarısızlık yok: geçerli + geçersiz (kilitli başlık adı) karışık küme → hiçbiri yazılmaz", async () => {
    const before = await count("sifa_topics", "owner_key = $1", [A.userId]);
    const tpl = wsA.nodes.find((x) => x.templateKey === "konu:genel_ozet")!;
    const body = buildChangeset(wsA, { ...wsA, nodes: [...wsA.nodes.map((x) => (x.id === tpl.id ? { ...x, title: "Değiştirilmiş" } : x))] });
    body.topics.push({ id: crypto.randomUUID(), parent_id: null, title: "Yazılmaması gereken", sort_key: "z1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null });
    const r = await saveChangeset(db, A, body);
    assert(!r.ok && r.status === 422, JSON.stringify(r));
    assert((await count("sifa_topics", "owner_key = $1", [A.userId])) === before, "satır sayısı değişmemeli");
  });
  await test("Sistem bölümü DB kuralları: ana konu altında tek; alt başlığa konamaz; adı değiştirilemez", async () => {
    const dup = await saveChangeset(db, A, { topics: [{ id: crypto.randomUUID(), parent_id: AK, title: "İlişkili Rahatsızlıklar", sort_key: "zz1", template_key: RELATED_SECTION_KEY, deleted_at: null, delete_batch_id: null, base_version: null }] });
    assert(!dup.ok, "ikinci bölüm reddedilmeli");
    const deep = await saveChangeset(db, A, { topics: [{ id: crypto.randomUUID(), parent_id: BRONSIT, title: "İlişkili Rahatsızlıklar", sort_key: "zz1", template_key: RELATED_SECTION_KEY, deleted_at: null, delete_batch_id: null, base_version: null }] });
    assert(!deep.ok, "alt başlığa reddedilmeli");
    const rel = nodeById(wsA, REL)!;
    const ren = await saveChangeset(db, A, { topics: [{ id: REL, parent_id: AK, title: "Başka Ad", sort_key: rel.sortKey, template_key: RELATED_SECTION_KEY, deleted_at: null, delete_batch_id: null, base_version: rel.version ?? 1 }] });
    assert(!ren.ok && ren.status === 422, JSON.stringify(ren));
    const userTitled = await saveChangeset(db, A, { topics: [{ id: crypto.randomUUID(), parent_id: BRONSIT, title: "İlişkili Rahatsızlıklar", sort_key: "zz1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }] });
    assert(userTitled.ok, "aynı adlı KULLANICI başlığı serbest (sistem bölümü sayılmaz)");
    wsA = await load(A);
    return "ikinci bölüm / derin bölüm / ad değişikliği reddedildi; aynı adlı kullanıcı başlığı serbest";
  });
  await test("İlişkili kayıt mükerrerleşmez: aynı (from,to) bağlantısı iki ayrı kaydette → TEK satır", async () => {
    const ok = nodeById(wsA, uuidV5("seed:proto-uzman-n-oksuruk"))!;
    const l1 = addLink(wsA, ok.id, BRONSIT, ctx);
    assert(l1.ok, "l1");
    const before = await count("sifa_topic_links", "owner_key = $1 and from_topic_id = $2 and to_topic_id = $3", [A.userId, ok.id, BRONSIT]);
    const r = await saveChangeset(db, A, { links_add: [{ id: crypto.randomUUID(), from_topic_id: ok.id, to_topic_id: BRONSIT }] });
    const r2 = await saveChangeset(db, A, { links_add: [{ id: crypto.randomUUID(), from_topic_id: ok.id, to_topic_id: BRONSIT }] });
    assert(r.ok && r2.ok, "kaydet");
    const after = await count("sifa_topic_links", "owner_key = $1 and from_topic_id = $2 and to_topic_id = $3", [A.userId, ok.id, BRONSIT]);
    assert(before === 1 && after === 1, `${before}→${after}`);
    assert((await count("sifa_topics", "owner_key = $1 and title = 'Bronşit' and deleted_at is null", [A.userId])) === 1, "tek Bronşit");
  });
  await test("Çöp Kutusu: silinen kayıt yüklemede silinme bilgisiyle gelir; 30 günden eski gelmez; geri yükleme yazılır", async () => {
    const got = await load(A);
    const tirnak = got.nodes.find((x) => x.id === uuidV5("seed:proto-uzman-n-tirnak"))!;
    assert(tirnak.deletedAt, "çöpte");
    const restore = await saveChangeset(db, A, { topics: [{ id: tirnak.id, parent_id: null, title: tirnak.title, sort_key: tirnak.sortKey, template_key: null, deleted_at: null, delete_batch_id: null, base_version: tirnak.version ?? 1 }] });
    assert(restore.ok, "geri yükle");
    await q("update public.sifa_topics set deleted_at = now() - interval '31 days', delete_batch_id = gen_random_uuid() where id = $1", [tirnak.id]);
    assert(!(await load(A)).nodes.some((x) => x.id === tirnak.id), "30 günden eski çöp yüklenmemeli");
    await q("update public.sifa_topics set deleted_at = null, delete_batch_id = null, version = version + 1 where id = $1", [tirnak.id]);
    wsA = await load(A);
  });

  section("C2) UZMAN VERİ İZOLASYONU — aynı tenant (A/B) ve farklı tenant (C)");
  for (const [label, other] of [["AYNI tenant'taki uzman B", B], ["FARKLI tenant'taki uzman C", C]] as const) {
    await test(`${label}: A'nın hiçbir kaydını göremez (yükleme/arama/okuma/Word kaynağı boş)`, async () => {
      const ws = await load(other);
      assert(ws.nodes.length === 0 && ws.blocks.length === 0 && ws.links.length === 0, `${ws.nodes.length} başlık sızdı`);
      assert((await buildTopicWord(ws, AK)) === null, "Word üretilmemeli");
    });
    await test(`${label}: A'nın kutusunu güncelleyemez → 404, A'nın verisi değişmez`, async () => {
      const b = wsA.blocks.find((x) => x.title === "Genel Not")!;
      const r = await saveChangeset(db, other, { blocks: [{ id: b.id, topic_id: AK, title: "ELE GEÇİRİLDİ", content_json: null, content_text: "x", classification: null, sort_key: b.sortKey, deleted_at: null, delete_batch_id: null, base_version: b.version ?? 1, sources: [] }] });
      assert(!r.ok && r.status === 404, JSON.stringify(r));
      assert((await load(A)).blocks.find((x) => x.id === b.id)!.title === "Genel Not", "A'nın verisi değişmiş");
    });
    await test(`${label}: A'nın konusuna kutu/alt başlık/bağlantı ekleyemez; A'nın bağlantısını silemez`, async () => {
      const own = crypto.randomUUID();
      const okRoot = await saveChangeset(db, other, { topics: [{ id: own, parent_id: null, title: "Kendi konusu", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }] });
      assert(okRoot.ok, "kendi konusu");
      const tries = [
        { blocks: [{ id: crypto.randomUUID(), topic_id: AK, title: "Sızma", content_json: null, content_text: "", classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] }] },
        { topics: [{ id: crypto.randomUUID(), parent_id: AK, title: "Sızma", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }] },
        { links_add: [{ id: crypto.randomUUID(), from_topic_id: own, to_topic_id: BRONSIT }] },
      ];
      for (const t of tries) {
        const r = await saveChangeset(db, other, t);
        assert(!r.ok && r.status === 404, `reddedilmeliydi: ${JSON.stringify(r)}`);
      }
      const aLink = wsA.links[0];
      const rm = await saveChangeset(db, other, { links_remove: [aLink.id] });
      assert(rm.ok, "silme isteği hata vermeden YOK SAYILIR");
      assert((await load(A)).links.some((l) => l.id === aLink.id), "A'nın bağlantısı silinmiş!");
      assert((await count("sifa_topics", "owner_key = $1 and parent_id = $2", [other.userId, AK])) === 0, "sızma satırı");
      return "kutu/alt başlık/bağlantı 404; bağlantı silme etkisiz";
    });
  }
  await test("Sahiplik sahteciliği: gövdeye başka sahip/tenant yazmak etkisiz — satır OTURUM kapsamına yazılır", async () => {
    const id = crypto.randomUUID();
    const r = await saveChangeset(db, B, { topics: [{ id, parent_id: null, title: "B'nin konusu", sort_key: "b1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, owner_key: A.userId, owner_user_id: A.userId, scope: "kurum", tenant_id: T2 } as never] });
    assert(r.ok, JSON.stringify(r));
    const row = (await q("select owner_key, tenant_id, scope from public.sifa_topics where id = $1", [id])).rows[0];
    assert(row.owner_key === B.userId && row.tenant_id === T1 && row.scope === "kisisel", JSON.stringify(row));
  });
  await test("Tenant uyuşmazlığı: A'nın kimliği T2 kapsamıyla A'nın verisine ulaşamaz", async () => {
    const ws = await load({ tenantId: T2, userId: A.userId });
    assert(ws.nodes.length === 0, "sızdı");
  });
  await test("Geçersiz istek: kimlik/alan/boyut doğrulaması (400) — DB'ye hiç gidilmez", async () => {
    const bad = [
      { topics: [{ id: "x", parent_id: null, title: "a", sort_key: "a1", base_version: null }] },
      { evil: [] },
      { blocks: [{ id: crypto.randomUUID(), topic_id: AK, title: "a", content_json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(2_100_000) }] }] }, content_text: "", classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] }] },
    ];
    for (const b of bad) {
      const r = await saveChangeset(db, A, b);
      assert(!r.ok && r.status === 400, JSON.stringify(r).slice(0, 120));
    }
    const sc = await saveChangeset(db, { tenantId: "x", userId: A.userId }, {});
    assert(!sc.ok && sc.status === 400, "kapsam");
  });
  await test("Depolama yolu güvenliği (DB kısıtı): başka uzmanın/tenant'ın yolu ve '..' reddedilir", async () => {
    const blk = wsA.blocks[0].id;
    await q("BEGIN");
    const bad = [
      ["upload", "sifa-arastirma", `${T1}/${B.userId}/x.png`],
      ["upload", "sifa-arastirma", `${T1}/${A.userId}/../${B.userId}/x.png`],
      ["legacy_ref", "stone-photos", `healing-guides/${T2}/x.png`],
      ["upload", "stone-photos", `${T1}/${A.userId}/x.png`],
    ];
    for (const [origin, bucket, p] of bad) {
      await q("SAVEPOINT s");
      let rejected = false;
      try {
        await q("insert into public.sifa_block_assets (id, tenant_id, owner_key, scope, block_id, origin, bucket, storage_path) values (gen_random_uuid(), $1, $2, 'kisisel', $3, $4, $5, $6)", [T1, A.userId, blk, origin, bucket, p]);
      } catch {
        rejected = true;
      }
      await q("ROLLBACK TO SAVEPOINT s").catch(() => {});
      assert(rejected, `kabul edilmemeliydi: ${origin} ${p}`);
    }
    await q("insert into public.sifa_block_assets (id, tenant_id, owner_key, scope, block_id, origin, bucket, storage_path) values (gen_random_uuid(), $1, $2, 'kisisel', $3, 'upload', 'sifa-arastirma', $4)", [T1, A.userId, blk, `${T1}/${A.userId}/ok.png`]);
    await q("ROLLBACK"); // test satırı kalıcı olmasın
    return "4/4 güvensiz yol reddedildi; doğru yol kabul edildi";
  });

  // ══════════════════════════════════════════════════════════════════════════
  section("D) V1 → V2 AKTARIM — KURUM ORTAK kaydı (hiçbir uzmana atanmaz) + YETKİ MATRİSİ");
  const readV1 = async (tenant: string) => ({
    guides: (await q("select * from public.healing_guides where tenant_id = $1", [tenant])).rows as V1Guide[],
    sections: (await q("select s.* from public.healing_guide_sections s join public.healing_guides g on g.id = s.guide_id where g.tenant_id = $1", [tenant])).rows as V1Section[],
  });
  const readMap = async (tenant: string) => (await q("select legacy_kind, legacy_id, target_kind, target_id, source_hash from public.sifa_legacy_import_map where tenant_id = $1", [tenant])).rows as MapRow[];
  /** Kurum kapsamı: hedef tenant; okuma için tenant'taki HERHANGİ bir uzmanın yüklemesinin kurum kısmı. */
  const runImport = async (tenant: string, reader: Scope) => {
    const v1 = await readV1(tenant);
    const all = await load(reader);
    const shared: Workspace = { ...all, nodes: all.nodes.filter((n) => n.scope === "kurum"), blocks: all.blocks.filter((b) => b.scope === "kurum"), links: [] };
    const plan = planLegacyImport({ tenantId: tenant, ...v1 }, shared, await readMap(tenant), { supabaseHost: "proje.supabase.co" });
    let written = 0;
    for (const g of plan.guides) {
      if (!g.changes.topics.length && !g.changes.blocks.length && !g.changes.assets.length) continue;
      await q("select public.sifa_v2_import_legacy($1::uuid, $2::jsonb, $3::jsonb)", [tenant, JSON.stringify(g.changes), JSON.stringify(g.map)]);
      written += g.changes.topics.length + g.changes.blocks.length + g.changes.assets.length;
    }
    return { plan, written };
  };
  const sharedCount = async (tenant: string) => [
    await count("sifa_topics", "tenant_id = $1 and scope = 'kurum'", [tenant]),
    await count("sifa_topic_blocks", "tenant_id = $1 and scope = 'kurum'", [tenant]),
    await count("sifa_block_assets", "tenant_id = $1 and scope = 'kurum'", [tenant]),
  ];
  let firstPlan: Awaited<ReturnType<typeof runImport>>["plan"];
  await test("İlk aktarım: 4 V1 kaydı → T1 KURUM ana konuları (+25 hazır başlık); hiçbiri bir uzmana atanmadı", async () => {
    const { plan, written } = await runImport(T1, A);
    firstPlan = plan;
    const g = (id: string) => plan.guides.find((x) => x.guideId === id)!;
    assert(g(G1).status === "yeni" && g(G1).counts.sectionsExact === 4 && g(G1).counts.sectionsUnmatched === 1, `G1 ${JSON.stringify(g(G1).counts)}`);
    assert(g(G2).status === "yeni" && g(G2).counts.legacyColumns === 2, `G2 ${JSON.stringify(g(G2).counts)}`);
    assert(g(G3).status === "yeni", "G3 (uzun ad) da aktarılmalı");
    assert(g(G4).counts.sectionsExact === 1 && g(G4).counts.legacyColumns === 1, "G4");
    const personal = await count("sifa_topics", "tenant_id = $1 and scope = 'kisisel' and title like '%(V1)%'", [T1]);
    assert(personal === 0, "V1 kaydı kişisel kayıt olarak oluşmuş");
    const roots = await count("sifa_topics", "tenant_id = $1 and owner_key = $1 and scope = 'kurum' and parent_id is null", [T1]);
    assert(roots === 4, `4 kurum ana konusu bekleniyordu: ${roots}`);
    const g1 = uuidV5(`guide:${T1}:${G1}`);
    const tpl = await count("sifa_topics", "parent_id = $1 and template_key like 'grup:%' or parent_id in (select id from public.sifa_topics where parent_id = $1 and template_key like 'grup:%') or (parent_id = $1 and template_key like 'konu:%')", [g1]);
    assert(tpl === TEMPLATE_ENTRIES.length, `hazır başlık ${tpl}/${TEMPLATE_ENTRIES.length}`);
    return `${written} satır; 4 kurum ana konusu; kişisel atama 0; ${plan.issues.length} rapor maddesi`;
  });
  await test("Belirsiz not ATILMADI: 'V1'den Eşleşmeyen Notlar' bölümünde, ÖZGÜN V1 konumu + ham içerikle işaretli", async () => {
    const amb = firstPlan.issues.find((i) => i.kind === "belirsiz_eslesme")!;
    assert(amb && amb.detail.includes("hacamat") && amb.detail.includes("Eşleşmeyen"), amb?.detail);
    const g1 = uuidV5(`guide:${T1}:${G1}`);
    const sec = (await q("select id, title from public.sifa_topics where parent_id = $1 and template_key = 'bolum:v1_eslesmeyen'", [g1])).rows;
    assert(sec.length === 1, "eşleşmeyen bölümü yok");
    const blk = (await q("select title, content_text from public.sifa_topic_blocks where topic_id = $1", [sec[0].id])).rows;
    assert(blk.length === 1 && blk[0].content_text.includes(`Eski 'hacamat' modlu not`) && blk[0].content_text.includes(`section_type="applications", mode="hacamat"`), JSON.stringify(blk));
    const kinds = [...new Set(firstPlan.issues.map((i) => i.kind))].sort();
    assert(JSON.stringify(kinds) === JSON.stringify(["ad_kisaltildi", "belirsiz_eslesme", "duz_kolon_gosterilmiyor", "gorsel_cozulemedi", "gorsel_reddedildi"]), kinds.join(","));
    return `"${blk[0].title}"`;
  });
  await test("Uzun ad: başlık kısaltıldı, TAM ad korundu · bölümlü kayıttaki gizli düz kolon ATILMADI (işaretli)", async () => {
    const g3 = uuidV5(`guide:${T1}:${G3}`);
    const t = (await q("select title from public.sifa_topics where id = $1", [g3])).rows[0].title as string;
    assert(t.length === 200 && t.endsWith("…"), `başlık ${t.length}`);
    const info = (await q("select content_text from public.sifa_topic_blocks where topic_id = $1 and title = 'V1 kayıt bilgileri'", [g3])).rows[0].content_text as string;
    assert(info.includes("U".repeat(240)), "tam ad korunmamış");
    const g4 = uuidV5(`guide:${T1}:${G4}`);
    const i4 = (await q("select content_text from public.sifa_topic_blocks where topic_id = $1 and title = 'V1 kayıt bilgileri'", [g4])).rows[0].content_text as string;
    assert(i4.includes("Gösterilmeyen düz kolon") && i4.includes("V1'de gösterilmeyen eski alanlar"), i4);
  });
  await test("Metin bütünlüğü: her V1 notunun TAM metni V2'de (Türkçe dahil); kurum sahipliği (owner_key = tenant)", async () => {
    const v1 = await readV1(T1);
    const map = await readMap(T1);
    for (const m of map.filter((x) => x.legacy_kind === "section")) {
      const s = v1.sections.find((x) => x.id === m.legacy_id)!;
      const b = (await q("select content_text, owner_key, scope from public.sifa_topic_blocks where id = $1", [m.target_id])).rows[0];
      assert(b && b.owner_key === T1 && b.scope === "kurum", "kurum sahipliği");
      for (const part of [s.note, s.attention, s.expert_note, s.source].filter(Boolean) as string[]) {
        for (const line of part.split(/\n+/)) assert(b.content_text.includes(line.trim()), `eksik metin: ${line}`);
      }
    }
    assert(await count("sifa_topic_blocks", "tenant_id = $1 and content_text like '%ÇĞİÖŞÜ çğıöşü%'", [T1]), "Türkçe");
    return `${map.filter((x) => x.legacy_kind === "section").length}/${v1.sections.length} bölüm notu birebir (eşleşmeyen dahil; hiçbiri atılmadı)`;
  });
  await test("Görsel bütünlüğü: V1 çözümleyicisiyle aynı tenant yolları → kurum referansı + içerikte görünür figür", async () => {
    const assets = (await q("select id, storage_path, origin, bucket, scope from public.sifa_block_assets where tenant_id = $1 and scope = 'kurum' order by storage_path", [T1])).rows;
    assert(assets.length === 3, `3 referans bekleniyordu (file_path×2 + eski URL×1): ${JSON.stringify(assets.map((a) => a.storage_path))}`);
    assert(assets.every((a) => a.origin === "legacy_ref" && a.bucket === "stone-photos" && a.storage_path.startsWith(`healing-guides/${T1}/`)), JSON.stringify(assets));
    for (const a of assets) assert(await count("sifa_topic_blocks", "content_json::text like $1", [`%sifa-asset:${a.id}%`]), `figür yok: ${a.storage_path}`);
    return assets.map((a) => a.storage_path.replace(T1, "<T1>")).join(", ");
  });
  await test("Tekrar çalıştırma: MÜKERRER YOK (0 yeni satır); sayılar aynı", async () => {
    const before = await sharedCount(T1);
    const { written, plan } = await runImport(T1, B);
    const after = await sharedCount(T1);
    assert(written === 0 && JSON.stringify(before) === JSON.stringify(after), `${written} yazıldı; ${before} → ${after}`);
    assert(plan.guides.every((g) => g.status === "zaten_aktarildi"), plan.guides.map((g) => g.status).join(","));
    return `öncesi=sonrası ${after.join("/")}`;
  });
  await test("Kaynak değişti mi? → tespit edilir, kurum kopyasının üzerine YAZILMAZ", async () => {
    await q("update public.healing_guides set category = 'Değişti' where id = $1", [G1]);
    const { plan, written } = await runImport(T1, A);
    assert(written === 0 && plan.issues.some((i) => i.kind === "kaynak_degismis" && i.guideId === G1), "tespit");
    await q("update public.healing_guides set category = 'Solunum' where id = $1", [G1]);
  });
  await test("Aktarım V1 kaynaklarını DEĞİŞTİRMEDİ (V1 + diğer modül özeti aynı)", async () => {
    assert((await v1Checksum()) === v1Before, "V1 verisi değişmiş");
  });
  await test("T2'nin aktarımı yalnız T2 kurumuna: T1 uzmanları T2'yi, T2 uzmanı T1'i GÖRMEZ", async () => {
    await runImport(T2, C);
    const a = await load(A);
    const cc = await load(C);
    assert(!a.nodes.some((x) => x.title === "T2 kaydı (başka tenant)"), "T1 uzmanı T2 kaydını görüyor");
    assert(cc.nodes.some((x) => x.title === "T2 kaydı (başka tenant)" && x.scope === "kurum"), "T2 uzmanı kendi kurum kaydını görmüyor");
    assert(!cc.nodes.some((x) => x.title.includes("(V1)") || x.title.includes("bölümsüz")), "T2 uzmanı T1 kurum kaydını görüyor");
  });

  section("D2) YETKİ MATRİSİ — Tenant A/Uzman 1 (A), Tenant A/Uzman 2 (B), Tenant B/Uzman 3 (C)");
  const G1R = uuidV5(`guide:${T1}:${G1}`);
  await test("Kurum kaydını Tenant A'nın İKİ uzmanı da okur; Tenant B okuyamaz", async () => {
    const [a, b, cc] = [await load(A), await load(B), await load(C)];
    const sa = a.nodes.filter((n) => n.scope === "kurum" && !n.parentId).map((n) => n.id).sort();
    const sb = b.nodes.filter((n) => n.scope === "kurum" && !n.parentId).map((n) => n.id).sort();
    assert(sa.length === 4 && JSON.stringify(sa) === JSON.stringify(sb), `A ${sa.length} / B ${sb.length}`);
    assert(!cc.nodes.some((n) => sa.includes(n.id)), "C T1 kurum kaydını görüyor");
    return `A=${sa.length}, B=${sb.length}, C=0 (T1 kurum)`;
  });
  await test("Kurum kaydı İZİNSİZ DEĞİŞTİRİLEMEZ: başlık/kutu güncelleme, alt başlık/kutu ekleme, bağlantı, silme → 404", async () => {
    const ws = await load(A);
    const root = nodeById(ws, G1R)!;
    const blk = ws.blocks.find((b) => b.scope === "kurum" && b.nodeId !== G1R)!;
    const tries: unknown[] = [
      { topics: [{ id: G1R, parent_id: null, title: "DEĞİŞTİ", sort_key: root.sortKey, template_key: null, deleted_at: null, delete_batch_id: null, base_version: root.version }] },
      { topics: [{ id: G1R, parent_id: null, title: root.title, sort_key: root.sortKey, template_key: null, deleted_at: ctx.now, delete_batch_id: crypto.randomUUID(), base_version: root.version }] },
      { blocks: [{ id: blk.id, topic_id: blk.nodeId, title: "DEĞİŞTİ", content_json: null, content_text: "", classification: null, sort_key: blk.sortKey, deleted_at: null, delete_batch_id: null, base_version: blk.version, sources: [] }] },
      { topics: [{ id: crypto.randomUUID(), parent_id: G1R, title: "Kişisel alt başlık", sort_key: "zz1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }] },
      { blocks: [{ id: crypto.randomUUID(), topic_id: G1R, title: "Kişisel not", content_json: null, content_text: "", classification: null, sort_key: "zz1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] }] },
      { links_add: [{ id: crypto.randomUUID(), from_topic_id: AK, to_topic_id: G1R }] },
    ];
    for (const [who, sc] of [["A", A], ["B", B]] as const) {
      for (const t of tries) {
        const r = await saveChangeset(db, sc, t);
        assert(!r.ok && r.status === 404, `${who} reddedilmeliydi: ${JSON.stringify(r).slice(0, 120)}`);
      }
    }
    const after = (await q("select title, deleted_at from public.sifa_topics where id = $1", [G1R])).rows[0];
    assert(after.title === "Sentetik Bronşit (V1)" && after.deleted_at === null, "kurum kaydı değişmiş");
    return `${tries.length * 2}/${tries.length * 2} deneme reddedildi; özgün kayıt aynı`;
  });
  let copyRoot = "";
  await test("Kişisel kopya: özgün kurum kaydına DOKUNMADAN Uzman 1'e ayrı kopya; tekrarında mevcut kopya döner", async () => {
    const sharedBefore = await sharedCount(T1);
    const r1 = await copySharedToPersonal(db, A, G1R);
    assert(r1.ok && r1.value.created, JSON.stringify(r1));
    copyRoot = r1.value.rootId;
    const r2 = await copySharedToPersonal(db, A, G1R);
    assert(r2.ok && !r2.value.created && r2.value.rootId === copyRoot, "ikinci kopya oluşmamalı");
    assert(JSON.stringify(await sharedCount(T1)) === JSON.stringify(sharedBefore), "kurum kaydı değişmiş");
    const ws = await load(A);
    const copy = nodeById(ws, copyRoot)!;
    assert(copy.scope === "kisisel" && copy.title.endsWith("— kişisel kopya"), copy.title);
    const copyBlocks = ws.blocks.filter((b) => b.scope === "kisisel" && pathOfRoot(ws, b.nodeId) === copyRoot);
    const origBlocks = ws.blocks.filter((b) => b.scope === "kurum" && pathOfRoot(ws, b.nodeId) === G1R);
    assert(copyBlocks.length === origBlocks.length && copyBlocks.length > 0, `${copyBlocks.length}/${origBlocks.length}`);
    // Kopya kişiseldir: düzenlenebilir.
    const cb = copyBlocks[0];
    const ed = await saveChangeset(db, A, { blocks: [{ id: cb.id, topic_id: cb.nodeId, title: cb.title, content_json: cb.contentJson, content_text: cb.contentText + " KOPYADA DÜZENLEME", classification: null, sort_key: cb.sortKey, deleted_at: null, delete_batch_id: null, base_version: cb.version, sources: [] }] });
    assert(ed.ok, JSON.stringify(ed));
    const orig = (await q("select content_text from public.sifa_topic_blocks where id = $1", [origBlocks.find((o) => o.title === cb.title)?.id ?? origBlocks[0].id])).rows[0].content_text;
    assert(!orig.includes("KOPYADA DÜZENLEME"), "özgün kurum kaydı değişti!");
    return `${copyBlocks.length} kutu kopyalandı; kopya düzenlendi, özgün değişmedi`;
  });
  await test("Uzman 1'in kişisel kayıtları (kopya dahil) Uzman 2'ye ve Tenant B'ye GÖRÜNMEZ", async () => {
    const b = await load(B);
    const cc = await load(C);
    for (const ws of [b, cc]) {
      assert(!ws.nodes.some((n) => n.id === copyRoot || n.id === AK), "kişisel kayıt sızdı");
      assert(!ws.blocks.some((x) => x.contentText.includes("KOPYADA DÜZENLEME") || x.contentText.includes("SEKME-1")), "kişisel içerik sızdı");
    }
    assert((await copySharedToPersonal(db, C, G1R)).ok === false, "T2 uzmanı T1 kaydını kopyalayamamalı");
  });
  await test("Görsel yetkisi (DB): Uzman 1 ve 2 kurum görselini görür; Tenant B göremez; kişisel yükleme yalnız sahibine", async () => {
    const shared = (await q("select id from public.sifa_block_assets where tenant_id = $1 and scope = 'kurum'", [T1])).rows.map((r) => r.id as string);
    const own = crypto.randomUUID();
    const reg = await registerUpload(db, A, { id: own, storage_path: `${T1}/${A.userId}/${own}.png`, mime_type: "image/png", byte_size: 68 });
    assert(reg.ok, JSON.stringify(reg));
    const forged = await registerUpload(db, B, { id: crypto.randomUUID(), storage_path: `${T1}/${A.userId}/x.png`, mime_type: "image/png", byte_size: 68 });
    assert(!forged.ok, "B, A'nın yoluna kayıt açabildi");
    const va = await visibleAssets(db, A, [...shared, own]);
    const vb = await visibleAssets(db, B, [...shared, own]);
    const vc = await visibleAssets(db, C, [...shared, own]);
    assert(va.ok && va.value.length === shared.length + 1, `A ${va.ok && va.value.length}`);
    assert(vb.ok && vb.value.length === shared.length && !vb.value.some((x) => x.id === own), "B kişisel görseli görüyor");
    assert(vc.ok && vc.value.length === 0, "C T1 görsellerini görüyor");
    return `A=${shared.length}+1, B=${shared.length}, C=0`;
  });
  await test("Yetkisiz/bozuk kapsam: tenant=kullanıcı (kurum adına yazma) ve yanlış tenant reddedilir", async () => {
    const asTenant = await saveChangeset(db, { tenantId: T1, userId: T1 }, { topics: [{ id: crypto.randomUUID(), parent_id: null, title: "Kurum adına", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }] });
    assert(!asTenant.ok && asTenant.status === 400, JSON.stringify(asTenant));
    const wrong = await load({ tenantId: T2, userId: A.userId });
    assert(!wrong.nodes.some((n) => n.id === G1R || n.id === AK), "yanlış tenant kapsamı sızdı");
  });

  // ══════════════════════════════════════════════════════════════════════════
  section("E) ESKİ SÜRÜME GERİ DÖNÜŞ (veri katmanı) — V2 kurulu ve DOLU iken");
  await test("V1 arama RPC'si çalışıyor (search_healing_guides)", async () => {
    const fn = (await q("select pg_get_function_identity_arguments(p.oid) a from pg_proc p where p.proname = 'search_healing_guides'")).rows[0].a;
    const r = await q(`select count(*)::int n from public.search_healing_guides($1::uuid, 'bronşit', null, 50, null, null)`, [T1]);
    assert(r.rows[0].n >= 1, `sonuç ${r.rows[0].n}`);
    return `imza (${fn}); 'bronşit' → ${r.rows[0].n} kayıt`;
  });
  await test("V1 oluşturma + bölüm değiştirme RPC'leri çalışıyor; yeni V1 kaydı V2'ye karışmıyor", async () => {
    const r = await v1Create(T1, { name: "Geri dönüş sonrası V1 kaydı" }, [{ section_type: "reasons", mode: "tibbi", note: "V1 notu" }]);
    const gid = r.guide_id ?? r.id ?? r.guide?.id;
    const rep = (await q("select public.replace_healing_guide_sections($1::uuid, $2::uuid, $3::jsonb) r", [gid, T1, JSON.stringify([{ section_type: "applications", mode: "diyet", note: "Değişti" }])])).rows[0].r;
    assert(rep, "replace");
    assert(!(await load(A)).nodes.some((x) => x.title === "Geri dönüş sonrası V1 kaydı"), "V2'ye karıştı");
    await q("delete from public.healing_guides where id = $1", [gid]);
  });
  await test("Eski V1 kayıtları + diğer modül verisi BİREBİR aynı; V2 tabloları silinmeden duruyor", async () => {
    assert((await v1Checksum()) === v1Before, "V1 verisi değişmiş");
    const v2rows = await count("sifa_topics");
    assert(v2rows > 0, "V2 tabloları boş/silinmiş");
    return `V1 özeti aynı; V2'de ${v2rows} başlık bekliyor (silinmedi)`;
  });
  await test("F3 (Owner kararı 26.11.2026): V1 ekranı + API'si KALDIRILDI; kalan V1 kütüphaneleri ve mevcut migration'lar DEĞİŞMEDİ", async () => {
    // Dal tabanına (merge-base) göre: V1 ekran/API dosyaları yok; hazır başlık şablonunun kaynağı (topicTree/sectionModel)
    // ve iki yardımcı aynen; MEVCUT hiçbir migration değişmedi/silinmedi (yalnız ekleme). V1 VERİSİ DB'de korunur (yukarıdaki test).
    const base = execSync("git merge-base HEAD origin/main", { encoding: "utf8" }).trim();
    const lines = (cmd: string) => execSync(cmd, { encoding: "utf8" }).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const mig = lines(`git diff --name-status ${base} -- supabase/migrations`).filter((l) => !l.startsWith("A"));
    assert(mig.length === 0, `mevcut migration değişti/silindi: ${mig.join(" | ")}`);
    const kept = ["lib/sifa-rehberi/topicTree.ts", "lib/sifa-rehberi/sectionModel.ts", "lib/sifa-rehberi/normalizeTr.ts", "lib/sifa-rehberi/stonePhotoStorage.ts"];
    assert(lines(`git diff --name-status ${base} -- ${kept.join(" ")}`).length === 0, "kalan V1 kütüphanesi değişti");
    const { existsSync } = await import("node:fs");
    for (const gone of ["app/api/sifa-rehberi", "app/sifa-rehberi/[id]", "components/sifa-rehberi", "lib/sifa-rehberi/healingGuideLiveData.ts"]) assert(!existsSync(gone), `V1 kalıntısı: ${gone}`);
    return `taban ${base.slice(0, 8)}`;
  });

  // ══════════════════════════════════════════════════════════════════════════
  section("F) WORD RAPORU — DB'den yüklenen uzman verisinden");
  await test("AKCİĞER .docx: numaralı hiyerarşi, çoklu kutu, tablo, görsel, bağlantı, DOI, Türkçe; boş başlık yok", async () => {
    const ws = await load(A);
    const w = await buildTopicWord(ws, AK, { generatedAt: new Date("2026-11-21T10:00:00Z") });
    assert(w, "üretilemedi");
    const zip = await JSZip.loadAsync(w.buffer);
    const xml = await zip.file("word/document.xml")!.async("string");
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/"));
    for (const need of ["1  BELİRTİLER / SEBEPLER", "1.1  Genel / Özet", "1.1.1  Akciğer nedir?", "1.2.1.1.1  Görüşme Notları (anonim)", "Kaynak Taraması", "Geleneksel Yorumlar", "Uzmanın Kendi Notları", "Çağdaş uygulama notu", "ÇĞİÖŞÜ", "Bölümler Tablosu", "Paragraf 36."]) {
      assert(xml.includes(need), `eksik: ${need}`);
    }
    // "Sağ akciğer" tablo HÜCRESİNDE geçer (içerik); boş BAŞLIK olarak (numaralı) geçmemeli.
    assert(!/\d  (Sağ akciğer|Sol akciğer|Alveoller|Tıbbi Nedenler|Nefes Tutma Alışkanlığı)</.test(xml), "boş başlık rapora girmiş");
    assert(!xml.includes("javascript"), "güvensiz bağlantı");
    assert(xml.includes("<w:tbl>") && media.length >= 1, `tablo/görsel (${media.length})`);
    assert(rels.includes("https://example.org/hacamat") && rels.includes("https://doi.org/10.0000/ornek-bicim"), "bağlantı/DOI");
    return `${w.report.headings} başlık, ${w.report.blocks} kutu, ${w.report.tables} tablo, ${w.report.images} görsel, ${w.report.links} bağlantı; ${(w.buffer.length / 1024).toFixed(0)} KB`;
  });
  await test("Kurum kaydının Word'ü: Uzman 2 (B) üretebilir (notlar + eşleşmeyenler bölümü); Tenant B (C) ÜRETEMEZ", async () => {
    const ws = await load(B);
    const root = childrenOf(ws, null).find((x) => x.title === "Sentetik Bronşit (V1)")!;
    assert(root && root.scope === "kurum", "B kurum kaydını görmüyor");
    const w = await buildTopicWord(ws, root.id);
    const xml = await (await JSZip.loadAsync(w!.buffer)).file("word/document.xml")!.async("string");
    for (const need of ["Paragraf iki — ÇĞİÖŞÜ çğıöşü.", "Bilinçaltı notu", "Dikkat metni", "Aromaterapi notu", "İslami öneri notu", "Kategori", "EŞLEŞMEYEN NOTLAR"]) {
      assert(xml.includes(need), `eksik: ${need}`);
    }
    assert((await buildTopicWord(await load(C), root.id)) === null, "C, T1 kurum kaydının Word'ünü üretebildi");
    assert(!(await buildTopicWord(ws, AK)), "B, A'nın kişisel konusunun Word'ünü üretebildi");
    return `${w!.report.headings} başlık, ${w!.report.blocks} kutu`;
  });
} finally {
  await c.end().catch(() => {});
  void rmSync;
}

const pass = results.filter((r) => r.status === "PASS").length;
const fail = results.length - pass;
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
