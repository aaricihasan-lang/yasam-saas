/**
 * WT6 — Kupa & Hacamat GERÇEK route + GERÇEK Postgres entegrasyon harness'ı (prod'a SIFIR temas; ZZ_*).
 *
 * A) Takvim kanonik yıl planı (reuse_year): aynı yıl → AYNI plan (duplicate yok); tenant izolasyonu
 * B) Gün sınırları: Şubat 28/29 (2026 / 2028 artık yıl), 30/31 günlük ay, Aralık→Ocak, tarih metni
 *    kaymasız ('YYYY-MM-DD'), tekrar ekleme idempotent (upsert ignore-duplicates)
 * C) Mevcut aya yeniden giriş: kayıtlı gün + renk + kısa açıklama + not aynen döner; ekle/güncelle/kaldır
 * D) Protokol etiketleri text[] olarak saklanır (virgüllü giriş → dizi), PATCH kalıcı
 * E) Kaynaklar: tenant izolasyonu + "kendi kaynağı" süzgeci (aktarılmış kaynak öneride yok)
 * Çalıştır: npx tsx scripts/wt6/kupa-routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, startKupaTestEnv, seedKupa, type KupaUser } from "./kupaTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import { ownSourceSuggestions } from "../../lib/cupping/ownSources";
import { parseTagsInput } from "../../lib/cupping/protocolTags";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const H = harness("wt6/kupa-routes");
type Json = Record<string, unknown>;
function req(url: string, method: string, u: KupaUser, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function j(res: Response): Promise<Json> { try { return (await res.json()) as Json; } catch { return {}; } }

(async () => {
  const env = await startKupaTestEnv({ port: 54492, dirName: "wt6-kupa-routes-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const seed = await seedKupa(env.su);
  const { A, B } = seed;
  const su = env.su;
  try {
    const plans = await import("../../app/api/kupa/calendar/plans/route");
    const planOne = await import("../../app/api/kupa/calendar/plans/[id]/route");
    const planDays = await import("../../app/api/kupa/calendar/plans/[id]/days/route");
    const dayOne = await import("../../app/api/kupa/calendar/days/[id]/route");
    const protocols = await import("../../app/api/kupa/protocols/route");
    const protocolOne = await import("../../app/api/kupa/protocols/[id]/route");
    const sources = await import("../../app/api/kupa/sources/route");
    const protoSources = await import("../../app/api/kupa/protocol-sources/route");

    // ── A) kanonik yıl planı ────────────────────────────────────────────────
    let r = await plans.POST(req("/api/kupa/calendar/plans", "POST", A, { name: "2026 Hacamat Takvimi", year: 2026, reuse_year: true }));
    let jb = await j(r);
    const p2026 = (jb.plan as Json)?.id as string;
    H.ok(r.status === 200 && p2026 && jb.reused !== true, "A: 2026 için plan yok → oluşturuldu");
    r = await plans.POST(req("/api/kupa/calendar/plans", "POST", A, { name: "2026 Hacamat Takvimi", year: 2026, reuse_year: true }));
    jb = await j(r);
    H.ok(r.status === 200 && (jb.plan as Json)?.id === p2026 && jb.reused === true, "A: aynı yıl tekrar (Yeni Takvim → 2026) → AYNI plan, reused=true");
    H.ok((await su.query(`select count(*)::int n from cupping_calendar_plans where tenant_id=$1 and year=2026`, [A.tenant])).rows[0].n === 1, "A: 2026 için TEK plan (duplicate yok)");
    r = await plans.POST(req("/api/kupa/calendar/plans", "POST", B, { name: "2026 Hacamat Takvimi", year: 2026, reuse_year: true }));
    jb = await j(r);
    const b2026 = (jb.plan as Json)?.id as string;
    H.ok(r.status === 200 && b2026 && b2026 !== p2026 && jb.reused !== true, "B: kendi 2026 planı (A'nın planı yeniden kullanılmaz)");
    const listA = await j(await plans.GET(req("/api/kupa/calendar/plans", "GET", A)));
    H.ok(((listA.plans as Json[]) ?? []).every((p) => p.id !== b2026), "A'nın plan listesinde B'nin planı YOK");
    r = await plans.POST(req("/api/kupa/calendar/plans", "POST", A, { name: "x", year: 2026, reuse_year: "true" }));
    jb = await j(r);
    H.ok(r.status === 200 && (jb.plan as Json)?.id !== p2026, "reuse_year yalnız boolean true (geri uyum: bayraksız/yanlış tip → mevcut davranış)");
    await su.query(`delete from cupping_calendar_plans where id=$1`, [(jb.plan as Json)?.id]);
    r = await planOne.GET(req(`/api/kupa/calendar/plans/${b2026}`, "GET", A), ctx(b2026));
    H.ok(r.status === 404, "A, B'nin planını okuyamaz (404)");

    // ── B) gün sınırları ────────────────────────────────────────────────────
    const add = async (planId: string, days: Json[], u = A) => {
      const res = await planDays.POST(req(`/api/kupa/calendar/plans/${planId}/days`, "POST", u, { days }), ctx(planId));
      return { status: res.status, json: await j(res) };
    };
    const style = { color_key: "blue" };
    let a = await add(p2026, [{ date: "2026-02-28", ...style, user_label: "Şubat sonu", note: "ZZ not 1" }, { date: "2026-02-01", ...style }]);
    H.ok(a.status === 200 && a.json.inserted === 2, "Şubat 2026: 1 ve 28 kaydedildi");
    a = await add(p2026, [{ date: "2026-02-29", ...style }]);
    H.ok(a.status === 400, "2026-02-29 (artık yıl değil) → 400");
    a = await add(p2026, [{ date: "2026-04-30", ...style }, { date: "2026-05-31", ...style }, { date: "2026-12-31", ...style }]);
    H.ok(a.status === 200 && a.json.inserted === 3, "30 günlük Nisan sonu + 31 günlük Mayıs sonu + 31 Aralık kaydedildi");
    a = await add(p2026, [{ date: "2026-04-31", ...style }]);
    H.ok(a.status === 400, "2026-04-31 → 400");
    a = await add(p2026, [{ date: "2027-01-01", ...style }]);
    H.ok(a.status === 400, "Aralık→Ocak sınırı: 2027-01-01 2026 planına eklenmez (400)");
    a = await add(p2026, [{ date: "2026-02-28", color_key: "red" }]);
    H.ok(a.status === 200 && a.json.inserted === 0 && a.json.skippedExisting === 1, "aynı gün tekrar ekleme → duplicate YOK (idempotent)");
    const rows = (await su.query(`select gregorian_date::text d, color_key, user_label, note from cupping_calendar_plan_days where plan_id=$1 order by 1`, [p2026])).rows;
    H.ok(JSON.stringify(rows.map((x) => x.d)) === JSON.stringify(["2026-02-01", "2026-02-28", "2026-04-30", "2026-05-31", "2026-12-31"]), `DB tarih metinleri kaymasız (${rows.map((x) => x.d).join(",")})`);
    H.ok(rows.find((x) => x.d === "2026-02-28")?.color_key === "blue", "tekrar ekleme mevcut günün rengini EZMEDİ");
    r = await plans.POST(req("/api/kupa/calendar/plans", "POST", A, { name: "2028 Hacamat Takvimi", year: 2028, reuse_year: true }));
    const p2028 = ((await j(r)).plan as Json)?.id as string;
    a = await add(p2028, [{ date: "2028-02-29", ...style, user_label: "Artık gün" }]);
    H.ok(a.status === 200 && a.json.inserted === 1, "2028 (artık yıl): 29 Şubat kaydedildi");

    // ── C) mevcut aya yeniden giriş ─────────────────────────────────────────
    let g = await j(await planOne.GET(req(`/api/kupa/calendar/plans/${p2026}`, "GET", A), ctx(p2026)));
    let days = (g.days as Json[]) ?? [];
    const feb28 = days.find((d) => d.gregorian_date === "2026-02-28");
    H.ok(Boolean(feb28) && feb28!.user_label === "Şubat sonu" && feb28!.note === "ZZ not 1" && feb28!.color_key === "blue", "yeniden açılan ay: işaret + renk + kısa açıklama + not aynen geliyor");
    r = await dayOne.PATCH(req(`/api/kupa/calendar/days/${feb28!.id}`, "PATCH", A, { note: "ZZ not güncel", color_key: "green" }), ctx(String(feb28!.id)));
    H.ok(r.status === 200, "mevcut gün güncellendi (PATCH)");
    const feb1 = days.find((d) => d.gregorian_date === "2026-02-01");
    r = await dayOne.DELETE(req(`/api/kupa/calendar/days/${feb1!.id}`, "DELETE", A), ctx(String(feb1!.id)));
    H.ok(r.status === 200, "işaret kaldırıldı (DELETE)");
    a = await add(p2026, [{ date: "2026-02-14", color_key: "pink", user_label: "Yeni gün" }]);
    H.ok(a.status === 200 && a.json.inserted === 1, "yeni gün eklendi");
    g = await j(await planOne.GET(req(`/api/kupa/calendar/plans/${p2026}`, "GET", A), ctx(p2026)));
    days = (g.days as Json[]) ?? [];
    const feb = days.filter((d) => String(d.gregorian_date).startsWith("2026-02-")).map((d) => `${d.gregorian_date}:${d.color_key}:${d.note ?? ""}`);
    H.ok(JSON.stringify(feb) === JSON.stringify(["2026-02-14:pink:", "2026-02-28:green:ZZ not güncel"]), `ekle/güncelle/kaldır sonrası Şubat doğru (${feb.join(" | ")})`);
    H.ok((await su.query(`select count(*)::int n from cupping_calendar_plans where tenant_id=$1`, [A.tenant])).rows[0].n === 2, "A'da yıl başına tek plan (2026 + 2028)");
    r = await dayOne.PATCH(req(`/api/kupa/calendar/days/${feb28!.id}`, "PATCH", B, { note: "B saldırı" }), ctx(String(feb28!.id)));
    H.ok(r.status === 404 || r.status === 403, `B, A'nın gününü değiştiremez (${r.status})`);

    // ── D) protokol etiketleri ──────────────────────────────────────────────
    const tags = parseTagsInput("baş ağrısı, migren,, kupa , ense, Migren");
    H.ok(JSON.stringify(tags) === JSON.stringify(["baş ağrısı", "migren", "kupa", "ense"]), "virgüllü giriş → temiz dizi (boş/tekrar atılır)");
    r = await protocols.POST(req("/api/kupa/protocols", "POST", A, { title: "ZZ_WT6 Migren", tags }));
    const protJ = await j(r);
    if (r.status !== 200) console.log("PROTO", r.status, JSON.stringify(protJ));
    const prot = protJ.protocol as Json;
    H.ok(r.status === 200 && prot?.id, "protokol oluşturuldu");
    let dbTags = (await su.query(`select tags from cupping_protocols where id=$1`, [prot.id])).rows[0].tags;
    H.ok(JSON.stringify(dbTags) === JSON.stringify(tags), "etiketler text[] olarak aynen saklandı");
    r = await protocolOne.PATCH(req(`/api/kupa/protocols/${prot.id}`, "PATCH", A, { tags: ["ense", "boyun"] }), ctx(String(prot.id)));
    dbTags = (await su.query(`select tags from cupping_protocols where id=$1`, [prot.id])).rows[0].tags;
    H.ok(r.status === 200 && JSON.stringify(dbTags) === JSON.stringify(["ense", "boyun"]), "PATCH ile etiket değişikliği kalıcı");

    // ── E) kaynaklar: tenant izolasyonu + kendi-kaynak süzgeci ──────────────
    r = await sources.POST(req("/api/kupa/sources", "POST", A, { source_name: "Ahmet Hoca Eğitim Notu" }));
    const srcA = ((await j(r)).source as Json) ?? ((await j(r)).row as Json);
    H.ok(r.status === 200, "A: serbest kaynak oluşturuldu");
    await su.query(`insert into cupping_sources(tenant_id, source_name, origin_source_id, transferred_at) values ($1,'Sistem Sahibi Kataloğu',$2, now())`, [A.tenant, randomUUID()]);
    r = await sources.POST(req("/api/kupa/sources", "POST", B, { source_name: "B Gizli Kaynak" }));
    H.ok(r.status === 200, "B: kendi kaynağı oluşturuldu");
    const listSrcA = (await j(await sources.GET(req("/api/kupa/sources", "GET", A)))) as Json;
    const srcRows = ((listSrcA.sources ?? listSrcA.rows) as Json[]) ?? [];
    H.ok(srcRows.length >= 2 && !srcRows.some((s) => s.source_name === "B Gizli Kaynak"), "A'nın kaynak listesinde B'nin kaynağı YOK (tenant izolasyonu)");
    const sugg = ownSourceSuggestions(srcRows as never, "");
    H.ok(sugg.includes("Ahmet Hoca Eğitim Notu") && !sugg.includes("Sistem Sahibi Kataloğu") && !sugg.includes("B Gizli Kaynak"), `öneri yalnız A'nın KENDİ kaynakları (${sugg.join(" | ")})`);
    H.ok(ownSourceSuggestions(srcRows as never, "ahmet").join() === "Ahmet Hoca Eğitim Notu", "yazdıkça süzer (Türkçe katlamalı)");
    const sid = (srcRows.find((s) => s.source_name === "Ahmet Hoca Eğitim Notu")?.id ?? srcA?.id) as string;
    r = await protoSources.POST(req("/api/kupa/protocol-sources", "POST", A, { protocol_id: prot.id, source_id: sid, locator: "s. 12" }));
    H.ok(r.status === 200 && (await su.query(`select count(*)::int n from cupping_protocol_sources where protocol_id=$1`, [prot.id])).rows[0].n === 1, "protokol kaynağı bağlandı (kalıcı)");
    const bSrc = (await su.query(`select id from cupping_sources where tenant_id=$1 limit 1`, [B.tenant])).rows[0].id;
    r = await protoSources.POST(req("/api/kupa/protocol-sources", "POST", A, { protocol_id: prot.id, source_id: bSrc }));
    H.ok(r.status >= 400, `A, B'nin kaynağını protokolüne bağlayamaz (${r.status})`);
  } catch (e) {
    H.ok(false, `beklenmeyen hata: ${String(e).slice(0, 400)}`);
  } finally {
    await env.stop();
  }
  H.done();
})();
