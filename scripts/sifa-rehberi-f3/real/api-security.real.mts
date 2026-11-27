/**
 * Şifa Rehberi F3 — API + GÜVENLİK testi (GERÇEK `next dev` + GERÇEK API + izole Supabase test projesi).
 * Sınar: kimlik/oturum, demo salt-okunur, kullanıcı ve kurum izolasyonu, kalıcı kutu silme (Storage nesnesi dahil),
 * görsel kaldırma, çöp zamanı sunucuda, hız sınırları, kullanıcı kotası YOK (F3-R1), XSS / güvensiz bağlantı süzgeci, kaldırılan uçlar,
 * Word (.docx içeriği + başka kullanıcının konusu), sürüm çakışması, acil durum anahtarı (bayrak kapalı → 404).
 * Çalıştır: SIFA_V2_TEST_SECRET_DIR=… npx tsx scripts/sifa-rehberi-f3/real/api-security.real.mts
 */
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { api, db, mkTenant, mkUser, nodeCodec, pngOf, startServer, stopServer, T, uploadPng, type U } from "./support.mjs";
import { stateToChangeset, workspaceToState, type State } from "../../../lib/sifa-rehberi-f3/model";
import { jsonToHtml } from "../../../lib/sifa-rehberi-f3/richText";
import type { Workspace } from "../../../lib/sifa-rehberi-v2/types";

