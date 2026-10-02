/**
 * ANAMNEZ V1 — ROUTE ENTEGRASYON + IDOR HARNESS
 * (gerçek Next route handler'ları + gerçek migration'lı yerel PostgreSQL + Storage emülatörü).
 *
 * Production'a SIFIR temas (127.0.0.1). Tüm veriler sentetik (ZZ_ANAMNEZ_*).
 * Çalıştır: npx tsx scripts/anamnez/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, seedAnamnez, startAnamnezTestEnv, type Seed, type TestEnv } from "./testEnv";

// "server-only" yalnız bu süreçte boş modüle yönlendirilir (Next dışı çalıştırma).
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type Auth = { id?: string; token?: string };
type Json = Record<string, unknown>;
type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");

async function main(): Promise<void> {
  const env: TestEnv = await startAnamnezTestEnv({ port: 54391, dirName: "anamnez-routes-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const seed: Seed = await seedAnamnez(env.su);
  console.log(`embedded-postgres + PostgREST shim + Storage emülatörü hazır (${env.url}).`);

  try {
    const listRoute = await import("../../app/api/clients/[id]/anamnez/route");
    const oneRoute = await import("../../app/api/clients/[id]/anamnez/[anamnesisId]/route");
    const completeRoute = await import("../../app/api/clients/[id]/anamnez/[anamnesisId]/complete/route");
    const prepareRoute = await import("../../app/api/clients/[id]/anamnez/[anamnesisId]/attachments/prepare/route");
    const finalizeRoute = await import("../../app/api/clients/[id]/anamnez/[anamnesisId]/attachments/finalize/route");
    const cleanupRoute = await import("../../app/api/clients/[id]/anamnez/[anamnesisId]/attachments/cleanup/route");
    const attRoute = await import("../../app/api/clients/[id]/anamnez/[anamnesisId]/attachments/[attachmentId]/route");
    const blankRoute = await import("../../app/api/clients/[id]/anamnez/blank-form/route");
    const filledRoute = await import("../../app/api/clients/[id]/anamnez/[anamnesisId]/pdf/route");
    const cascadeRoute = await import("../../app/api/clients/[id]/cascade-delete/route");
    const previewRoute = await import("../../app/api/clients/[id]/delete-preview/route");
    const { __resetRateLimitForTest } = await import("../../lib/security/rateLimit");
    const { sectionSourceStates, planSectionImport, applyImport, listSourceChanges } = await import("../../lib/danisan/anamnez/sources");
    const { effectiveSections } = await import("../../lib/danisan/anamnez/schema");
    const { ANAMNEZ_BUCKET } = await import("../../lib/danisan/anamnez/storage");

    const U = seed.users;
    const asA: Auth = { id: U.A.id, token: U.A.token };
    const asB: Auth = { id: U.B.id, token: U.B.token };

    async function call(
      handler: unknown, method: string, params: Record<string, string>, auth: Auth,
      body?: unknown, query = "",
    ): Promise<{ status: number; json: Json; res: Response }> {
      const headers: Record<string, string> = {};
      if (auth.id) headers["x-user-id"] = auth.id;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost/api/test${query}`, {
        method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
      const clone = res.clone();
      let json: Json = {};
      try { json = (await clone.json()) as Json; } catch { json = {}; }
      return { status: res.status, json, res };
    }
    const P = (clientId: string, anamnesisId?: string, attachmentId?: string) => ({
      id: clientId, ...(anamnesisId ? { anamnesisId } : {}), ...(attachmentId ? { attachmentId } : {}),
    });
    const row = async (id: string) => (await env.su.query(`select * from public.client_anamneses where id=$1`, [id])).rows[0];
    const objectsUnder = (prefix: string) => [...(env.storage.objects.get(ANAMNEZ_BUCKET)?.keys() ?? [])].filter((k) => k.startsWith(prefix));

    async function uploadPdf(clientId: string, anamnesisId: string, auth: Auth, bytes: Buffer = PDF_BYTES, contentType = "application/pdf") {
      const prep = await call(prepareRoute.POST, "POST", P(clientId, anamnesisId), auth, { fileName: "form.pdf", size: bytes.length, contentType: "application/pdf" });
      if (prep.status !== 200) return { prep, put: null, fin: null };
      const put = await fetch(`${env.url}/storage/v1/object/upload/sign/${ANAMNEZ_BUCKET}/${prep.json.path}?token=${prep.json.token}`, {
        method: "PUT", headers: { "content-type": contentType }, body: new Uint8Array(bytes),
      });
      const fin = await call(finalizeRoute.POST, "POST", P(clientId, anamnesisId), auth, { path: prep.json.path, originalName: "Doldurulmuş form.pdf" });
      return { prep, put, fin };
    }

    // ── 1. KİMLİK / YETKİ ────────────────────────────────────────────────────
    section("1. Kimlik / yetki (requireModuleAccess)");
    ok((await call(listRoute.GET, "GET", P(seed.clients.a1), {})).status === 401, "header yok → 401");
    ok((await call(listRoute.GET, "GET", P(seed.clients.a1), { id: U.A.id, token: U.B.token })).status === 403, "token/user uyuşmazlığı → 403");
    ok((await call(listRoute.GET, "GET", P(seed.clients.a1), { id: U.PENDING.id, token: U.PENDING.token })).status === 403, "pending kullanıcı → 403");
    ok((await call(listRoute.GET, "GET", P(seed.clients.a1), { id: U.REJECTED.id, token: U.REJECTED.token })).status === 403, "rejected kullanıcı → 403");
    ok((await call(listRoute.GET, "GET", P(seed.clients.a1), { id: U.INACTIVE.id, token: U.INACTIVE.token })).status === 403, "üyeliği premium olmayan → 403");
    ok((await call(listRoute.GET, "GET", P(seed.clients.a1), { id: U.NOMOD.id, token: U.NOMOD.token })).status === 403, "clients modülü kapalı → 403");
    ok((await call(listRoute.GET, "GET", P(seed.clients.a1), asA)).status === 200, "Uzman A kendi danışanı → 200");
    ok((await call(listRoute.GET, "GET", P(seed.clients.b1), asA)).status === 404, "Uzman A → Uzman B danışanı (liste) → 404");
    ok((await call(listRoute.POST, "POST", P(seed.clients.b1), asA, { mode: "standard", fromId: null, assessmentDate: "2026-09-28" })).status === 404, "Uzman A → B danışanına anamnez oluşturma → 404");
    ok((await call(listRoute.GET, "GET", P("not-a-uuid"), asA)).status === 404, "geçersiz danışan id → 404");

    // Demo
    const demo = { id: U.DEMO.id, token: U.DEMO.token };
    const dl = await call(listRoute.GET, "GET", P(seed.clients.a1), demo);
    ok(dl.status === 200 && dl.json.demo === true && Array.isArray(dl.json.anamneses) && (dl.json.anamneses as unknown[]).length === 0, "demo okuma → boş liste");
    const dp = await call(listRoute.POST, "POST", P(seed.clients.a1), demo, { mode: "standard", fromId: null, assessmentDate: "2026-09-28" });
    ok(dp.status === 403 && dp.json.code === "DEMO_READ_ONLY", "demo yazma → 403 DEMO_READ_ONLY");

    // ── 2. İLK ANAMNEZ + KAYDET ──────────────────────────────────────────────
    section("2. İlk anamnez (std-v1) + taslak kaydet");
    const c1 = await call(listRoute.POST, "POST", P(seed.clients.a1), asA, { mode: "standard", fromId: null, assessmentDate: "2026-09-28", title: null, requestId: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01" });
    ok(c1.status === 201, "ilk anamnez oluştur → 201", c1.json);
    const A1 = (c1.json.anamnesis as Json).id as string;
    const replay = await call(listRoute.POST, "POST", P(seed.clients.a1), asA, { mode: "standard", fromId: null, assessmentDate: "2026-09-28", title: null, requestId: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01" });
    ok(replay.status === 200 && (replay.json.anamnesis as Json).id === A1, "aynı requestId → aynı kayıt (idempotent)");
    const r1 = await row(A1);
    ok(r1.template_version === "std-v1" && r1.kind === "initial" && r1.status === "draft", "std-v1, initial, draft");
    ok(JSON.stringify(r1.form_custom) === "{}" || (Array.isArray(r1.form_custom.hidden) && r1.form_custom.hidden.length === 0), "form_custom boş (standart)");
    ok(r1.client_snapshot.ad === "ZZ Ayşe" && r1.client_snapshot.dogum === "1990-03-21", "client_snapshot (ad, doğum) dondu");
    const g1 = await call(oneRoute.GET, "GET", P(seed.clients.a1, A1), asA);
    ok(g1.status === 200, "GET tam kayıt → 200");
    const secs = effectiveSections("std-v1", { hidden: [], labels: {}, enabledSections: [], custom: [] });
    ok(secs.length === 17 && secs.map((s) => s.key).join("") === "ABCDEFGHIJKLMNOPQ", "17 bölüm A–Q render sırası");
    ok(g1.json.healthNote === "ZZ sağlık notu: referans metin", "saglik_notu salt-okunur referans döner");
    ok(!JSON.stringify(g1.json).includes("LEGACY-SAGLIK-A") && !JSON.stringify(g1.json).includes("legacy@a.test"), "legacy clients.saglik / email yanıtta YOK");
    ok(g1.json.explicitConsent === false, "açık rıza kaydı yok → explicitConsent=false (engel değil)");

    const answers = {
      "A.reason": "Uyku ve stres",
      "A.duration": "m1_6",
      "B.conditions": { v: true, d: "Beyan edilen durum" },
      "B.surgeries": [{ id: "r1", what: "Apandisit", year: "2010" }],
      "C.any": true,
      "E.conditions": ["diabetes", "thyroid"],
      "F.bedtime": "23:30",
      "F.quality": 6,
      "F.duration": 6.5,
      "L.last_period": "2026-09-01",
      "M.items": [{ id: "m1", region: "Bel", duration: "2 ay", intensity: 5, pattern: "intermittent" }],
    };
    const pa = await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, { baseRevision: 1, answers });
    ok(pa.status === 200 && pa.json.revision === 2, "tüm alan tipleriyle taslak kaydet → 200, revision 2", pa.json);
    const g2 = await call(oneRoute.GET, "GET", P(seed.clients.a1, A1), asA);
    const { stableStringify } = await import("../../lib/danisan/anamnez/schema");
    ok(stableStringify((g2.json.anamnesis as Json).answers) === stableStringify(answers), "tekrar aç → cevaplar birebir korunuyor");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, { baseRevision: 2, answers: { "Z.bad": "x" } })).status === 400, "bilinmeyen alan → 400");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, { baseRevision: 2, answers: { "F.quality": 11 } })).status === 400, "0–10 dışı değer → 400");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, { baseRevision: 2, answers: { "A.duration": "never" } })).status === 400, "geçersiz seçenek → 400");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, { baseRevision: 2, tenant_id: seed.TB, answers })).status === 400, "gövdede tenant_id → 400 (allowlist)");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, { baseRevision: 1, answers })).status === 409, "eski revision → 409 CONFLICT");

    // Özelleştirme: kaldır (cevaplı), soru ekle, başlık düzenle.
    const fc = {
      hidden: ["A.duration"],
      labels: { "A.reason": "Başvuru nedeni (danışanın kendi ifadesiyle)" },
      enabledSections: ["L"],
      custom: [{ key: "c_a1b2c3d4e5f6", section: "M", type: "textarea", label: "Özel soru: gece ağrısı" }],
    };
    const pc = await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, {
      baseRevision: 2, formCustom: fc, answers: { ...answers, c_a1b2c3d4e5f6: "Gece artıyor" },
    });
    ok(pc.status === 200, "soru ekle + başlık düzenle + bu danışandan kaldır → 200", pc.json);
    const r1b = await row(A1);
    ok(r1b.form_custom.hidden.includes("A.duration") && r1b.answers["A.duration"] === "m1_6", "kaldırılan alanın cevabı SİLİNMEDİ");
    ok(r1b.answers.c_a1b2c3d4e5f6 === "Gece artıyor", "özel soru cevabı kaydedildi");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, {
      baseRevision: 3, formCustom: { ...fc, custom: [] }, answers: { ...answers, c_a1b2c3d4e5f6: "x" },
    })).status === 400, "silinen özel sorunun cevabı kalamaz → 400");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, {
      baseRevision: 3, formCustom: { ...fc, labels: { "Q.bad": "x" } },
    })).status === 400, "şablonda olmayan alan başlığı → 400");
    const { getTemplate } = await import("../../lib/danisan/anamnez/schema");
    ok(getTemplate("std-v1").sections[0].fields[0].key === "A.reason" && getTemplate("std-v1").sections.length === 17, "kanonik şablon (kod) değişmedi");

    // Başka danışan (Mehmet) standartla başlar.
    const cm = await call(listRoute.POST, "POST", P(seed.clients.a2), asA, { mode: "standard", fromId: null, assessmentDate: "2026-09-28" });
    const M1 = (cm.json.anamnesis as Json).id as string;
    const rm = await row(M1);
    ok(cm.status === 201 && JSON.stringify(rm.form_custom) === "{}" || (rm.form_custom.hidden ?? []).length === 0, "Mehmet standart 17 bölümle başlar (Ayşe'nin farkı yok)");
    ok(JSON.stringify(rm.answers) === "{}", "Mehmet'in cevapları boş");

    // Tek taslak kuralı.
    const dup = await call(listRoute.POST, "POST", P(seed.clients.a1), asA, { mode: "standard", fromId: null, assessmentDate: "2026-10-01" });
    ok(dup.status === 409 && dup.json.code === "DRAFT_EXISTS" && dup.json.draftId === A1, "ikinci taslak → 409 DRAFT_EXISTS (+draftId)");
    ok((await call(listRoute.POST, "POST", P(seed.clients.a1), asA, { mode: "previous", fromId: A1, assessmentDate: "2026-10-01" })).status === 409, "taslaktan 'önceki bilgiler' → 409");

    // ── 3. IDOR ──────────────────────────────────────────────────────────────
    section("3. IDOR (Uzman B → Uzman A)");
    ok((await call(oneRoute.GET, "GET", P(seed.clients.a1, A1), asB)).status === 404, "B → A danışanı + A anamnezi GET → 404");
    ok((await call(oneRoute.GET, "GET", P(seed.clients.b1, A1), asB)).status === 404, "B → kendi danışanı + A anamnez UUID → 404");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.b1, A1), asB, { baseRevision: 3, answers: {} })).status === 404, "B → A anamnezi PATCH → 404");
    ok((await call(oneRoute.DELETE, "DELETE", P(seed.clients.b1, A1), asB, { confirmDraft: true })).status === 404, "B → A anamnezi DELETE → 404");
    ok((await call(completeRoute.POST, "POST", P(seed.clients.b1, A1), asB, { baseRevision: 3 })).status === 404, "B → A anamnezi tamamla → 404");
    ok((await call(oneRoute.GET, "GET", P(seed.clients.a2, A1), asA)).status === 404, "A → aynı tenant farklı danışan + anamnez id → 404");
    ok((await call(listRoute.POST, "POST", P(seed.clients.b1), asB, { mode: "previous", fromId: A1, assessmentDate: "2026-10-01" })).status === 404, "B → A anamnezinden kopya → 404");
    ok((await row(A1)).revision === 3, "IDOR denemeleri A'nın kaydını değiştirmedi");

    // ── 4. KAYNAK AKTARIMI / DEĞİŞİKLİK TESPİTİ ─────────────────────────────
    section("4. Danışan Detayı → Anamnez kaynakları");
    let gA = await call(oneRoute.GET, "GET", P(seed.clients.a1, A1), asA);
    const src = gA.json.sources as Json;
    ok(src["clients.kan"] === "a_pos" && src["nutrition.activity_level"] === "moderate" && src["nutrition.daily_meal_count"] === 3, "kan / aktivite / öğün kaynakları doğru");
    ok(src["nutrition.height_cm"] === 168 && src["nutrition.weight_kg"] === 68.5, "boy: son dolu ölçüm (168), kilo: son ölçüm (68.5)");
    ok(Array.isArray(src["nutrition.allergens"]) && (src["nutrition.allergens"] as Json[])[0]?.ref === "code:peanut", "alerji kaynağı (peanut)");
    let rec = gA.json.anamnesis as Json;
    const st0 = sectionSourceStates("std-v1", rec.form_custom as never, rec.answers as never, rec.source_links as never, src as never);
    const stMap = (s: typeof st0) => Object.fromEntries(s.map((x) => [x.section, x.state]));
    ok(stMap(st0).G === "available" && stMap(st0).I === "available" && stMap(st0).D === "available", "🔔 bilgi mevcut: G, I, D");
    ok(stMap(st0).A === "none" && stMap(st0).K === "none", "kaynaksız bölüm: rozet yok");

    // Bölüm bazlı import (G): yalnız G alanları dolar.
    const planG = planSectionImport("std-v1", rec.form_custom as never, "G", rec.answers as never, src as never, "tr");
    ok(planG.fills.map((f) => f.key).sort().join(",") === "G.diet_style,G.meal_count,G.water" && planG.conflicts.length === 0, "G içe aktarma planı yalnız G alanları");
    const nowIso = new Date().toISOString();
    const impG = applyImport(planG, {}, rec.answers as never, rec.source_links as never, src as never, "std-v1", nowIso);
    ok(!("I.activity_level" in impG.answers) && !("B.blood_type" in impG.answers), "tüm form otomatik DOLMADI");
    // Çakışma (I): uzman 'active' girmiş, kaynak 'moderate'.
    const withI = { ...impG.answers, "I.activity_level": "active" };
    const planI = planSectionImport("std-v1", rec.form_custom as never, "I", withI as never, src as never, "tr");
    ok(planI.conflicts.length === 1 && planI.conflicts[0].key === "I.activity_level" && planI.fills.length === 0, "farklı değer → çakışma (sessiz overwrite yok)");
    const keep = applyImport(planI, { "I.activity_level": "keep" }, withI as never, impG.links, src as never, "std-v1", nowIso);
    ok(keep.answers["I.activity_level"] === "active" && keep.links["I.activity_level"].a === "kept", "Mevcudu Koru → değer aynı, bağlantı 'kept'");
    const use = applyImport(planI, { "I.activity_level": "use" }, withI as never, impG.links, src as never, "std-v1", nowIso);
    ok(use.answers["I.activity_level"] === "moderate" && use.links["I.activity_level"].a === "imported", "Danışan Bilgisini Kullan → kaynak değeri");
    const planD = planSectionImport("std-v1", rec.form_custom as never, "D", keep.answers as never, src as never, "tr");
    const impD = applyImport(planD, {}, keep.answers as never, keep.links, src as never, "std-v1", nowIso);
    const sv = await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, { baseRevision: 3, formCustom: rec.form_custom, answers: impD.answers, sourceLinks: impD.links });
    ok(sv.status === 200, "içe aktarılan değerler + bağlantılar kaydedildi", sv.json);
    gA = await call(oneRoute.GET, "GET", P(seed.clients.a1, A1), asA);
    rec = gA.json.anamnesis as Json;
    const st1 = stMap(sectionSourceStates("std-v1", rec.form_custom as never, rec.answers as never, rec.source_links as never, gA.json.sources as never));
    ok(st1.G === "current" && st1.I === "current" && st1.D === "current", "✓ güncel: G, I (kept), D");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, { baseRevision: 4, sourceLinks: { "A.reason": { src: "clients.kan", v: "x", a: "imported", at: nowIso } } })).status === 400, "kaynaksız alana bağlantı → 400");

    // İlgisiz değişiklik (telefon/adres/not adresi/legacy) → uyarı yok.
    await env.su.query(`update public.clients set telefon='05559999999', adres='Yeni adres', saglik='LEGACY-2', email='x@y.z' where id=$1`, [seed.clients.a1]);
    await env.su.query(`update public.client_notes set adres='Yeni not adresi' where client_id=$1`, [seed.clients.a1]);
    const gU = await call(oneRoute.GET, "GET", P(seed.clients.a1, A1), asA);
    const stU = stMap(sectionSourceStates("std-v1", rec.form_custom as never, rec.answers as never, rec.source_links as never, gU.json.sources as never));
    ok(JSON.stringify(stU) === JSON.stringify(st1), "telefon/adres/legacy değişikliği → anamnez uyarısı OLUŞMADI");

    // ── 5. TAMAMLA / KİLİT ──────────────────────────────────────────────────
    section("5. Tamamla + DB kilidi");
    const cp = await call(completeRoute.POST, "POST", P(seed.clients.a1, A1), asA, { baseRevision: 4 });
    ok(cp.status === 200, "tamamla → 200", cp.json);
    const locked = await row(A1);
    ok(locked.status === "completed" && locked.completed_at && locked.completed_by_user_id === U.A.id, "status completed + completed_at/by");
    ok((await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A1), asA, { baseRevision: 5, answers: {} })).json.code === "LOCKED", "tamamlanmış PATCH → 409 LOCKED");
    ok((await call(completeRoute.POST, "POST", P(seed.clients.a1, A1), asA, { baseRevision: 5 })).status === 409, "ikinci kez tamamla → 409");
    let dbLocked = false;
    try { await env.su.query(`update public.client_anamneses set answers='{}'::jsonb where id=$1`, [A1]); } catch { dbLocked = true; }
    ok(dbLocked, "DB trigger doğrudan UPDATE'i de reddediyor");
    const lockedSnapshot = JSON.stringify((await row(A1)).answers);

    // Kaynak değişti (tamamlanmış anamnez DEĞİŞMEZ).
    await env.su.query(`update public.nutrition_client_profiles set activity_level='light' where client_id=$1`, [seed.clients.a1]);
    await env.su.query(`insert into public.nutrition_client_allergens(tenant_id, client_id, allergen_id) values ($1,$2,$3)`, [seed.TA, seed.clients.a1, seed.allergen.latex]);
    const gC = await call(oneRoute.GET, "GET", P(seed.clients.a1, A1), asA);
    const recC = gC.json.anamnesis as Json;
    const changes = listSourceChanges("std-v1", recC.form_custom as never, recC.answers as never, recC.source_links as never, gC.json.sources as never, "tr");
    ok(changes.map((c) => c.key).sort().join(",") === "D.items,I.activity_level", "⚠ yalnız eşlenmiş değişen alanlar: D.items, I.activity_level", changes.map((c) => c.key));
    ok(JSON.stringify(recC.answers) === lockedSnapshot, "tamamlanmış anamnez cevapları DEĞİŞMEDİ");
    const lst = await call(listRoute.GET, "GET", P(seed.clients.a1), asA);
    const item = (lst.json.anamneses as Json[]).find((x) => x.id === A1)!;
    ok(item.source_changed === true && !("answers" in item), "tarihçe: ⚠ işareti + liste cevap taşımıyor");

    // ── 6. YENİ ANAMNEZ: önceki bilgiler / güncel bilgiler ──────────────────
    section("6. Yeni anamnez — önceki bilgileri getir / güncel bilgilerle");
    const before = JSON.stringify(await row(A1));
    const pv = await call(listRoute.POST, "POST", P(seed.clients.a1), asA, { mode: "previous", fromId: A1, assessmentDate: "2027-01-15" });
    ok(pv.status === 201, "önceki anamnez bilgilerini getir → 201", pv.json);
    const A2 = (pv.json.anamnesis as Json).id as string;
    const r2 = await row(A2);
    ok(JSON.stringify(r2.answers) === lockedSnapshot && JSON.stringify(r2.form_custom) === JSON.stringify(locked.form_custom), "cevaplar + form farkı YENİ kayda kopyalandı");
    ok(r2.kind === "update" && r2.based_on_anamnesis_id === A1 && r2.status === "draft", "kind=update, based_on bilgi amaçlı, draft");
    ok(JSON.stringify(await row(A1)) === before, "eski anamnez değişmedi");
    const p2 = await call(oneRoute.PATCH, "PATCH", P(seed.clients.a1, A2), asA, { baseRevision: 1, answers: { ...r2.answers, "A.reason": "Güncellendi" } });
    ok(p2.status === 200 && (await row(A1)).answers["A.reason"] === "Uyku ve stres", "yeni kayıttaki değişiklik eski kaydı etkilemedi (canlı bağ yok)");
    // Taslağı sil, refresh ile yeniden dene.
    ok((await call(oneRoute.DELETE, "DELETE", P(seed.clients.a1, A2), asA, {})).json.code === "CONFIRM_REQUIRED", "taslak silme onaysız → 400");
    ok((await call(oneRoute.DELETE, "DELETE", P(seed.clients.a1, A2), asA, { confirmDraft: true })).status === 200, "taslak silme (onaylı) → 200");
    const rf = await call(listRoute.POST, "POST", P(seed.clients.a1), asA, { mode: "refresh", fromId: A1, assessmentDate: "2027-01-15" });
    ok(rf.status === 201, "Güncel Bilgilerle Yeni Anamnez → 201", rf.json);
    const A3 = (rf.json.anamnesis as Json).id as string;
    const r3 = await row(A3);
    ok(r3.answers["I.activity_level"] === "light" && r3.source_links["I.activity_level"].a === "imported", "yeni kayıtta değişen değer uygulandı (light)");
    const dRows = r3.answers["D.items"] as Array<{ ref?: string }>;
    ok(dRows.some((r) => r.ref === "code:peanut") && dRows.some((r) => r.ref === "code:latex"), "alerji listesi: eksik satır EKLENDİ, mevcut satır silinmedi");
    ok(JSON.stringify(await row(A1)) === before, "refresh sonrası da eski anamnez aynen duruyor");
    ok((await call(listRoute.POST, "POST", P(seed.clients.a1), asA, { mode: "previous", fromId: A1, assessmentDate: "2027-02-01" })).status === 409, "açık taslak varken yeni → 409");

    // ── 7. PDF / PRIVATE STORAGE ────────────────────────────────────────────
    section("7. PDF ekleri (private Storage)");
    __resetRateLimitForTest();
    const up = await uploadPdf(seed.clients.a1, A1, asA);
    ok(up.prep.status === 200 && up.put?.status === 200 && up.fin?.status === 201, "geçerli PDF (tamamlanmış anamneze) → 201", { prep: up.prep.json, fin: up.fin?.json });
    const att = (up.fin!.json.attachment as Json);
    const path1 = up.prep.json.path as string;
    ok(path1.startsWith(`${seed.TA}/${seed.clients.a1}/${A1}/`) && /\.pdf$/.test(path1) && !path1.includes("Doldurulmu"), "yol sunucuda üretildi ({tenant}/{client}/{anamnesis}/{uuid}.pdf)");
    const attRow = (await env.su.query(`select * from public.client_anamnesis_attachments where id=$1`, [att.id])).rows[0];
    ok(attRow.original_name === "Doldurulmuş form.pdf" && /^[0-9a-f]{64}$/.test(attRow.sha256) && attRow.size_bytes === PDF_BYTES.length, "metadata: ad, sha256, gerçek boyut");
    ok((await call(prepareRoute.POST, "POST", P(seed.clients.a1, A1), asA, { fileName: "big.pdf", size: 10 * 1024 * 1024 + 1, contentType: "application/pdf" })).json.code === "TOO_LARGE", ">10 MB beyanı → TOO_LARGE");
    ok((await call(prepareRoute.POST, "POST", P(seed.clients.a1, A1), asA, { fileName: "x.png", size: 100, contentType: "image/png" })).json.code === "INVALID_TYPE", "yanlış MIME → INVALID_TYPE");
    ok((await call(prepareRoute.POST, "POST", P(seed.clients.a1, A1), asA, { fileName: "x.exe", size: 100, contentType: "application/pdf" })).json.code === "INVALID_TYPE", ".pdf olmayan uzantı → INVALID_TYPE");
    // Sahte .pdf: MIME/uzantı PDF ama içerik değil → finalize reddeder + nesneyi siler.
    const fake = await uploadPdf(seed.clients.a1, A1, asA, Buffer.from("MZ not a pdf at all"), "application/pdf");
    ok(fake.fin?.status === 422 && fake.fin.json.code === "INVALID_TYPE", "sahte .pdf (magic bytes yanlış) → 422");
    ok(!env.storage.objects.get(ANAMNEZ_BUCKET)!.has(fake.prep.json.path as string), "reddedilen dosya Storage'dan silindi");
    // Bucket kilidi: text/plain içerik tipiyle yükleme ve gerçek >10MB bayt.
    const prepX = await call(prepareRoute.POST, "POST", P(seed.clients.a1, A1), asA, { fileName: "a.pdf", size: 10, contentType: "application/pdf" });
    const putMime = await fetch(`${env.url}/storage/v1/object/upload/sign/${ANAMNEZ_BUCKET}/${prepX.json.path}?token=${prepX.json.token}`, { method: "PUT", headers: { "content-type": "text/plain" }, body: "x" });
    ok(putMime.status >= 400, "bucket MIME kilidi: text/plain yükleme reddedildi");
    const putBig = await fetch(`${env.url}/storage/v1/object/upload/sign/${ANAMNEZ_BUCKET}/${prepX.json.path}?token=${prepX.json.token}`, { method: "PUT", headers: { "content-type": "application/pdf" }, body: new Uint8Array(Buffer.concat([PDF_BYTES, Buffer.alloc(10 * 1024 * 1024)])) });
    ok(putBig.status >= 400, "bucket boyut kilidi: >10 MB gerçek bayt reddedildi");
    // 5 sınırı.
    for (let i = 0; i < 4; i++) await uploadPdf(seed.clients.a1, A1, asA);
    const cnt = Number((await env.su.query(`select count(*) from public.client_anamnesis_attachments where anamnesis_id=$1`, [A1])).rows[0].count);
    ok(cnt === 5, "5 PDF eklendi");
    ok((await call(prepareRoute.POST, "POST", P(seed.clients.a1, A1), asA, { fileName: "6.pdf", size: 100, contentType: "application/pdf" })).json.code === "LIMIT_REACHED", "6. PDF prepare → LIMIT_REACHED");
    // prepare'i atlayıp doğrudan yüklenmiş 6. nesne finalize → DB trigger + route reddeder, nesne silinir.
    const sixth = `${seed.TA}/${seed.clients.a1}/${A1}/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f06.pdf`;
    env.storage.objects.get(ANAMNEZ_BUCKET)!.set(sixth, { bytes: PDF_BYTES, contentType: "application/pdf", createdAt: Date.now() });
    const f6 = await call(finalizeRoute.POST, "POST", P(seed.clients.a1, A1), asA, { path: sixth, originalName: "6.pdf" });
    ok(f6.json.code === "LIMIT_REACHED" && !env.storage.objects.get(ANAMNEZ_BUCKET)!.has(sixth), "6. PDF finalize → LIMIT_REACHED + nesne silindi");

    // Görüntüle / indir — 60 sn.
    const v = await call(attRoute.GET, "GET", P(seed.clients.a1, A1, att.id as string), asA, undefined, "?mode=view");
    ok(v.status === 200 && v.json.expiresIn === 60 && env.storage.signLog.at(-1)?.expiresIn === 60, "görüntüle: signed URL 60 sn");
    const vr = await fetch(String(v.json.url));
    const vb = Buffer.from(await vr.arrayBuffer());
    ok(vr.status === 200 && vb.subarray(0, 5).toString() === "%PDF-", "signed URL ile PDF okunuyor");
    const d = await call(attRoute.GET, "GET", P(seed.clients.a1, A1, att.id as string), asA, undefined, "?mode=download");
    ok(String(d.json.url).includes("download="), "indir: download (Content-Disposition) parametresi");
    const dr = await fetch(String(d.json.url));
    ok((dr.headers.get("content-disposition") ?? "").startsWith("attachment"), "indir yanıtı attachment");
    for (const t of env.storage.readTokens.values()) t.expiresAt = Date.now() - 1;
    ok((await fetch(String(v.json.url))).status >= 400, "süresi dolan signed URL reddedildi");

    // IDOR + tahmin edilen yol.
    ok((await call(attRoute.GET, "GET", P(seed.clients.b1, A1, att.id as string), asB, undefined, "?mode=view")).status === 404, "B → A eki (kendi danışanıyla) → 404");
    ok((await call(attRoute.GET, "GET", P(seed.clients.a1, A1, att.id as string), asB, undefined, "?mode=view")).status === 404, "B → A danışanı + A eki → 404");
    ok((await call(attRoute.DELETE, "DELETE", P(seed.clients.b1, A1, att.id as string), asB)).status === 404, "B → A eki silme → 404");
    ok((await call(attRoute.GET, "GET", P(seed.clients.a1, A3, att.id as string), asA, undefined, "?mode=view")).status === 404, "ek başka anamnez id'siyle istenemez → 404");
    const bClient = await call(listRoute.POST, "POST", P(seed.clients.b1), asB, { mode: "standard", fromId: null, assessmentDate: "2026-09-28" });
    const BA = (bClient.json.anamnesis as Json).id as string;
    ok((await call(finalizeRoute.POST, "POST", P(seed.clients.b1, BA), asB, { path: path1, originalName: "stolen.pdf" })).status === 400, "B → A'nın yolunu kendi anamnezine bağlama → 400");
    ok((await call(cleanupRoute.POST, "POST", P(seed.clients.b1, BA), asB, { path: path1 })).status === 400, "B → A'nın yolunu temizleme → 400");
    ok((await call(finalizeRoute.POST, "POST", P(seed.clients.a1, A1), asA, { path: `${seed.TA}/${seed.clients.a1}/${A1}/../x.pdf` })).status === 400, "traversal yol → 400");
    ok((await call(finalizeRoute.POST, "POST", P(seed.clients.a1, A1), asA, { path: `${seed.TA}/${seed.clients.a1}/${A1}/%2e%2e%2fx.pdf` })).status === 400, "encoded traversal → 400");
    const anonGet = await fetch(`${env.url}/storage/v1/object/authenticated/${ANAMNEZ_BUCKET}/${path1}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
    ok(anonGet.status >= 400, "anon anahtarla tahmin edilen yol okunamıyor (policy yok)");
    const pubGet = await fetch(`${env.url}/storage/v1/object/public/${ANAMNEZ_BUCKET}/${path1}`);
    ok(pubGet.status >= 400, "public URL → reddedildi (private bucket)");
    ok((await env.su.query(`select public from storage.buckets where id=$1`, [ANAMNEZ_BUCKET])).rows[0].public === false, "bucket public=false (migration)");
    // Kayıtlı eki cleanup ile silme denemesi → atlanır.
    const cl = await call(cleanupRoute.POST, "POST", P(seed.clients.a1, A1), asA, { path: path1 });
    ok(cl.json.skipped === "registered" && env.storage.objects.get(ANAMNEZ_BUCKET)!.has(path1), "cleanup kayıtlı eki silemez");
    // Ek silme.
    const lastAtt = (await env.su.query(`select id, storage_path from public.client_anamnesis_attachments where anamnesis_id=$1 order by created_at desc limit 1`, [A1])).rows[0];
    const delAtt = await call(attRoute.DELETE, "DELETE", P(seed.clients.a1, A1, lastAtt.id), asA);
    ok(delAtt.status === 200 && !env.storage.objects.get(ANAMNEZ_BUCKET)!.has(lastAtt.storage_path), "ek silme: Storage + metadata");
    // Storage hatasında metadata korunur.
    env.storage.failRemove = true;
    const keepAtt = (await env.su.query(`select id from public.client_anamnesis_attachments where anamnesis_id=$1 limit 1`, [A1])).rows[0];
    const failDel = await call(attRoute.DELETE, "DELETE", P(seed.clients.a1, A1, keepAtt.id), asA);
    ok(failDel.status === 502 && (await env.su.query(`select 1 from public.client_anamnesis_attachments where id=$1`, [keepAtt.id])).rowCount === 1, "Storage hatası → metadata korunur (sessiz yetim yok)");
    env.storage.failRemove = false;

    // Boş form PDF.
    section("8. Boş anamnez PDF");
    __resetRateLimitForTest();
    const bf = await call(blankRoute.GET, "GET", P(seed.clients.a1), asA, undefined, "?locale=tr");
    const bfBytes = Buffer.from(await bf.res.arrayBuffer());
    ok(bf.status === 200 && bf.res.headers.get("content-type") === "application/pdf" && bfBytes.subarray(0, 5).toString() === "%PDF-", "standart boş form → PDF");
    ok((bf.res.headers.get("content-disposition") ?? "").includes("anamnez-formu"), "dosya adı anamnez-formu-*.pdf");
    const bfA = await call(blankRoute.GET, "GET", P(seed.clients.a1), asA, undefined, `?aid=${A3}&locale=en`);
    ok(bfA.status === 200 && (bfA.res.headers.get("content-disposition") ?? "").includes("intake-form"), "danışana özel form (EN) → PDF");
    ok((await call(blankRoute.GET, "GET", P(seed.clients.a1), asB)).status === 404, "B → A danışanı boş form → 404");
    ok((await call(blankRoute.GET, "GET", P(seed.clients.a1), {})).status === 401, "kimliksiz boş form → 401");

    // Kayıtlı (dolu) form PDF.
    section("8b. Kayıtlı anamnez PDF");
    __resetRateLimitForTest();
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdfTextOf = async (b: Buffer) => ((await extractText(await getDocumentProxy(new Uint8Array(b)), { mergePages: true })).text as string).replace(/\s+/g, " ");
    const revA1 = (await row(A1)).revision as number;
    const fp = await call(filledRoute.GET, "GET", P(seed.clients.a1, A1), asA, undefined, `?rev=${revA1}&locale=tr`);
    const fpBytes = Buffer.from(await fp.res.arrayBuffer());
    ok(fp.status === 200 && fp.res.headers.get("content-type") === "application/pdf" && fpBytes.subarray(0, 5).toString() === "%PDF-", "tamamlanmış anamnez → 200 %PDF-");
    ok(fp.res.headers.get("x-anamnez-revision") === String(revA1), "X-Anamnez-Revision başlığı");
    ok(/attachment; filename="anamnez-zz-ayse-[a-z0-9-]*\d{4}-\d{2}-\d{2}\.pdf"/.test(fp.res.headers.get("content-disposition") ?? "") && /no-store/.test(fp.res.headers.get("cache-control") ?? ""), "attachment anamnez-<slug>-<tarih>.pdf + no-store", fp.res.headers.get("content-disposition"));
    const fpText = await pdfTextOf(fpBytes);
    ok(fpText.includes("ZZ Ayşe") && fpText.includes("TAMAMLANDI") && fpText.includes("Gece artıyor"), "PDF: danışan adı + TAMAMLANDI + özel soru cevabı");
    ok(!/\bNaN\b|\bundefined\b/.test(fpText), "PDF: NaN/undefined YOK");
    const fc409 = await call(filledRoute.GET, "GET", P(seed.clients.a1, A1), asA, undefined, `?rev=${revA1 - 1}`);
    ok(fc409.status === 409 && fc409.json.code === "CONFLICT" && fc409.json.revision === revA1, "eski rev → 409 CONFLICT (+güncel revision)");
    ok((await call(filledRoute.GET, "GET", P(seed.clients.a1, A1), asA, undefined, "?rev=abc")).status === 400, "geçersiz rev → 400");
    ok((await call(filledRoute.GET, "GET", P(seed.clients.a1, A1), asA)).status === 200, "rev'siz → 200 (son kayıt)");
    ok((await call(filledRoute.GET, "GET", P(seed.clients.a1, A1), asB)).status === 404, "B → A danışanı + A anamnezi PDF → 404");
    ok((await call(filledRoute.GET, "GET", P(seed.clients.b1, A1), asB)).status === 404, "B kendi danışanı + A anamnez id → 404");
    ok((await call(filledRoute.GET, "GET", P(seed.clients.a1, A1), {})).status === 401, "kimliksiz PDF → 401");
    ok((await call(filledRoute.GET, "GET", P(seed.clients.a1, A1), { id: U.DEMO.id, token: U.DEMO.token })).status === 404, "demo → 404");
    ok((await call(filledRoute.GET, "GET", P(seed.clients.a1, "not-a-uuid"), asA)).status === 404, "geçersiz anamnez id → 404");
    const fpDraft = await call(filledRoute.GET, "GET", P(seed.clients.a1, A3), asA, undefined, `?rev=${(await row(A3)).revision}&locale=en`);
    const fpDraftBytes = Buffer.from(await fpDraft.res.arrayBuffer());
    ok(fpDraft.status === 200 && (fpDraft.res.headers.get("content-disposition") ?? "").includes("intake-") && (await pdfTextOf(fpDraftBytes)).includes("DRAFT"), "taslak (EN) → 200, DRAFT rozeti, intake-*.pdf");

    // ── 9. ANAMNEZ SİLME ────────────────────────────────────────────────────
    section("9. Tamamlanmış anamnez silme");
    const prefixA1 = `${seed.TA}/${seed.clients.a1}/${A1}/`;
    ok(objectsUnder(prefixA1).length >= 4, "silme öncesi A1 nesneleri mevcut");
    ok((await call(oneRoute.DELETE, "DELETE", P(seed.clients.a1, A1), asA, {})).json.code === "CONFIRM_REQUIRED", "onaysız → 400");
    ok((await call(oneRoute.DELETE, "DELETE", P(seed.clients.a1, A1), asA, { confirmText: "evet" })).json.code === "CONFIRM_REQUIRED", "yanlış onay metni → 400");
    ok((await call(oneRoute.DELETE, "DELETE", P(seed.clients.a1, A1), asA, { confirmDraft: true })).json.code === "CONFIRM_REQUIRED", "tamamlanmışta taslak onayı yetmez → 400");
    env.storage.failRemove = true;
    const df = await call(oneRoute.DELETE, "DELETE", P(seed.clients.a1, A1), asA, { confirmText: "SİL" });
    ok(df.status === 502 && (await row(A1)) !== undefined, "Storage hatası → anamnez SİLİNMEDİ (fail-closed)");
    env.storage.failRemove = false;
    // Finalize edilmemiş yetim nesne (önek temizliğiyle yakalanmalı).
    const orphan = `${prefixA1}0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e99.pdf`;
    env.storage.objects.get(ANAMNEZ_BUCKET)!.set(orphan, { bytes: PDF_BYTES, contentType: "application/pdf", createdAt: Date.now() });
    const dOk = await call(oneRoute.DELETE, "DELETE", P(seed.clients.a1, A1), asA, { confirmText: " sil " });
    ok(dOk.status === 200, "doğru onay (tr-TR normalize 'sil') → 200", dOk.json);
    ok((await row(A1)) === undefined && (await env.su.query(`select 1 from public.client_anamnesis_attachments where anamnesis_id=$1`, [A1])).rowCount === 0, "anamnez + ek metadata silindi");
    ok(objectsUnder(prefixA1).length === 0, "A1 Storage nesneleri (yetim dahil) silindi");
    ok((await row(A3)).based_on_anamnesis_id === null && (await row(A3)).status === "draft", "bağlı yeni kayıt korunur (based_on → NULL)");

    // ── 10. DANIŞAN SİLME TEMİZLİĞİ ─────────────────────────────────────────
    section("10. Danışan silme → anamnez + PDF temizliği");
    await call(completeRoute.POST, "POST", P(seed.clients.a1, A3), asA, { baseRevision: (await row(A3)).revision });
    await uploadPdf(seed.clients.a1, A3, asA);
    const orphan2 = `${seed.TA}/${seed.clients.a1}/${A3}/0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e77.pdf`;
    env.storage.objects.get(ANAMNEZ_BUCKET)!.set(orphan2, { bytes: PDF_BYTES, contentType: "application/pdf", createdAt: Date.now() });
    await uploadPdf(seed.clients.b1, BA, asB);
    const bObjects = objectsUnder(`${seed.TB}/`).length;
    const pv2 = await call(previewRoute.GET, "GET", P(seed.clients.a1), asA);
    const counts = (pv2.json.preview as Json | undefined)?.counts ?? (pv2.json as Json).counts;
    const cc = (counts as Array<{ key: string; count: number }> | undefined) ?? [];
    ok(cc.find((c) => c.key === "anamneses")?.count === 1 && cc.find((c) => c.key === "anamnesisFiles")?.count === 1, "silme önizlemesi anamnez + belge sayıyor", pv2.json);
    env.storage.failList = true;
    const cdFail = await call(cascadeRoute.DELETE, "DELETE", P(seed.clients.a1), asA);
    ok(cdFail.status === 502 && (await env.su.query(`select 1 from public.clients where id=$1`, [seed.clients.a1])).rowCount === 1, "Storage listelenemezse danışan SİLİNMEZ (fail-closed)");
    env.storage.failList = false;
    ok((await call(cascadeRoute.DELETE, "DELETE", P(seed.clients.a1), asB)).status === 403, "B → A danışanını silme → 403");
    const cd = await call(cascadeRoute.DELETE, "DELETE", P(seed.clients.a1), asA);
    ok(cd.status === 200, "danışan silme → 200", cd.json);
    ok((await env.su.query(`select 1 from public.client_anamneses where client_id=$1`, [seed.clients.a1])).rowCount === 0, "anamnez satırları cascade silindi");
    ok((await env.su.query(`select 1 from public.client_anamnesis_attachments where client_id=$1`, [seed.clients.a1])).rowCount === 0, "ek metadata cascade silindi");
    ok(objectsUnder(`${seed.TA}/${seed.clients.a1}/`).length === 0, "danışanın tüm anamnez PDF'leri (yetim dahil) Storage'dan silindi");
    ok(objectsUnder(`${seed.TB}/`).length === bObjects, "başka tenant nesnelerine dokunulmadı");
    ok((await row(M1)) !== undefined, "başka danışanın (Mehmet) anamnezi duruyor");
  } finally {
    await env.stop();
  }

  console.log(`\nanamnez routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error("FAIL:\n - " + failures.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
