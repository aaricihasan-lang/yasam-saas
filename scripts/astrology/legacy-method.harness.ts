/**
 * ASTROLOJİ — ESKİ HESAP SÜRÜMÜ NOTU harness'i (YENİ-P2-03, 2026-10-20).
 *
 *   A) legacyMethodNotes: kompozit -1 (ATL-P2-06), bütün-burç kompozit (ws-3 öncesi), bütün-burç natal/dönüş sect (ATL-P2-05)
 *      kuralları; güncel sürümlerde ve diğer ev sistemlerinde not YOK.
 *   B) staleTimezoneOffset: tarihsel saat dilimi tablosundaki bölgede saklı ofset güncel çözümden farklıysa işaretlenir;
 *      tablo dışı bölge (İstanbul), saat bilinmiyor, eşit ofset → işaret YOK.
 *   C) getAnalysis + Word/PDF modeli: eski kayıtta not ekranda (legacyNotes) ve raporda; DB snapshot DEĞİŞMEZ.
 *   D) Profil detayı: saklı ofseti eski revizyon staleTimezone ile işaretlenir; güncel revizyonda işaret yok.
 * Gerçek Roxy / gerçek DB YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/legacy-method.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createFakeClient, createStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile, getAstroProfileDetail } from "@/lib/astrology/profiles/service";
import { runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getAnalysis, saveAnalysis } from "@/lib/astrology/analyses/service";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { legacyMethodNotes, staleTimezoneOffset } from "@/lib/astrology/legacyMethod";
import { LEGACY_METHOD_LEAD } from "@/lib/astrology/legacyMethodText";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import { representativeLmtNotice } from "@/lib/astrology/birth/representativeLmt";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const NATAL_GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));

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
const CLIENT = "55555555-5555-4555-8555-555555555555";
const IST: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const RVK: ResolvedLocation = { id: "gn-3413829", label: "Reykjavík, İzlanda", timezone: "Atlantic/Reykjavik", latitude: 64.1355, longitude: -21.8954 };
const resolveLoc = (id: unknown) => (id === IST.id ? IST : id === RVK.id ? RVK : null);

async function main() {
  await t("A: kural tablosu — yalnız düzeltilen kurallardan önceki sürümler not alır", () => {
    const n = (technique: string, adapterVersion: string, houseSystem: string) => legacyMethodNotes({ technique, adapterVersion, houseSystem, revisions: [] }).map((x) => x.code);
    assert.deepEqual(n("western.composite", "astro-roxy-composite-1", "placidus"), ["composite_angles"]);
    assert.deepEqual(n("western.composite", "astro-roxy-composite-2", "placidus"), []);
    assert.deepEqual(n("western.composite", "astro-roxy-composite-2", "whole-sign"), ["composite_whole_sign"]);
    assert.deepEqual(n("western.composite", "astro-roxy-composite-1", "whole-sign"), ["composite_angles", "composite_whole_sign"]);
    assert.deepEqual(n("western.composite", "astro-roxy-composite-ws-3", "whole-sign"), []);
    assert.deepEqual(n("western.composite", "astro-roxy-composite-2", "equal"), []);
    assert.deepEqual(n("western.natal", "astro-roxy-natal-1", "whole-sign"), ["whole_sign_sect"]);
    assert.deepEqual(n("western.solar_return", "astro-roxy-solar-return-1", "whole-sign"), ["whole_sign_sect"]);
    assert.deepEqual(n("western.lunar_return", "astro-roxy-lunar-return-1", "whole-sign"), ["whole_sign_sect"]);
    assert.deepEqual(n("western.natal", "astro-roxy-natal-1", "placidus"), []);
    assert.deepEqual(n("western.natal", "astro-roxy-natal-ws-2", "whole-sign"), []);
    assert.deepEqual(n("vedic.d1", "astro-roxy-vedic-d1-1", "whole-sign"), []);
  });

  await t("B: saklı ofset tarihsel tablodan farklı → işaret; tablo dışı / saat yok / eşit → işaret yok", () => {
    const cur = resolveAstroBirthTime("1950-06-15", "12:00", "Atlantic/Reykjavik");
    assert.equal(cur.kind, "ok");
    const off = cur.kind === "ok" ? cur.offsetSeconds : 0;
    const rev = (o: number, extra: Record<string, unknown> = {}) => ({ birthDate: "1950-06-15", birthTime: "12:00:00", timeKnown: true, timezone: "Atlantic/Reykjavik", dstChoice: "auto", utcOffsetSeconds: o, ...extra });
    assert.deepEqual(staleTimezoneOffset(rev(off - 3600)), { stored: off - 3600, current: off });
    assert.equal(staleTimezoneOffset(rev(off)), null);
    assert.equal(staleTimezoneOffset(rev(off - 3600, { timeKnown: false })), null);
    assert.equal(staleTimezoneOffset({ birthDate: "1950-06-15", birthTime: "12:00:00", timeKnown: true, timezone: "Europe/Istanbul", dstChoice: "auto", utcOffsetSeconds: 0 }), null, "tablo dışı bölge");
    const notes = legacyMethodNotes({ technique: "western.natal", adapterVersion: "astro-roxy-natal-1", houseSystem: "placidus", revisions: [{ who: "danışanın", revision: rev(off - 3600) }, { who: "karşı tarafın", revision: null }] });
    assert.equal(notes.length, 1);
    assert.equal(notes[0].code, "historical_timezone");
    assert.match(notes[0].text, /danışanın doğum anı için kayıttaki ofset UTC.*güncel tabloya göre UTC/);
  });

  const store = createStore({ clients: [{ id: CLIENT, tenant_id: TENANT, ad: "Sentetik", soyad: "Sürüm" }] });
  const ctx: EngineCtx = { db: createFakeClient(store), tenantId: TENANT, userId: OWNER, entitlements: resolveAstrologyEntitlements({ isOwner: true }) };

  await t("C: eski kayıt → ekranda legacyNotes + raporda açıklama ve not; DB snapshot değişmez; güncel kayıtta not yok", async () => {
    const pr = await createAstroProfile(ctx, { label: "Sentetik Sürüm", clientId: CLIENT, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: IST.id }, resolveLoc);
    assert.equal(pr.status, 201, JSON.stringify(pr.body));
    const pid = (pr.body as J).profile.id;
    const deps: EngineDeps = {
      config: { apiKey: "k-test-legacy", baseUrl: "https://roxy-fake.local/api/v2" },
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
    const fresh = ((await getAnalysis(ctx, id, false)).body as J).analysis;
    assert.deepEqual(fresh.legacyNotes, [], "güncel kayıtta not yok");
    assert.ok(!reportTexts(buildAstroReport(fresh)).join("\n").includes(LEGACY_METHOD_LEAD));
    // 20.10 öncesi bütün-burç natal kaydını taklit et (adaptör -1 + bütün-burç).
    const row = (store.tables.astro_analyses as J[]).find((x) => x.id === id);
    row.versions_snapshot.adapterVersion = "astro-roxy-natal-1";
    row.method_snapshot.houseSystem = "whole-sign";
    const before = JSON.stringify([row.technical_snapshot, row.method_snapshot, row.versions_snapshot, row.profile_snapshot]);
    const a = ((await getAnalysis(ctx, id, false)).body as J).analysis;
    assert.deepEqual(a.legacyNotes.map((n: J) => n.code), ["whole_sign_sect"]);
    const text = reportTexts(buildAstroReport(a)).join("\n");
    assert.ok(text.includes(LEGACY_METHOD_LEAD), "rapor açıklaması");
    assert.ok(text.includes("Bütün-burç gündüz/gece (sect)"), "rapor notu");
    assert.equal(JSON.stringify([row.technical_snapshot, row.method_snapshot, row.versions_snapshot, row.profile_snapshot]), before, "DB snapshot değişmemeli");
  });

  await t("D: profil detayı — saklı ofseti eski revizyon staleTimezone (metinli); güncel revizyon işaretsiz; İstanbul işaretsiz", async () => {
    const pr = await createAstroProfile(ctx, { label: "Sentetik Reykjavik", clientId: CLIENT, birthDate: "1950-06-15", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: RVK.id }, resolveLoc);
    assert.equal(pr.status, 201, JSON.stringify(pr.body));
    const pid = (pr.body as J).profile.id;
    const d0 = ((await getAstroProfileDetail(ctx, pid)).body as J).profile;
    assert.equal(d0.revisions[0].staleTimezone, undefined, "yeni revizyon güncel tabloyla açıldı");
    const rev = (store.tables.astro_birth_profile_revisions as J[]).find((r) => r.profile_id === pid);
    const good = rev.utc_offset_seconds;
    rev.utc_offset_seconds = good - 3600; // #471 öncesi (backzone'suz) ofseti taklit et
    const d1 = ((await getAstroProfileDetail(ctx, pid)).body as J).profile;
    assert.deepEqual({ s: d1.revisions[0].staleTimezone.storedOffsetSeconds, c: d1.revisions[0].staleTimezone.currentOffsetSeconds }, { s: good - 3600, c: good });
    assert.match(d1.revisions[0].staleTimezone.text, /Yeni hesaplar kayıtlı ofsetle yapılır/);
    assert.equal(rev.utc_offset_seconds, good - 3600, "okuma veriyi değiştirmez");
  });

  await t("E: ATL-P2-07 temsilci şehir yerel ortalama saati — München 1880 (~7 dk) ve Straßburg 1900 (PMT) uyarı; Berlin, standart ofset, saat yok → uyarı yok", () => {
    const n = (utcOffsetSeconds: number, longitude: number, timeKnown = true) => representativeLmtNotice({ timeKnown, utcOffsetSeconds, longitude });
    const mu = n(3208, 11.5755);
    assert.ok(mu && mu.localMeanOffsetSeconds === 2778 && /fark yaklaşık 7 dk/.test(mu.text), JSON.stringify(mu));
    assert.match(mu!.text, /UTC\+00:53:28.*UTC\+00:46:18/);
    const sx = n(561, 7.7521);
    assert.ok(sx && /fark yaklaşık 22 dk/.test(sx.text), JSON.stringify(sx));
    assert.equal(n(3208, 13.405), null, "Berlin: fark < 60 sn");
    assert.equal(n(10800, 32.85), null, "standart ofset (15 dk katı)");
    assert.equal(n(-3600, -21.9), null);
    assert.equal(n(3208, 11.5755, false), null, "saat bilinmiyor");
  });

  await t("F: ATL-P2-07 profil detayı — München 1880 revizyonu lmtNotice taşır; hesap ofseti (Berlin LMT) DEĞİŞMEZ", async () => {
    const MUC: ResolvedLocation = { id: "gn-2867714", label: "München, Almanya", timezone: "Europe/Berlin", latitude: 48.1374, longitude: 11.5755 };
    const pr = await createAstroProfile(ctx, { label: "Sentetik München 1880", clientId: CLIENT, birthDate: "1880-05-10", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: MUC.id }, (id) => (id === MUC.id ? MUC : null));
    assert.equal(pr.status, 201, JSON.stringify(pr.body));
    const d = ((await getAstroProfileDetail(ctx, (pr.body as J).profile.id)).body as J).profile;
    assert.equal(d.revisions[0].utcOffsetSeconds, 3208, "hesap ofseti IANA Berlin LMT (değişmedi)");
    assert.equal(d.revisions[0].lmtNotice.localMeanOffsetSeconds, 2778);
    assert.equal(d.revisions[0].staleTimezone, undefined);
  });

  console.log(`\nastrology legacy-method harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main().catch((e) => {
  console.error("legacy-method harness çöktü:", e);
  process.exit(1);
});
