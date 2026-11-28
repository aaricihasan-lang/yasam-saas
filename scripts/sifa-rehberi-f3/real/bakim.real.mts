/**
 * Şifa Rehberi F4-R1 — BAKIM MODU (SIFA_REHBERI_V2_ENABLED=0) doğrulaması: gerçek production build + izole test projesi
 * (guard.ts FAIL-CLOSED) + gerçek tarayıcı. Production'a / canlı Vercel'e temas YOK.
 *   1) Bayrak AÇIK: uzman kayıt yapar; tarayıcı sekmesi açık + kaydedilmemiş değişiklik; bir yükleme hazırlanmış (imzalı bağlantı alınmış).
 *   2) Sunucu bayrak KAPALI ile yeniden başlar (= yeniden dağıtım). Açık sekme kaydetmeye çalışır → yazılamaz.
 *   3) Tüm Şifa API'leri (Android / doğrudan istek dahil) → 404; görsel kesinleştirme yok; veritabanı satırları BİREBİR.
 *   4) Ekran "bakımda"; diğer modüller (ana ekran özeti, oturum) çalışır.
 *   5) Bayrak yeniden AÇIK → kayıtlar aynen, bakım sırasında hiçbir şey yazılmamış.
 * Çalıştır: SIFA_V2_TEST_SECRET_DIR=… [SIFA_F3_SERVER=start] npx tsx scripts/sifa-rehberi-f3/real/bakim.real.mts
 */
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { api, db, mkTenant, mkUser, pngOf, startServer, stopServer, T, uploadPng, userRecord, type U } from "./support.mjs";
import { workspaceToState } from "../../../lib/sifa-rehberi-f3/model";
import { jsonToHtml } from "../../../lib/sifa-rehberi-f3/richText";
import type { Workspace } from "../../../lib/sifa-rehberi-v2/types";

