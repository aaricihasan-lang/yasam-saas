/**
 * ASTROLOJİ — MARKA-NÖTR METİN harness'i (GA-P1-01 / AST-04, GA-P1-02, ATL-P3-12 — 2026-10-20).
 *
 *   A) KP Horary kaynak metni (ekran + Word/PDF) sağlayıcı adı içermez.
 *   B) Eski kayıtlardaki saklı sistem notu "(Roxy)" içerse bile gösterimde (ekran + Word/PDF) GÜNCEL nötr not kullanılır;
 *      DB snapshot'ı DEĞİŞMEZ; yorum içeriği ve teknik veri aynen.
 *   C) Owner alan denetimi sınıf etiketleri sağlayıcı adı içermez.
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/brand-neutral.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createFakeClient, createStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { KP_HORARY_TEXT } from "@/lib/astrology/view/kpHorary";
import { PROVIDER_INTERP_NOTICE } from "@/lib/astrology/view/natalView";
import { UNMAPPED_CLASS_LABELS } from "@/lib/astrology/audit/unmapped";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const NATAL_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
const ROXY = /roxy/i;

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const CLIENT = "44444444-4444-4444-8444-444444444444";
const IST: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };

async function main() {
  await t("A: KP Horary kaynak metni ve tüm KP_HORARY_TEXT alanları sağlayıcı adı içermez", () => {
    for (const [k, v] of Object.entries(KP_HORARY_TEXT)) assert.ok(!ROXY.test(String(v)), `KP_HORARY_TEXT.${k}`);
    assert.ok(KP_HORARY_TEXT.source.includes("hesaplama altyapımızın"));
  });

  await t("C: owner alan denetimi sınıf etiketleri sağlayıcı adı içermez", () => {
    for (const [k, v] of Object.entries(UNMAPPED_CLASS_LABELS)) assert.ok(!ROXY.test(v), `UNMAPPED_CLASS_LABELS.${k}`);
    const panel = readFileSync(join(__dirname, "..", "..", "app/admin/astroloji/_components/UnmappedAuditPanel.tsx"), "utf8");
    assert.ok(!/"Roxy yorumu"/.test(panel));
  });

  await t("B: eski kayıtta saklı '(Roxy)' notu → ekran + Word/PDF'te güncel nötr not; DB snapshot ve yorum içeriği değişmez", async () => {
    const store = createStore({ clients: [{ id: CLIENT, tenant_id: TENANT, ad: "Sentetik", soyad: "Marka" }] });
    const ctx: EngineCtx = { db: createFakeClient(store), tenantId: TENANT, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };
    const pr = await createAstroProfile(ctx, { label: "Sentetik Marka", clientId: CLIENT, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: IST.id }, (id) => (id === IST.id ? IST : null));
    const pid = (pr.body as J).profile.id;
    const deps: EngineDeps = {
      config: { apiKey: "k-test-brand", baseUrl: "https://roxy-fake.local/api/v2" },
      callProvider: async () => ({ ok: true, raw: structuredClone(NATAL_GOLDEN.response ?? NATAL_GOLDEN), attempts: 1 }),
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      log: () => undefined,
    };
    const sel = { technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } };
    const run = (await runAstrology(ctx, { profileId: pid, selections: [sel] }, deps, { ownerPreviewHideInterp: false })).body as J;
    assert.equal(run.ok, true, JSON.stringify(run).slice(0, 300));
    const sv = await saveAnalysis(ctx, { profileId: pid, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const id = (sv.body as J).analysisId;
    // 07–15.10 kayıtlarını taklit et: saklı not sağlayıcı adını içerir.
    const row = (store.tables.astro_analyses as J[]).find((x) => x.id === id);
    const OLD = "Roxy otomatik yorumu (sağlayıcı: Roxy) — uzman yorumu değildir.";
    row.provider_interp_snapshot.notice = OLD;
    const contentBefore = JSON.stringify(row.provider_interp_snapshot.content);
    const a = ((await getAnalysis(ctx, id, false)).body as J).analysis;
    assert.equal(a.interpretation.visible, true);
    assert.equal(a.interpretation.notice, PROVIDER_INTERP_NOTICE);
    assert.equal(JSON.stringify(a.interpretation.content), contentBefore, "yorum içeriği aynen");
    assert.equal(row.provider_interp_snapshot.notice, OLD, "DB snapshot değişmemeli");
    const s = reportTexts(buildAstroReport(a)).join("\n");
    assert.ok(!ROXY.test(s), `rapor metninde sağlayıcı adı: ${s.match(/.{0,40}roxy.{0,40}/i)?.[0]}`);
  });

  console.log(`\nastrology brand-neutral harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main().catch((e) => {
  console.error("brand-neutral harness çöktü:", e);
  process.exit(1);
});
