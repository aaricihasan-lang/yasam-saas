/**
 * 9. aşama — UYGULAMA yedek motoru (lib/backup) GERÇEK test projesinde (gerçek PostgREST + daraltılmış service_role).
 * Var olan sentetik bir uzmanın KİŞİSEL V2 kayıtları dışa aktarılır → aynı dosya geri yüklenir: hepsi already_present
 * (çoğalma/üzerine yazma yok) · kurum/başka uzman yok · sahte kurum ve başka uzman adına geri yükleme yazamaz.
 * Mevcut veriyi DEĞİŞTİRMEZ (yalnız eksik satır ekleyebilen motor; testte eklenen 0 olmalı) — öncesi/sonrası özet karşılaştırılır.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/backup-app.real.mts
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getRegistryEntry, topologicalOrder } from "@/lib/backup/registry";
import { exportTableAll, restoreChunk } from "@/lib/backup/engine";
import { sortSelfReferencing } from "@/lib/backup/format";
import { connectTestDb, installNetworkFence, loadTestTarget, redact } from "./guard";

const T = loadTestTarget();
installNetworkFence(T);
const V2 = ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_topic_links", "sifa_block_assets"];
let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const su = await connectTestDb();
const db = createClient(T.url, T.secretKey, { auth: { persistSession: false } });
const digestAll = async () => {
  await su.query("SET TimeZone = 'UTC'");
  const p: string[] = [];
  for (const t of [...V2, "sifa_legacy_import_map"]) {
    const r = await su.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.${t} x`);
    p.push(`${t}:${r.rows[0].n}:${r.rows[0].h}`);
  }
  return p.join(" ");
};
try {
  const pick = (await su.query(`select t.tenant_id, t.owner_key, count(*)::int n from public.sifa_topics t
      where t.scope = 'kisisel' group by 1, 2 order by n desc limit 1`)).rows[0];
  const other = (await su.query(`select owner_key from public.sifa_topics where tenant_id = $1 and scope = 'kisisel' and owner_key <> $2 limit 1`, [pick.tenant_id, pick.owner_key])).rows[0];
  const TEN = String(pick.tenant_id);
  const UID = String(pick.owner_key);
  const before = await digestAll();
  const ctx = (over: Record<string, unknown> = {}) => ({ tenantId: TEN, userId: UID, role: "expert", modulePermissions: { sifa_rehberi: true }, membershipActive: true, ...over });
  console.log(`Seçilen sentetik uzman: ${pick.n} kişisel konu (aynı tenant'ta ikinci uzman: ${other ? "var" : "yok"})`);

  console.log("1) Dışa aktarım (gerçek PostgREST, service_role SELECT)");
  const backup: Record<string, Record<string, unknown>[]> = {};
  for (const t of V2) {
    const r = await exportTableAll(db as never, getRegistryEntry(t)!, TEN, { ownerUserId: UID, pageSize: 25 });
    backup[t] = r.rows;
    const dbN = (await su.query(`select count(*)::int n from public.${t} where tenant_id = $1 and owner_key = $2`, [TEN, UID])).rows[0].n;
    ok(r.complete && !r.error && r.rows.length === dbN, `${t}: ${r.rows.length}/${dbN} satır, complete`, { e: r.error });
  }
  const all = Object.values(backup).flat();
  ok(all.every((r) => r.owner_key === UID && r.tenant_id === TEN), "yalnız seçilen uzmanın kişisel satırları (kurum / diğer uzman yok)");

  console.log("2) Aynı dosyayı geri yükleme (gerçek INSERT … ON CONFLICT DO NOTHING)");
  const order = topologicalOrder().map((e) => e.table).filter((t) => V2.includes(t));
  let inserted = 0;
  let present = 0;
  const failures: unknown[] = [];
  for (const t of order) {
    const rows = t === "sifa_topics" ? sortSelfReferencing(backup[t], "id", "parent_id") : backup[t];
    for (let i = 0; i < rows.length; i += 100) {
      const rep = await restoreChunk(db as never, ctx() as never, t, rows.slice(i, i + 100));
      inserted += rep.inserted;
      present += rep.already_present;
      if (rep.failed?.length) failures.push([t, rep.failed, rep.warnings.slice(0, 2)]);
    }
  }
  ok(inserted === 0 && present === all.length && failures.length === 0, `hepsi already_present (${present}/${all.length}), eklenen 0, hata 0`, failures);

  console.log("3) Saldırgan dosya");
  const forged = { ...backup.sifa_topics[0], id: randomUUID(), parent_id: null, scope: "kurum", owner_key: TEN, title: "ZZ SAHTE KURUM" };
  const rk = await restoreChunk(db as never, ctx() as never, "sifa_topics", [forged]);
  ok(rk.inserted === 0 && Number((await su.query("select count(*)::int n from public.sifa_topics where id = $1", [forged.id])).rows[0].n) === 0, "sahte KURUM satırı yazılamadı (CHECK)", { failed: rk.failed });
  if (other) {
    let ins2 = 0;
    for (const t of order) ins2 += (await restoreChunk(db as never, ctx({ userId: String(other.owner_key) }) as never, t, t === "sifa_topics" ? sortSelfReferencing(backup[t], "id", "parent_id") : backup[t])).inserted;
    ok(ins2 === 0, "aynı dosya aynı tenant'taki BAŞKA uzman adına: 0 satır eklendi", ins2);
  }
  ok((await digestAll()) === before, "test projesindeki 6 V2 tablosu öncesi = sonrası (hiçbir veri değişmedi)");
} catch (e) {
  fail++;
  console.log(`  ✗ ${redact(String((e as Error)?.stack ?? e)).slice(0, 600)}`);
} finally {
  await su.end();
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