const PORT = 3314;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(process.env.SIFA_F3_SHOTS_DIR ?? path.join(os.tmpdir(), "sifa-rehberi-f3-ekranlar"), "api");
mkdirSync(OUT, { recursive: true });
const storageAdmin = createClient(T.url, T.secretKey, { auth: { persistSession: false } });
let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string, x?: unknown) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${x !== undefined ? ` — ${JSON.stringify(x)}` : ""}`);
};
const sec = (t: string) => console.log(`\n${t}`);

const TA = await mkTenant("APIA");
const TB = await mkTenant("APIB");
const A = await mkUser(TA, "A");
const A2 = await mkUser(TA, "A2"); // aynı kurum, başka uzman
const C = await mkUser(TB, "C"); // başka kurum
const DEMO = await mkUser(TA, "DEMO");
const EMPTY = (): State => ({ topics: [], nodes: [], notes: {}, links: [] });

async function loadState(u: U) {
  const ws = (await api(BASE, u, "GET", "workspace")).json?.workspace as Workspace;
  return { ws, ...workspaceToState(ws, { toHtml: jsonToHtml }) };
}
async function saveDraft(u: U, mutate: (s: State) => void) {
  const { state, meta } = await loadState(u);
  const draft: State = JSON.parse(JSON.stringify(state));
  mutate(draft);
  return api(BASE, u, "POST", "workspace", stateToChangeset(state, draft, meta, nodeCodec, randomUUID));
}
const objectExists = async (p: string) => {
  const dir = p.split("/").slice(0, -1).join("/");
  const { data } = await storageAdmin.storage.from("sifa-arastirma").list(dir, { limit: 1000 });
  return (data ?? []).some((o) => `${dir}/${o.name}` === p);
};

const server = await startServer(PORT, A, path.join(OUT, "next-dev.log"));
try {
  const png = await pngOf(40, 90, 150);
  // Kurulum: A'nın konusu + not + kutu (görselli) + kaynak + bağlantı
  const ROOT = randomUUID(), HEAD = randomUUID(), NOTE = randomUUID(), BOX = randomUUID();
  const gNote = await uploadPng(BASE, A, png);
  const gBox = await uploadPng(BASE, A, png);
  {
    const s = EMPTY();
    s.topics.push({ id: ROOT, title: "API Konusu", createdAt: "", deletedAt: null });
    s.nodes.push({ id: HEAD, rootId: ROOT, parentId: null, title: "Başlık", templateKey: null, order: 1, deletedAt: null });
    s.notes[HEAD] = [{
      id: NOTE, title: "Not", html: "<p>Not metni</p>", cls: "bilimsel", createdAt: null, updatedAt: null, deletedAt: null,
      sources: [{ id: randomUUID(), title: "Makale", doi: "10.1234/x.1" }],
      images: [{ id: gNote, src: `asset:${gNote}`, caption: "not görseli" }],
      boxes: [{ id: BOX, title: "Kutu", html: "<p>Kutu metni</p>", deletedAt: null, sources: [{ id: randomUUID(), title: "Kitap" }], links: [{ id: randomUUID(), title: "Site", url: "https://ornek.example/s" }], images: [{ id: gBox, src: `asset:${gBox}`, caption: "kutu görseli" }] }],
    }];
    const r = await api(BASE, A, "POST", "workspace", stateToChangeset(EMPTY(), s, { rows: {}, links: {} }, nodeCodec, randomUUID));
    ok(r.status === 200, "kurulum: A'nın konusu / notu / kutusu (görselli, kaynaklı, bağlantılı) kaydedildi", r.status);
  }
  const pathOf = async (id: string) => String((await db.query("select storage_path from public.sifa_block_assets where id=$1", [id])).rows[0]?.storage_path ?? "");
  const pBox = await pathOf(gBox);
  const pNote = await pathOf(gNote);

  sec("1) Kimlik ve demo");
  ok((await api(BASE, null, "GET", "workspace")).status === 401, "oturumsuz okuma → 401");
  ok((await api(BASE, { ...A, token: "zz-yanlis" }, "GET", "workspace")).status === 401, "yanlış oturum belirteci → 401");
  ok((await api(BASE, DEMO, "GET", "workspace")).status === 200, "demo: okuma → 200");
  await db.query("update public.users set is_demo_account=true where id=$1", [DEMO.id]);
  const dw = await api(BASE, DEMO, "POST", "workspace", { topics: [], blocks: [], links_add: [], links_remove: [] });
  const dp = await api(BASE, DEMO, "POST", "assets/prepare", { mimeType: "image/png", size: 100 });
  const dword = await api(BASE, DEMO, "POST", "word", { rootId: ROOT });
  ok(dw.status === 403 && dp.status === 403 && dword.status === 403, "demo: kayıt / görsel yükleme / Word → 403 (salt-okunur korunuyor)", [dw.status, dp.status, dword.status]);

  sec("2) İzolasyon (aynı kurumda başka uzman + başka kurum)");
  for (const [u, l] of [[A2, "aynı kurum"], [C, "başka kurum"]] as const) {
    const st = await loadState(u);
    ok(!st.ws.nodes.some((n) => n.id === ROOT) && !st.ws.blocks.some((b) => b.id === NOTE || b.id === BOX), `${l}: A'nın konusu/notu/kutusu GÖRÜNMEZ`);
    const v = (await db.query("select version from public.sifa_topics where id=$1", [ROOT])).rows[0].version;
    const r1 = await api(BASE, u, "POST", "workspace", { topics: [{ id: ROOT, parent_id: null, title: "ele geçirme", sort_key: "m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: v }], blocks: [], links_add: [], links_remove: [] });
    const bv = (await db.query("select version from public.sifa_topic_blocks where id=$1", [BOX])).rows[0].version;
    const r2 = await api(BASE, u, "POST", "workspace", { topics: [], blocks: [], links_add: [], links_remove: [], blocks_delete: [{ id: BOX, base_version: bv }] });
    const r3 = await api(BASE, u, "POST", "workspace", { topics: [], blocks: [], links_add: [], links_remove: [], assets_set: [{ id: gNote, block_id: NOTE, caption: "x" }] });
    const r4 = await api(BASE, u, "POST", "workspace", { topics: [], blocks: [], links_add: [], links_remove: [], assets_delete: [gNote] });
    const r5 = await api(BASE, u, "POST", "assets/signed-urls", { ids: [gNote, gBox] });
    const r6 = await api(BASE, u, "POST", "assets/discard", { assetId: gBox, path: pBox });
    const r7 = await api(BASE, u, "POST", "word", { rootId: ROOT });
    ok(r1.status === 404 && r2.status === 404 && r3.status === 404 && r4.status === 404, `${l}: A'nın kaydını değiştiremez / kutusunu silemez / görselini bağlayamaz / kaldıramaz (404, varlık sızmaz)`, [r1.status, r2.status, r3.status, r4.status]);
    ok(Object.keys((r5.json?.urls as object) ?? {}).length === 0 && r6.status === 403 && r7.status === 404, `${l}: görsel bağlantısı alamaz, yüklemesini silemez, Word'ünü alamaz`, [r6.status, r7.status]);
  }
  const intact = (await db.query("select title from public.sifa_topics where id=$1", [ROOT])).rows[0].title;
  ok(intact === "API Konusu" && (await objectExists(pBox)) && (await objectExists(pNote)), "denemelerden sonra A'nın kayıtları ve görsel nesneleri yerinde");

  sec("3) Sahiplik alanı istemciden alınmaz");
  {
    const id = randomUUID();
    const r = await api(BASE, A2, "POST", "workspace", { topics: [{ id, parent_id: null, title: "A2 kaydı", sort_key: "m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, owner_key: A.id, tenant_id: TB }], blocks: [], links_add: [], links_remove: [] });
    const row = (await db.query("select owner_key, tenant_id from public.sifa_topics where id=$1", [id])).rows[0];
    ok(r.status === 200 && row.owner_key === A2.id && row.tenant_id === TA, "gövdedeki owner_key/tenant_id YOK SAYILDI; sahip oturumdaki uzman", row);
  }

  sec("4) İçerik kutusu KALICI silme + Storage");
  {
    const r = await saveDraft(A, (d) => {
      d.notes[HEAD][0].boxes = [];
    });
    const left = (await db.query("select (select count(*) from public.sifa_topic_blocks where id=$1)::int b, (select count(*) from public.sifa_block_sources where block_id=$1)::int s, (select count(*) from public.sifa_block_assets where id=$2)::int a", [BOX, gBox])).rows[0];
    ok(r.status === 200 && left.b === 0 && left.s === 0 && left.a === 0, "kutu, kaynağı, bağlantısı ve görsel satırı DB'den silindi", left);
    ok(!(await objectExists(pBox)) && (await objectExists(pNote)), "kutunun görsel NESNESİ Storage'dan silindi; notun görseli yerinde");
    const trash = (await loadState(A)).ws.blocks.some((b) => b.id === BOX);
    ok(!trash, "silinen kutu Silinenler'de (çöp) YOK");
  }

  sec("5) Görsel kaldırma (not galerisi)");
  {
    const r = await saveDraft(A, (d) => {
      d.notes[HEAD][0].images = [];
    });
    ok(r.status === 200 && !(await objectExists(pNote)) && (await db.query("select count(*)::int n from public.sifa_block_assets where id=$1", [gNote])).rows[0].n === 0, "Kaydet → görsel satırı ve nesnesi silindi");
  }

  sec("6) Çöp zamanı sunucuda");
  {
    const v = (await db.query("select version from public.sifa_topics where id=$1", [HEAD])).rows[0].version;
    const r = await api(BASE, A, "POST", "workspace", { topics: [{ id: HEAD, parent_id: ROOT, title: "Başlık", sort_key: "000001m", template_key: null, deleted_at: "1999-01-01T00:00:00Z", delete_batch_id: randomUUID(), base_version: v }], blocks: [], links_add: [], links_remove: [] });
    const d = (await db.query("select deleted_at from public.sifa_topics where id=$1", [HEAD])).rows[0].deleted_at as Date;
    ok(r.status === 200 && Date.now() - d.getTime() < 120_000, "geçmiş tarihli deleted_at yok sayıldı (Silinenler'de 30 gün korunur)", d.toISOString());
    const v2 = (await db.query("select version from public.sifa_topics where id=$1", [HEAD])).rows[0].version;
    await api(BASE, A, "POST", "workspace", { topics: [{ id: HEAD, parent_id: ROOT, title: "Başlık", sort_key: "000001m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: v2 }], blocks: [], links_add: [], links_remove: [] });
  }

  sec("7) İçerik güvenliği (XSS / güvensiz bağlantı)");
  {
    const id = randomUUID();
    const evil = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "tıkla", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }, { type: "script", content: [{ type: "text", text: "alert(2)" }] }] };
    const r = await api(BASE, A, "POST", "workspace", { topics: [], blocks: [{ id, topic_id: HEAD, parent_block_id: null, title: "<img src=x onerror=alert(3)>", content_json: evil, content_text: "", classification: null, sort_key: "z", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] }], links_add: [], links_remove: [] });
    const row = (await db.query("select title, content_json::text j from public.sifa_topic_blocks where id=$1", [id])).rows[0];
    ok(r.status === 200 && !row.j.includes("javascript:") && !row.j.includes("script"), "javascript: bağlantısı ve izinsiz düğüm sunucuda süzüldü (metin korundu)", row.j.slice(0, 120));
    const html = jsonToHtml(JSON.parse(row.j));
    ok(!/<script|javascript:/i.test(html) && row.title.includes("<img"), "ekran HTML'i güvenli; başlık metin olarak saklanır (ekranda kaçışlı gösterilir)", html);
    const bad = await api(BASE, A, "POST", "workspace", { topics: [], blocks: [{ id: randomUUID(), topic_id: HEAD, parent_block_id: NOTE, title: "k", content_json: null, content_text: "", classification: null, sort_key: "a", deleted_at: null, delete_batch_id: null, base_version: null, sources: [{ id: randomUUID(), kind: "baglanti", title: "x", url: "javascript:alert(1)" }] }], links_add: [], links_remove: [] });
    ok(bad.status === 400, "javascript: web bağlantısı reddedildi (400)", bad.status);
  }

  sec("8) Kaldırılan / değişen uçlar");
  ok((await api(BASE, A, "POST", "copy", { rootId: ROOT })).status === 404, "kurum kopyası ucu (/copy) kaldırıldı → 404");
  const v1 = await fetch(`${BASE}/api/sifa-rehberi/guides`, { headers: { "x-user-id": A.id, "x-session-token": A.token } });
  ok(v1.status === 404, "eski V1 API (/api/sifa-rehberi/guides) kaldırıldı → 404", v1.status);

  sec("9) Word (.docx, kayıtlı veriden)");
  {
    const W = randomUUID(), WN = randomUUID(), WB = randomUUID();
    const g = await uploadPng(BASE, A, png);
    const s0 = await loadState(A);
    const d: State = JSON.parse(JSON.stringify(s0.state));
    d.topics.push({ id: W, title: "Word Konusu", createdAt: "", deletedAt: null });
    d.notes[W] = [{ id: WN, title: "Word Notu", html: "<p>Word metni ÇĞİÖŞÜ</p>", cls: "", createdAt: null, updatedAt: null, deletedAt: null, sources: [], images: [{ id: g, src: `asset:${g}`, caption: "Word görseli" }], boxes: [{ id: WB, title: "Word Kutusu", html: "<p>Kutu</p>", deletedAt: null, sources: [], images: [], links: [{ id: randomUUID(), title: "Kaynak site", url: "https://ornek.example/w" }] }] }];
    ok((await api(BASE, A, "POST", "workspace", stateToChangeset(s0.state, d, s0.meta, nodeCodec, randomUUID))).status === 200, "Word kurulumu kaydedildi");
    const w = await api(BASE, A, "POST", "word", { rootId: W });
    const zip = await JSZip.loadAsync(w.buf);
    const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
    const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/"));
    const txt = xml.replace(/<[^>]+>/g, " ");
    const order = ["Word Konusu", "Word Notu", "Word metni ÇĞİÖŞÜ", "Word görseli", "Word Kutusu", "Kaynak site", "Oluşturuldu"].map((t) => txt.indexOf(t));
    ok(w.status === 200 && order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), "Word: konu → not → metin → görsel açıklaması → kutu → bağlantı → tarih, doğru sırada", order);
    ok(media.length === 1, "Word: not görseli belgeye GÖMÜLÜ (word/media)", media);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await api(BASE, A, "POST", "word", { rootId: W })).status;
    ok(last === 429, "Word hız sınırı (kurum başına dakikada 10) → 429", last);
  }

  sec("10) Sürüm çakışması");
  {
    const s0 = await loadState(A);
    const d1: State = JSON.parse(JSON.stringify(s0.state));
    d1.topics.find((t) => t.id === ROOT)!.title = "Pencere 1";
    const d2: State = JSON.parse(JSON.stringify(s0.state));
    d2.topics.find((t) => t.id === ROOT)!.title = "Pencere 2";
    const r1 = await api(BASE, A, "POST", "workspace", stateToChangeset(s0.state, d1, s0.meta, nodeCodec, randomUUID));
    const r2 = await api(BASE, A, "POST", "workspace", stateToChangeset(s0.state, d2, s0.meta, nodeCodec, randomUUID));
    const t = (await db.query("select title from public.sifa_topics where id=$1", [ROOT])).rows[0].title;
    ok(r1.status === 200 && r2.status === 409 && t === "Pencere 1" && Array.isArray(r2.json?.conflicts), "ikinci pencere 409 + çakışma listesi; ilk kayıt korunur", [r1.status, r2.status, t]);
  }

  sec("11) Kullanıcı kotası YOK (Owner kararı F3-R1) + güvenlik sınırları ve hız sınırları KORUNUR");
  {
    // Yalnız SENTETİK veritabanı satırları (gerçek Storage nesnesi yok → kapasite tüketilmez); test sonunda silinir.
    const mark = `zz-kota-yok-${randomUUID()}`;
    await db.query(`insert into public.sifa_block_assets(id, tenant_id, owner_key, scope, block_id, origin, bucket, storage_path, mime_type, byte_size, caption)
      select gen_random_uuid(), $1::uuid, $2::uuid, 'kisisel', null, 'upload', 'sifa-arastirma', $1::text || '/' || $2::text || '/' || gen_random_uuid() || '.png', 'image/png', 10485760, $3::text
      from generate_series(1, 30)`, [TA, A2.id, mark]);
    const mb = (await db.query("select coalesce(sum(byte_size),0)::bigint b, count(*)::int n from public.sifa_block_assets where owner_key=$1 and origin='upload'", [A2.id])).rows[0];
    const q1 = await api(BASE, A2, "POST", "assets/prepare", { mimeType: "image/png", size: 5_000_000 });
    ok(Number(mb.b) > 250 * 1024 * 1024 && q1.status === 200 && !!q1.json?.assetId, `toplam ${Math.round(Number(mb.b) / 1048576)} MB (> 250 MB) varken yükleme ENGELLENMEZ (kota yok)`, { mb: mb.b, status: q1.status, code: q1.json?.code });
    await db.query(`insert into public.sifa_block_assets(id, tenant_id, owner_key, scope, block_id, origin, bucket, storage_path, mime_type, byte_size, caption)
      select gen_random_uuid(), $1::uuid, $2::uuid, 'kisisel', null, 'upload', 'sifa-arastirma', $1::text || '/' || $2::text || '/' || gen_random_uuid() || '.png', 'image/png', 1000, $3::text
      from generate_series(1, 5001)`, [TA, A2.id, mark]);
    const n = (await db.query("select count(*)::int n from public.sifa_block_assets where owner_key=$1 and origin='upload'", [A2.id])).rows[0].n;
    const q2 = await api(BASE, A2, "POST", "assets/prepare", { mimeType: "image/png", size: 1000 });
    ok(n > 5000 && q2.status === 200, `${n} görsel (> 5.000) varken yükleme ENGELLENMEZ (sayı sınırı yok)`, { n, status: q2.status, code: q2.json?.code });
    ok(!JSON.stringify([q1.json, q2.json]).includes("SIFA_V2_QUOTA") && !/kota/i.test(JSON.stringify([q1.json, q2.json])), "yanıtlarda kota kodu / kota iletisi YOK");
    await db.query("delete from public.sifa_block_assets where owner_key=$1 and caption=$2 and block_id is null", [A2.id, mark]);
    // Güvenlik amaçlı teknik sınırlar AYNEN
    const big = await api(BASE, A2, "POST", "assets/prepare", { mimeType: "image/png", size: 10 * 1024 * 1024 + 1 });
    ok(big.status === 413 && !/kota/i.test(JSON.stringify(big.json)), "dosya başına 10 MB teknik sınırı korunur (413; kota değil)", big.status);
    const bad = await api(BASE, A2, "POST", "assets/prepare", { mimeType: "application/pdf", size: 1000 });
    ok(bad.status === 415, "yalnız görsel türleri (dosya türü doğrulaması korunur → 415)", bad.status);
    let st = 0;
    for (let i = 0; i < 65; i++) st = (await api(BASE, C, "POST", "workspace", { topics: [], blocks: [], links_add: [], links_remove: [] })).status;
    ok(st === 429, "kayıt hız sınırı (uzman başına dakikada 60) → 429", st);
  }
} finally {
  stopServer(server);
}

sec("12) Acil durum anahtarı (SIFA_REHBERI_V2_ENABLED kapalı)");
{
  const s2 = await startServer(PORT, A, path.join(OUT, "next-dev-kapali.log"), { SIFA_REHBERI_V2_ENABLED: "0" });
  try {
    const r = await api(BASE, A, "GET", "workspace");
    const page = await fetch(`${BASE}/sifa-rehberi`);
    const html = await page.text();
    ok(r.status === 404, "bayrak kapalı → API 404", r.status);
    ok(page.status === 200 && html.includes("bakımda") && !html.includes(`data-testid="sifa-f3"`), "bayrak kapalı → ekran 'bakımda' iletisi (veri yerinde)");
  } finally {
    stopServer(s2);
  }
}
await db.end();
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