const PORT = 3316;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(process.env.SIFA_F3_SHOTS_DIR ?? path.join(os.tmpdir(), "sifa-rehberi-f3-ekranlar"), "bakim");
mkdirSync(OUT, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string, x?: unknown) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${!c && x !== undefined ? ` — ${JSON.stringify(x).slice(0, 300)}` : ""}`);
};
const sec = (t: string) => console.log(`\n${t}`);

const TA = await mkTenant("BAKIM");
const A = await mkUser(TA, "BAKIM-A");
/** Uzmanın TÜM Şifa satırlarının içerik özeti (tablo başına md5). */
async function fingerprint(u: U) {
  const out: Record<string, string> = {};
  for (const t of ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_block_assets", "sifa_topic_links"]) {
    const where = t === "sifa_block_sources" ? "block_id in (select id from public.sifa_topic_blocks where owner_key = $1)" : t === "sifa_topic_links" ? "tenant_id = (select tenant_id from public.users where id = $1)" : "owner_key = $1";
    out[t] = (await db.query(`select count(*)::int n, md5(coalesce(string_agg(md5(row_to_json(x)::text), ',' order by md5(row_to_json(x)::text)), '')) h from public.${t} x where ${where}`, [u.id])).rows.map((r) => `${r.n}:${r.h}`)[0];
  }
  return out;
}
async function loadState(u: U) {
  const ws = (await api(BASE, u, "GET", "workspace")).json?.workspace as Workspace;
  return workspaceToState(ws, { toHtml: jsonToHtml });
}

let server = await startServer(PORT, A, path.join(OUT, "sunucu-acik.log"));
const browser = await chromium.launch();
try {
  sec("1) Bayrak AÇIK — kayıt + açık sekme + hazırlanmış yükleme");
  const ROOT = randomUUID(), H = randomUUID(), N = randomUUID();
  const r0 = await api(BASE, A, "POST", "workspace", {
    topics: [{ id: ROOT, parent_id: null, title: "ZZ Bakım Konusu", sort_key: "m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null },
      { id: H, parent_id: ROOT, title: "ZZ Başlık", sort_key: "m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }],
    blocks: [{ id: N, topic_id: H, title: "ZZ Not", content_json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "bakım öncesi metin" }] }] }, content_text: "bakım öncesi metin", classification: null, sort_key: "m", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] }],
    links_add: [], links_remove: [],
  });
  ok(r0.status === 200, "bayrak açıkken kayıt yazıldı", r0.status);
  const img = await uploadPng(BASE, A, await pngOf(10, 120, 90));
  ok(!!img, "bayrak açıkken görsel yüklendi (gerçek Storage)");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "tr-TR" });
  await ctx.addInitScript(([rec, t]) => { localStorage.setItem("yasam_user", rec); localStorage.setItem("yasam_session_token", t); }, [userRecord(A), A.token]);
  const sb = new globalThis.URL(T.url).host;
  await ctx.route("**/*", (r) => { const h = new globalThis.URL(r.request().url()).host; return h === `localhost:${PORT}` || h === sb || r.request().url().startsWith("data:") || r.request().url().startsWith("blob:") ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sifa-rehberi#/konu/${ROOT}/${H}`);
  await page.getByTestId("edit").waitFor({ timeout: 60_000 });
  await page.getByTestId("edit").click();
  await page.getByTestId("note-title-input").first().fill("ZZ Not — bakımda kaydedilmemeli");
  ok(await page.getByTestId("save").first().isEnabled(), "açık sekmede kaydedilmemiş değişiklik var");
  // Bakımdan ÖNCE alınmış imzalı yükleme bağlantısı (eski sekme / Android'de yarım kalmış yükleme)
  const png = await pngOf(200, 40, 40);
  const pre = await api(BASE, A, "POST", "assets/prepare", { mimeType: "image/png", size: png.length });
  ok(pre.status === 200 && !!pre.json?.signedUrl, "bakımdan önce yükleme hazırlandı (imzalı bağlantı)");
  const before = await fingerprint(A);

  sec("2) Sunucu bayrak KAPALI ile yeniden başlar (yeniden dağıtım benzetimi)");
  stopServer(server);
  server = await startServer(PORT, A, path.join(OUT, "sunucu-kapali.log"), { SIFA_REHBERI_V2_ENABLED: "0" });
  await page.getByTestId("save").first().click();
  await page.getByTestId("toast").waitFor({ timeout: 15_000 }).catch(() => undefined);
  const toast = (await page.getByTestId("toast").allInnerTexts()).join(" | ");
  ok(/Kaydedilemedi/.test(toast) && /ekranda duruyor/.test(toast), "açık eski sekme Kaydet → 'Kaydedilemedi' (taslak ekranda kalır, sunucuya YAZILMAZ)", toast);
  await page.screenshot({ path: path.join(OUT, "acik-sekme-kaydedilemedi.png") });

  sec("3) Tüm Şifa API'leri bakımda 404 (Android / doğrudan istek)");
  const calls: Array<[string, string, unknown]> = [
    ["GET", "workspace", undefined],
    ["POST", "workspace", { topics: [{ id: ROOT, parent_id: null, title: "SALDIRI", sort_key: "m", template_key: null, deleted_at: new Date().toISOString(), delete_batch_id: randomUUID(), base_version: 1 }], blocks: [], links_add: [], links_remove: [] }],
    ["POST", "assets/prepare", { mimeType: "image/png", size: 1000 }],
    ["POST", "assets/finalize", { assetId: pre.json?.assetId, path: pre.json?.path }],
    ["POST", "assets/discard", { assetId: pre.json?.assetId, path: pre.json?.path }],
    ["POST", "assets/signed-urls", { ids: [img] }],
    ["POST", "word", { rootId: ROOT }],
  ];
  for (const [m, p, b] of calls) {
    const r = await api(BASE, A, m, p, b, { "user-agent": "YasamSistemi-Android/3.0 (WebView)" });
    ok(r.status === 404, `${m} /api/sifa-rehberi-v2/${p} → 404`, r.status);
  }
  const unauth = await api(BASE, null, "POST", "workspace", { topics: [], blocks: [], links_add: [], links_remove: [] });
  ok(unauth.status === 404, "oturumsuz istek de 404 (kimlik denetiminden ÖNCE kapanır)", unauth.status);
  // Bakımdan önce alınmış imzalı bağlantıyla doğrudan Storage yüklemesi: dosya kovaya düşebilir ama KAYIT OLUŞMAZ (kesinleştirme 404).
  const put = await fetch(String(pre.json?.signedUrl), { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(png) });
  const row = (await db.query("select count(*)::int n from public.sifa_block_assets where id = $1", [pre.json?.assetId])).rows[0].n;
  ok(row === 0, `eski imzalı bağlantı (Storage PUT ${put.status}): görsel kaydı OLUŞMADI; nesne yalnız sahipsiz dosya olarak kalır (veriye bağlanmaz)`, { put: put.status, row });
  const after = await fingerprint(A);
  ok(JSON.stringify(after) === JSON.stringify(before), "bakım boyunca uzmanın Şifa satırları BİREBİR (yazma / silme / düzenleme YOK)", { before, after });

  sec("4) Ekran bakımda; diğer modüller çalışır");
  const pg2 = await ctx.newPage();
  await pg2.goto(`${BASE}/sifa-rehberi`);
  await pg2.getByTestId("sifa-kapali").waitFor({ timeout: 30_000 }).catch(() => undefined);
  ok((await pg2.getByTestId("sifa-kapali").count()) === 1 && (await pg2.getByTestId("sifa-f3").count()) === 0, "yeni açılan Şifa sayfası 'bakımda' iletisi; F3 ekranı çizilmez");
  await pg2.screenshot({ path: path.join(OUT, "bakimda-ekran.png") });
  const v2 = await fetch(`${BASE}/sifa-rehberi-v2`, { redirect: "manual" });
  ok(v2.status === 404, "/sifa-rehberi-v2 → 404", v2.status);
  const home = await fetch(`${BASE}/`);
  ok(home.status === 200, "ana sayfa 200", home.status);
  const sum = await fetch(`${BASE}/api/dashboard/summary`, { headers: { "x-user-id": A.id, "x-session-token": A.token } });
  const sj = (await sum.json().catch(() => ({}))) as { counts?: Record<string, number | null> };
  ok(sum.status === 200 && typeof sj.counts?.sifa_rehberi === "number", "ana ekran özeti 200 (diğer sayaçlar + Şifa sayacı okunur)", { st: sum.status, c: sj.counts });
  const sess = await fetch(`${BASE}/api/auth/session`, { headers: { "x-user-id": A.id, "x-session-token": A.token } });
  ok(sess.status === 200, "oturum doğrulama 200 (giriş/oturum etkilenmez)", sess.status);

  sec("5) Bayrak yeniden AÇIK → veri aynen");
  stopServer(server);
  server = await startServer(PORT, A, path.join(OUT, "sunucu-acik-2.log"));
  const st = (await loadState(A)).state;
  const note = Object.values(st.notes).flat().find((n) => n.id === N);
  ok(note?.title === "ZZ Not" && /bakım öncesi metin/.test(note?.html ?? ""), "bakımdaki kaydetme denemesi YAZILMAMIŞ; not bakım öncesi hâlinde");
  ok(JSON.stringify(await fingerprint(A)) === JSON.stringify(before), "bakım sonrası satırlar bakım öncesiyle BİREBİR");
  await ctx.close();
} catch (e) {
  fail++;
  console.log(`  ✗ BEKLENMEYEN: ${(e as Error).stack ?? e}`);
} finally {
  await browser.close().catch(() => {});
  stopServer(server);
  await db.end().catch(() => {});
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
