/**
 * TAS-03 / TAS-05b — Doğaltaş güvenlik uyarısı bilgi kaydına dönüşünce KAYBOLMAZ.
 * GERÇEK route + GERÇEK Postgres (embedded, 127.0.0.1; PROD'A SIFIR TEMAS; ZZ_* sentetik veri).
 *
 * P) migration ÖNCESİ (stone_entries yok): eski stones.warning_text uyarısı döner (çökme yok)
 * 1) eski birincil uyarı → danışan taş uyarısı (stone-warnings) döner
 * 2) eski uyarı DÜZENLENİNCE (atomik dönüşüm, stones.warning_text = NULL) → uyarı HÂLÂ döner (asıl hata)
 * 3) yeni "Uyarılar" bilgi kaydı → döner; düzenleme yeni metni döndürür; silme yalnız o kaydı kaldırır
 * 4) eski ek kaynak (stone_sources.warning_text) uyarısı → döner
 * 5) birden çok parça → gösterim sırasıyla birleşir, tekrar eden metin bir kez
 * 6) TAS-05b: aynı adlı iki taş (ilki uyarısız) → uyarılı olan bulunur
 * 7) tenant izolasyonu: başka uzmanın aynı adlı taşının uyarısı / kaydı SIZMAZ
 * 8) condition-search: "yalnız uyarılı" filtresi dönüştürülmüş taşı bulur; satırda search_warning_text,
 *    birincil warning_text DEĞİŞMEZ (düzenleme ekranı verisi bozulmaz)
 * 9) veri değişmez: route'lar salt-okur (stones / stone_entries / stone_sources hash'i birebir)
 * 10) yetki: oturumsuz istek 401
 * Çalıştır: npx tsx scripts/tas03-stone-warnings/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, seedStone, seedStonesUser, startWt9TestEnv, type Wt9User } from "../wt9/wt9TestEnv";
import { readMig } from "../bioenergy-presale-final/bioTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import { mergeWarningTexts, effectiveWarningText } from "../../lib/dogaltas/stoneWarningSources";
import { LEGACY_PRIMARY_ORDER } from "../../lib/dogaltas/stoneEntries";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("tas03-stone-warnings/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 600)), done: () => H0.done() };
type Json = Record<string, unknown>;
type Warn = { stoneId: string; stoneName: string; warningText: string | null; warningTags: string[] | null };
const req = (url: string, method: string, u: Wt9User | null, body?: unknown) => new NextRequest(`http://localhost${url}`, {
  method,
  headers: { "content-type": "application/json", ...(u ? { "x-user-id": u.id, "x-session-token": u.token } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const ectx = (id: string, entryId: string) => ({ params: Promise.resolve({ id, entryId: encodeURIComponent(entryId) }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function j(res: Response): Promise<Json> { try { return (await res.json()) as Json; } catch { return {}; } }
const MIG = "20271016000000_dogaltas_stone_entries.sql";
const W_OLD = "ZZ ESKİ UYARI: hamilelikte kullanılmaz.";
const W_SRC = "ZZ EK KAYNAK UYARISI: güneşte bırakmayın.";

(async () => {
  // ── saf birleştirme (DB yok) ──
  H.ok(mergeWarningTexts([]) === null, "U: boş → null");
  H.ok(mergeWarningTexts([{ order: 5, text: "B" }, { order: -1000, text: "A" }, { order: 5, text: "  " }]) === "A\n\nB", "U: sıra + boş parça atlanır");
  H.ok(mergeWarningTexts([{ order: 0, text: "Aynı  metin" }, { order: 1, text: "Aynı metin" }]) === "Aynı  metin", "U: boşluk farkıyla tekrar eden metin bir kez");
  H.ok(effectiveWarningText("  ", undefined) === null && effectiveWarningText(null, [{ order: 0, text: "X" }]) === "X", "U: birincil boş + ek parça");
  H.ok(effectiveWarningText("P", [{ order: LEGACY_PRIMARY_ORDER + 1, text: "S" }, { order: LEGACY_PRIMARY_ORDER - 1, text: "önce" }]) === "önce\n\nP\n\nS", "U: birincil LEGACY_PRIMARY_ORDER sırasında yer alır");

  const env = await startWt9TestEnv({ port: 54631, dirName: "tas03-stone-warnings-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    const T = await seedStonesUser(su, "T3T");
    const X = await seedStonesUser(su, "T3X");
    const warnR = await import("../../app/api/dogaltas/stone-warnings/route");
    const condR = await import("../../app/api/dogaltas/stones/condition-search/route");
    const entR = await import("../../app/api/dogaltas/stones/[id]/entries/route");
    const oneR = await import("../../app/api/dogaltas/stones/[id]/entries/[entryId]/route");
    const warn = async (u: Wt9User | null, names: string[]) => {
      const r = await warnR.POST(req("/api/dogaltas/stone-warnings", "POST", u, { stoneNames: names }));
      const b = await j(r);
      return { status: r.status, list: (b.warnings ?? []) as Warn[] };
    };
    const byName = (list: Warn[], name: string) => list.find((w) => w.stoneName === name);

    const old = await seedStone(su, T.tenant, { stone_name: "ZZ Kehribar", warning_text: W_OLD, warning_tags: ["Hamilelik"], images: [] });
    const plain1 = await seedStone(su, T.tenant, { stone_name: "ZZ Çift Taş", general_info: "uyarısız kopya", images: [] });
    const dup2 = await seedStone(su, T.tenant, { stone_name: "ZZ Çift Taş", general_info: "ikinci kopya", images: [] });
    const srcStone = await seedStone(su, T.tenant, { stone_name: "ZZ Kaynaklı", general_info: "x", images: [] });
    const fresh = await seedStone(su, T.tenant, { stone_name: "ZZ Yeni Kayıtlı", general_info: "x", images: [] });
    await seedStone(su, X.tenant, { stone_name: "ZZ Kehribar", warning_text: "X TENANT SIZMAMALI", images: [] });
    const xOnly = await seedStone(su, X.tenant, { stone_name: "ZZ Yalnız X", warning_text: "X GİZLİ", images: [] });
    await su.query(`insert into stone_sources(tenant_id, stone_id, source_name, sort_order, warning_text) values ($1,$2,'Ek Kitap',1,$3)`, [T.tenant, srcStone, W_SRC]);

    // ── P) migration ÖNCESİ ──
    let w = await warn(T, ["ZZ Kehribar", "ZZ Kaynaklı"]);
    H.ok(w.status === 200 && byName(w.list, "ZZ Kehribar")?.warningText === W_OLD, "P: migration öncesi eski uyarı döner (stone_entries yok → çökme yok)", w);
    H.ok(byName(w.list, "ZZ Kaynaklı")?.warningText === W_SRC, "P: migration öncesi ek kaynak uyarısı döner", w);

    await su.query(readMig(MIG));
    await su.query(`grant select, insert, update, delete on all tables in schema public to service_role; grant execute on all functions in schema public to service_role;`);

    // ── 1) eski birincil uyarı ──
    w = await warn(T, ["zz kehribar"]);
    const k1 = byName(w.list, "ZZ Kehribar");
    H.ok(w.status === 200 && k1?.warningText === W_OLD && k1.stoneId === old && JSON.stringify(k1.warningTags) === JSON.stringify(["Hamilelik"]), "1: eski birincil uyarı + etiket döner (küçük harf girişle)", w);

    // ── 2) eski uyarı düzenlenince dönüşüm → uyarı KAYBOLMAZ ──
    const legacyId = `legacy:primary:warning_text`;
    const edited = W_OLD + "\nDüzenlendi.";
    let r = await oneR.PATCH(req(`/api/dogaltas/stones/${old}/entries/${legacyId}`, "PATCH", T, { expected: W_OLD, content: edited, source_name: "Uzman Notu" }), ectx(old, legacyId));
    const conv = (await j(r)).entry as Json | undefined;
    const col = (await su.query(`select warning_text from stones where id=$1`, [old])).rows[0].warning_text;
    H.ok(r.status === 200 && col === null && conv?.content === edited, "2a: dönüşüm gerçekleşti → stones.warning_text = NULL (hatanın tetikleyicisi)", { status: r.status, col });
    w = await warn(T, ["ZZ Kehribar"]);
    H.ok(byName(w.list, "ZZ Kehribar")?.warningText === edited, "2b: dönüşümden SONRA uyarı hâlâ gösterilir (TAS-03)", w);

    // ── 3) yeni Uyarılar kaydı: ekle / düzenle / sil ──
    r = await entR.POST(req(`/api/dogaltas/stones/${fresh}/entries`, "POST", T, { field_key: "warning_text", content: "ZZ YENİ UYARI A", source_name: "Kitap A" }), ctx(fresh));
    const eA = (await j(r)).entry as Json;
    r = await entR.POST(req(`/api/dogaltas/stones/${fresh}/entries`, "POST", T, { field_key: "warning_text", content: "ZZ YENİ UYARI B", source_name: "Kitap B" }), ctx(fresh));
    const eB = (await j(r)).entry as Json;
    w = await warn(T, ["ZZ Yeni Kayıtlı"]);
    H.ok(byName(w.list, "ZZ Yeni Kayıtlı")?.warningText === "ZZ YENİ UYARI A\n\nZZ YENİ UYARI B", "3a: yeni bilgi kaydı uyarıları kayıt sırasıyla döner", w);
    r = await oneR.PATCH(req(`/api/dogaltas/stones/${fresh}/entries/${eA.id}`, "PATCH", T, { content: "ZZ YENİ UYARI A (güncel)" }), ectx(fresh, String(eA.id)));
    w = await warn(T, ["ZZ Yeni Kayıtlı"]);
    H.ok(r.status === 200 && byName(w.list, "ZZ Yeni Kayıtlı")?.warningText === "ZZ YENİ UYARI A (güncel)\n\nZZ YENİ UYARI B", "3b: düzenleme yeni metni döndürür, diğer kayıt korunur", w);
    r = await oneR.DELETE(req(`/api/dogaltas/stones/${fresh}/entries/${eB.id}`, "DELETE", T, {}), ectx(fresh, String(eB.id)));
    w = await warn(T, ["ZZ Yeni Kayıtlı"]);
    H.ok(r.status === 200 && byName(w.list, "ZZ Yeni Kayıtlı")?.warningText === "ZZ YENİ UYARI A (güncel)", "3c: silme yalnız o kaydı kaldırır", w);
    // Başka alandaki kayıt uyarı sayılmaz.
    await entR.POST(req(`/api/dogaltas/stones/${dup2}/entries`, "POST", T, { field_key: "care", content: "ZZ BAKIM NOTU", source_name: "Kitap" }), ctx(dup2));

    // ── 4) eski ek kaynak + 5) birleşim / tekrar ──
    await su.query(`update stones set warning_text=$2 where id=$1`, [srcStone, "ZZ BİRİNCİL"]);
    await su.query(`insert into stone_entries(tenant_id, stone_id, field_key, content, source_name, sort_order) values ($1,$2,'warning_text',$3,'Kitap',0), ($1,$2,'warning_text','ZZ BİRİNCİL','Kitap',1)`, [T.tenant, srcStone, "ZZ KAYIT UYARISI"]);
    w = await warn(T, ["ZZ Kaynaklı"]);
    H.ok(byName(w.list, "ZZ Kaynaklı")?.warningText === `ZZ BİRİNCİL\n\n${W_SRC}\n\nZZ KAYIT UYARISI`, "4/5: birincil → ek kaynak → kayıt sırası; tekrar eden metin bir kez", w);

    // ── 6) TAS-05b aynı adlı iki taş ──
    w = await warn(T, ["ZZ Çift Taş"]);
    H.ok(w.list.length === 0, "6a: aynı adlı iki taş da uyarısız → uyarı yok (başka alandaki kayıt uyarı sayılmaz)", w);
    await entR.POST(req(`/api/dogaltas/stones/${dup2}/entries`, "POST", T, { field_key: "warning_text", content: "ZZ İKİNCİ KOPYA UYARISI", source_name: "Kitap" }), ctx(dup2));
    w = await warn(T, ["ZZ Çift Taş"]);
    const d = byName(w.list, "ZZ Çift Taş");
    H.ok(w.list.length === 1 && d?.warningText === "ZZ İKİNCİ KOPYA UYARISI" && d.stoneId === dup2 && d.stoneId !== plain1, "6b: ilk eşleşme uyarısız olsa da uyarılı kopya bulunur, bağlantı uyarılı taşa (TAS-05b)", w);
    w = await warn(T, ["ZZ Çift Taş", "zz çift taş"]);
    H.ok(w.list.length === 1, "6c: aynı ad iki kez girilince tek kart", w);

    // ── 7) tenant izolasyonu ──
    w = await warn(T, ["ZZ Kehribar", "ZZ Yalnız X"]);
    H.ok(!JSON.stringify(w.list).includes("X TENANT") && !JSON.stringify(w.list).includes("X GİZLİ") && !byName(w.list, "ZZ Yalnız X"), "7a: başka uzmanın aynı adlı / yalnız onda olan taşının uyarısı sızmaz", w);
    await su.query(`insert into stone_entries(tenant_id, stone_id, field_key, content, source_name, sort_order) values ($1,$2,'warning_text','X KAYIT SIZMAMALI','Kitap',0)`, [X.tenant, xOnly]);
    w = await warn(X, ["ZZ Kehribar", "ZZ Yalnız X"]);
    H.ok(byName(w.list, "ZZ Kehribar")?.warningText === "X TENANT SIZMAMALI" && byName(w.list, "ZZ Yalnız X")?.warningText === "X GİZLİ\n\nX KAYIT SIZMAMALI" && !JSON.stringify(w.list).includes("ZZ ESKİ UYARI"), "7b: X yalnız kendi uyarılarını görür", w);
    w = await warn(T, ["ZZ Yalnız X"]);
    H.ok(w.list.length === 0, "7c: T, X'in kayıt uyarısını göremez", w);

    // ── 8) condition-search ──
    const hashBefore = (await su.query(`select md5(string_agg(row_to_json(s)::text, '|' order by id)) h from stones s`)).rows[0].h
      + (await su.query(`select md5(coalesce(string_agg(row_to_json(e)::text, '|' order by id), '')) h from stone_entries e`)).rows[0].h
      + (await su.query(`select md5(coalesce(string_agg(row_to_json(e)::text, '|' order by id), '')) h from stone_sources e`)).rows[0].h;
    r = await condR.POST(req("/api/dogaltas/stones/condition-search", "POST", T, { warningOnly: true }));
    let cb = await j(r);
    const crow = ((cb.rows ?? []) as Json[]);
    const ids = crow.map((x) => x.id);
    const kRow = crow.find((x) => x.id === old);
    H.ok(r.status === 200 && ids.includes(old) && ids.includes(fresh) && ids.includes(srcStone) && ids.includes(dup2) && !ids.includes(plain1), "8a: yalnız uyarılı filtresi dönüştürülmüş / kayıtlı uyarılı taşları bulur, uyarısızı dışlar", ids);
    H.ok(kRow?.search_warning_text === edited && kRow?.warning_text === null, "8b: satırda search_warning_text = etkin uyarı; birincil warning_text DEĞİŞMEDİ (null)", kRow);
    r = await condR.POST(req("/api/dogaltas/stones/condition-search", "POST", T, { q: "ZZ Kehribar", searchMode: "name" }));
    cb = await j(r);
    const kRow2 = ((cb.rows ?? []) as Json[]).find((x) => x.id === old);
    H.ok(r.status === 200 && kRow2?.search_warning_text === edited, "8c: uyarı filtresi olmadan da sonuç satırı etkin uyarıyı taşır (kombinasyon sepeti)", kRow2);
    r = await condR.POST(req("/api/dogaltas/stones/condition-search", "POST", X, { warningOnly: true }));
    cb = await j(r);
    H.ok(r.status === 200 && !((cb.rows ?? []) as Json[]).some((x) => x.id === old || x.id === fresh), "8d: condition-search tenant izolasyonu", cb.rows);

    // ── 9) salt-okuma ──
    await warn(T, ["ZZ Kehribar", "ZZ Kaynaklı", "ZZ Çift Taş"]);
    const hashAfter = (await su.query(`select md5(string_agg(row_to_json(s)::text, '|' order by id)) h from stones s`)).rows[0].h
      + (await su.query(`select md5(coalesce(string_agg(row_to_json(e)::text, '|' order by id), '')) h from stone_entries e`)).rows[0].h
      + (await su.query(`select md5(coalesce(string_agg(row_to_json(e)::text, '|' order by id), '')) h from stone_sources e`)).rows[0].h;
    H.ok(hashBefore === hashAfter, "9: uyarı / arama route'ları veri DEĞİŞTİRMEZ (stones + stone_entries + stone_sources hash birebir)");

    // ── 10) yetki ──
    w = await warn(null, ["ZZ Kehribar"]);
    H.ok(w.status === 401 && w.list.length === 0, "10: oturumsuz istek 401", w.status);
    w = await warn({ ...T, token: "zz-yanlis-token" }, ["ZZ Kehribar"]);
    H.ok(w.status === 401 && w.list.length === 0, "10b: yanlış oturum token'ı 401", w.status);
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();
