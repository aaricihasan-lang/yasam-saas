/**
 * ASTROLOJİ AŞAMA 1 — birim + servis harness'i (gerçek Roxy'ye ve gerçek DB'ye ÇAĞRI YOK).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/harness.ts
 *
 * Kapsam: DST/zaman çözümü, doğum girdisi, önbellek anahtarı, beyaz liste projeksiyon (teknik ↔ yorum
 * ayrımı, bilinmeyen alan sızıntısı), yetki/görünürlük, planlayıcı (X/Y/Z), Roxy HTTP istemcisi
 * (yeniden deneme/zaman aşımı/anahtar), servis akışları (cache hit/miss, eşzamanlılık, tenant
 * izolasyonu, revizyon, saat bilinmiyor, hata eşleme, rate limit, PII/anahtar log denetimi).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAstroBirthTime, offsetSecondsToDecimalHours } from "@/lib/astrology/birth/timeResolution";
import { parseBirthData, type ResolvedLocation } from "@/lib/astrology/birth/profileInput";
import { calcInputHash, resultIdFor } from "@/lib/astrology/engine/inputHash";
import { buildNatalRequestBody, findUnmappedNatalFields, projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import { NO_ASTROLOGY_ENTITLEMENTS, resolveAstrologyEntitlements, resolveInterpretationVisibility } from "@/lib/astrology/access/entitlements";
import { buildPlan, parseSelections } from "@/lib/astrology/engine/planner";
import type { TechniqueId } from "@/lib/astrology/engine/techniques";
import { buildNatalView } from "@/lib/astrology/view/natalView";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { planAstrology, runAstrology, getAstrologyResult, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { appendAstroRevision, createAstroProfile, getAstroProfileDetail, listAstroProfiles } from "@/lib/astrology/profiles/service";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import * as Astronomy from "astronomy-engine";

const ROOT = join(__dirname, "..", "..");
const FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-spec-derived.json"), "utf8"));
const API_KEY = "test-roxy-key-SECRET-9f8e7d";

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

const NARRATIVE_MARKERS = ["[RXN-", "RXK-", "[RXU-"];
function assertNoNarrative(json: string, ctx: string) {
  for (const m of NARRATIVE_MARKERS) assert.ok(!json.includes(m), `${ctx}: sağlayıcı metni sızdı (${m})`);
}

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const OTHER_ADMIN = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "33333333-3333-4333-8333-333333333333";

const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const BERLIN: ResolvedLocation = { id: "de-berlin", label: "Berlin, Germany", timezone: "Europe/Berlin", latitude: 52.52, longitude: 13.405 };
const resolveLoc = (id: unknown): ResolvedLocation | null => (id === ISTANBUL.id ? ISTANBUL : id === BERLIN.id ? BERLIN : null);

function seedStore(): FakeStore {
  return createStore({
    users: [
      { id: OWNER, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: TENANT_A, email: "admin@yasamsistemi.com" },
      { id: OTHER_ADMIN, role: "admin", active: true, is_super_admin: false, is_demo_account: false, tenant_id: TENANT_B, email: "x@y.z" },
    ],
    clients: [
      { id: CLIENT_A, tenant_id: TENANT_A, ad: "Ali", soyad: "Yılmaz" },
      { id: CLIENT_B, tenant_id: TENANT_B, ad: "Başka", soyad: "Tenant" },
    ],
  });
}

function ownerCtx(store: FakeStore, tenantId = TENANT_A, userId = OWNER, ent = resolveAstrologyEntitlements({ isOwner: true })): EngineCtx {
  return { db: createFakeClient(store), tenantId, userId, entitlements: ent };
}

type RoxyStub = { calls: { endpoint: string; body: Record<string, unknown> }[]; deps: EngineDeps; logs: string[] };

function roxyDeps(opts: { raw?: unknown; fail?: "server_error" | "unauthorized"; delayMs?: number; limitDeny?: string; config?: boolean } = {}): RoxyStub {
  const calls: RoxyStub["calls"] = [];
  const logs: string[] = [];
  const locks = new Map<string, number>();
  const deps: EngineDeps = {
    config: opts.config === false ? null : { apiKey: API_KEY, baseUrl: "https://roxy-fake.local/api/v2" },
    callProvider: async (_cfg, endpoint, body) => {
      calls.push({ endpoint, body });
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.fail) return { ok: false, kind: opts.fail, status: opts.fail === "unauthorized" ? 401 : 500, attempts: 1 };
      // Yanıtı istek gövdesinin yankısıyla üret (birthDetails gerçek isteği yansıtır).
      const raw = structuredClone(opts.raw ?? FIXTURE) as Record<string, unknown>;
      raw.birthDetails = { date: body.date, time: body.time, latitude: body.latitude, longitude: body.longitude, timezone: body.timezone };
      raw.houseSystem = body.houseSystem;
      return { ok: true, raw, attempts: 1 };
    },
    rateLimit: async (scope, value, limit) => {
      if (opts.limitDeny === scope) return { allowed: false, retryAfterSec: 42 };
      const k = `${scope}:${value}`;
      const n = (locks.get(k) ?? 0) + 1;
      locks.set(k, n);
      return { allowed: n <= limit, retryAfterSec: n <= limit ? 0 : 5 };
    },
    sleep: async () => new Promise((r) => setTimeout(r, 5)),
    log: (msg, detail) => logs.push(`${msg} ${JSON.stringify(detail ?? {})}`),
  };
  return { calls, deps, logs };
}

const NATAL_SEL = [{ technique: "western.natal", options: { houseSystem: "placidus", nodeType: "true" } }];

async function createProfile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(
    ctx,
    { label: "Ali — natal", clientId: CLIENT_A, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over },
    resolveLoc,
  );
  assert.equal(r.status, 201, `profil oluşturma ${r.status} ${JSON.stringify(r.body)}`);
  return ((r.body as { profile: { id: string } }).profile).id;
}

/** Gerçek yanıttaki TÜM sağlayıcı anlatı/yorum metinleri (≥ 6 karakter; kısa ortak kelimeler hariç). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ham sağlayıcı JSON'u (test yardımcısı)
function collectNarrative(raw: Record<string, any>): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim().length >= 6) out.add(v.trim());
    else if (Array.isArray(v)) v.forEach(add);
  };
  for (const p of raw.planets ?? []) add([p.interpretation?.summary, p.interpretation?.detailed, p.interpretation?.keywords]);
  for (const a of raw.aspects ?? []) add([a.aspectInterpretation?.summary, a.aspectInterpretation?.keywords]);
  for (const p of raw.patterns ?? []) add([p.interpretation, p.interpretationKey, p.name, ...Object.values(p.interpretationVars ?? {})]);
  add(raw.aspectsInterpretation?.summary);
  return [...out];
}

function resultSelectsOk(store: FakeStore) {
  for (const l of store.log) {
    if (l.table === "astro_provider_results" && l.op === "select") {
      assert.ok(!/raw_response/.test(l.select) && l.select.trim() !== "*", `raw_response okuma sorgusunda seçildi: ${l.select}`);
    }
  }
}

async function main() {
  // ─── A) Zaman / DST ────────────────────────────────────────────────────────
  await t("zaman: İstanbul 1990-07-15 14:30 → +03:00, 11:30Z", () => {
    const r = resolveAstroBirthTime("1990-07-15", "14:30", "Europe/Istanbul");
    assert.equal(r.kind, "ok");
    if (r.kind === "ok") {
      assert.equal(r.offsetSeconds, 10800);
      assert.equal(r.utcIso, "1990-07-15T11:30:00.000Z");
    }
  });
  await t("zaman: DST boşluğu (Berlin 2021-03-28 02:30) → gap", () => {
    assert.equal(resolveAstroBirthTime("2021-03-28", "02:30", "Europe/Berlin").kind, "gap");
  });
  await t("zaman: DST çakışması (Berlin 2021-10-31 02:30) → auto reddeder, iki seçenek", () => {
    const r = resolveAstroBirthTime("2021-10-31", "02:30", "Europe/Berlin");
    assert.equal(r.kind, "ambiguous");
    if (r.kind === "ambiguous") {
      assert.deepEqual(
        r.options.map((o) => [o.choice, o.offsetSeconds, o.utcIso]),
        [
          ["earlier", 7200, "2021-10-31T00:30:00.000Z"],
          ["later", 3600, "2021-10-31T01:30:00.000Z"],
        ],
      );
    }
    const e = resolveAstroBirthTime("2021-10-31", "02:30", "Europe/Berlin", "later");
    assert.equal(e.kind, "ok");
    if (e.kind === "ok") assert.equal(e.offsetSeconds, 3600);
  });
  await t("zaman: LMT kesirli ofset korunur (İstanbul 1900)", () => {
    const r = resolveAstroBirthTime("1900-01-01", "12:00", "Europe/Istanbul");
    assert.equal(r.kind, "ok");
    if (r.kind === "ok") {
      // tzdata: İstanbul 1880–1910 IMT +01:56:56 = 7016 sn (tam saat DEĞİL).
      assert.equal(r.offsetSeconds, 7016);
      assert.equal(offsetSecondsToDecimalHours(r.offsetSeconds), 1.948889);
    }
  });

  // ─── B) Doğum girdisi ──────────────────────────────────────────────────────
  await t("girdi: saat bilinmiyor → birthTime null, doğruluk 'unknown', UTC yerel 12:00", () => {
    const r = parseBirthData({ birthDate: "1985-01-02", timeKnown: false, locationId: ISTANBUL.id }, resolveLoc);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.value.birthTime, null);
      assert.equal(r.value.timeAccuracy, "unknown");
      assert.equal(r.value.birthUtcIso, "1985-01-02T10:00:00.000Z");
    }
  });
  await t("girdi: saat girildi + doğruluk 'unknown' → 400; konum yok → 422; DST belirsiz → 422 + seçenekler", () => {
    const a = parseBirthData({ birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "unknown", locationId: ISTANBUL.id }, resolveLoc);
    assert.ok(!a.ok && a.err.status === 400);
    const b = parseBirthData({ birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: "yok" }, resolveLoc);
    assert.ok(!b.ok && b.err.code === "LOCATION_REQUIRED");
    const c = parseBirthData({ birthDate: "2021-10-31", birthTime: "02:30", timeKnown: true, timeAccuracy: "exact_record", locationId: BERLIN.id }, resolveLoc);
    assert.ok(!c.ok && c.err.code === "BIRTH_TIME_AMBIGUOUS" && c.err.dstOptions?.length === 2);
    const d = parseBirthData({ birthDate: "1400-01-01", birthTime: "12:00", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
    assert.ok(!d.ok && d.err.code === "BIRTH_DATE_RANGE");
  });

  // ─── C) Önbellek anahtarı ──────────────────────────────────────────────────
  const baseId = { provider: "roxy", providerApiVersion: "v2@2.0.0", adapterVersion: "a1", endpoint: "/astrology/natal-chart", lang: "tr" };
  await t("hash: anahtar sırasından bağımsız; girdi/yöntem/dil/sürüm değişince değişir; tenant-free", () => {
    const h1 = calcInputHash({ ...baseId, body: { a: 1, b: { c: 2, d: 3 } } });
    const h2 = calcInputHash({ ...baseId, body: { b: { d: 3, c: 2 }, a: 1 } });
    assert.equal(h1, h2);
    assert.notEqual(h1, calcInputHash({ ...baseId, body: { a: 2, b: { c: 2, d: 3 } } }));
    assert.notEqual(h1, calcInputHash({ ...baseId, lang: "en", body: { a: 1, b: { c: 2, d: 3 } } }));
    assert.notEqual(h1, calcInputHash({ ...baseId, adapterVersion: "a2", body: { a: 1, b: { c: 2, d: 3 } } }));
    assert.match(h1, /^[0-9a-f]{64}$/);
    assert.notEqual(resultIdFor(TENANT_A, h1, OWNER), resultIdFor(TENANT_B, h1, OWNER));
    // Aşama 7A: aynı tenant, farklı uzman → farklı kimlik (önbellek uzman kapsamlı).
    assert.notEqual(resultIdFor(TENANT_A, h1, OWNER), resultIdFor(TENANT_A, h1, "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e"));
  });
  await t("istek gövdesi: IANA değil ondalık ofset; saat bilinmiyorsa 12:00:00", () => {
    const b = buildNatalRequestBody({ birthDate: "1990-07-15", birthTime: null, utcOffsetSeconds: 7016, latitude: 41.00821234, longitude: 28.9784 }, { houseSystem: "koch", nodeType: "mean" });
    // 2026-10-14 LMT dengelemesi: Roxy ofseti hesapta dakikaya yuvarlar (gerçek çağrıyla ölçüldü) → 1:56:56 yerine 1:57:00
    // gönderilir ve yerel saat 4 sn ileri alınır; UTC an birebir aynı (12:00:00 − 1:56:56 = 12:00:04 − 1:57:00).
    assert.deepEqual(b, { date: "1990-07-15", time: "12:00:04", latitude: 41.008212, longitude: 28.9784, timezone: 1.95, nodeType: "mean", houseSystem: "koch" });
    // Tam dakikalık ofset (pratikte tüm modern doğumlar): gövde ESKİSİYLE birebir (önbellek anahtarı değişmez).
    const m = buildNatalRequestBody({ birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, { houseSystem: "placidus", nodeType: "true" });
    assert.deepEqual(m, { date: "1990-07-15", time: "14:30:00", latitude: 41.0082, longitude: 28.9784, timezone: 3, nodeType: "true", houseSystem: "placidus" });
    // Gün sınırı: dengeleme tarihi de doğru kaydırır (23:59:58, −0:44:30 → −0:44:00 → +30 sn → ertesi gün 00:00:28).
    const d = buildNatalRequestBody({ birthDate: "1965-06-01", birthTime: "23:59:58", utcOffsetSeconds: -2670, latitude: 6.3, longitude: -10.8 }, { houseSystem: "placidus", nodeType: "true" });
    assert.equal(`${d.date} ${d.time} ${d.timezone}`, "1965-06-02 00:00:28 -0.733333");
  });

  // ─── D) Beyaz liste projeksiyon ────────────────────────────────────────────
  const proj = projectRoxyNatal(FIXTURE, { houseSystem: "placidus", nodeType: "true" });
  await t("projeksiyon: geçerli fixture → teknik + yorum; bilinmeyen değerler düşer", () => {
    assert.ok(proj.ok, proj.ok ? "" : proj.errors.join("; "));
    if (!proj.ok) return;
    const tech = proj.value.technical;
    assert.equal(tech.bodies.length, 14, "Eris (bilinmeyen) düşmeli");
    assert.equal(tech.houses.length, 12);
    assert.equal(tech.aspects.length, 7, "BIQUINTILE (bilinmeyen tür) düşmeli");
    assert.equal(tech.patterns.length, 1, "HEXAGRAM (bilinmeyen kalıp) düşmeli");
    assert.equal(tech.aspects.find((a) => a.a === "sun" && a.b === "saturn")?.nature, "challenging");
    assert.equal(tech.aspects.find((a) => a.type === "semi_sextile")?.a, "mercury");
    assert.equal(tech.bodies.find((b) => b.id === "saturn")?.retrograde, true);
    assert.equal(tech.summary.elementDistribution?.earth, 4);
    assert.deepEqual(proj.value.droppedValues.sort(), ["aspects[](planet/type)", "patterns[](kind/planets)", "planets[].name"].sort());
  });
  await t("projeksiyon: TEKNİK katmanda sağlayıcı serbest metni YOK (her string kanonik kimlik/biçim)", () => {
    assert.ok(proj.ok);
    if (!proj.ok) return;
    const json = JSON.stringify(proj.value.technical);
    assertNoNarrative(json, "technical");
    const allowed = /^([a-z][a-z_\-.0-9]*|\d{4}-\d{2}-\d{2}|\d{2}:\d{2}(:\d{2})?|tropical)$/;
    const walk = (v: unknown, p: string) => {
      if (typeof v === "string") assert.match(v, allowed, `teknik string kanonik değil: ${p}=${v.slice(0, 40)}`);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
    };
    walk(proj.value.technical, "$");
    assert.ok(!/"interpretation"|aspectInterpretation|interpretationKey|keywords|"detailed"|"summary":"/.test(json), "yorum anahtarı teknikte");
  });
  await t("projeksiyon: YORUM katmanı yalnız tanımlı yorum alanları; bilinmeyen alan metni girmez", () => {
    assert.ok(proj.ok);
    if (!proj.ok) return;
    const ij = JSON.stringify(proj.value.interpretation);
    assert.ok(ij.includes("[RXN-sun-summary]") && ij.includes("[RXN-sun-detailed]") && ij.includes("[RXN-asp-Sun-Saturn]"));
    assert.ok(ij.includes("[RXN-pattern-stellium]") && ij.includes("[RXN-overall]"));
    assert.ok(!ij.includes("[RXU-"), "bilinmeyen alan metni yorum katmanına girdi");
    assert.ok(!ij.includes("[RXN-pattern-unknown]") && !ij.includes("[RXN-eris"), "düşen değerin yorumu girdi");
  });
  await t("projeksiyon: bilinmeyen alan YOLLARI tespit edilir (değer değil)", () => {
    const u = findUnmappedNatalFields(FIXTURE);
    assert.deepEqual(u, ["aiReading", "planets[].traitProfile"]);
    assert.ok(!JSON.stringify(u).includes("RXU"));
  });
  await t("projeksiyon: eksik ev / ev sistemi uyuşmazlığı → reddedilir (kayıt yok)", () => {
    const bad = structuredClone(FIXTURE);
    delete bad.houses;
    assert.equal(projectRoxyNatal(bad, { houseSystem: "placidus", nodeType: "true" }).ok, false);
    assert.equal(projectRoxyNatal(FIXTURE, { houseSystem: "koch", nodeType: "true" }).ok, false);
    assert.equal(projectRoxyNatal("not-an-object", { houseSystem: "placidus", nodeType: "true" }).ok, false);
  });

  // ─── E) Yetki / görünürlük / görünüm ───────────────────────────────────────
  await t("yetki: owner → 4 yetki; owner değil → hiçbiri; bayraklar Aşama 1'de yok sayılır", () => {
    assert.deepEqual(resolveAstrologyEntitlements({ isOwner: true }), { module: true, engine: true, knowledgeBank: true, providerInterpretations: true });
    assert.deepEqual(resolveAstrologyEntitlements({ isOwner: false, flags: { astrology: true, astrology_provider_interp: true } }), NO_ASTROLOGY_ENTITLEMENTS);
    assert.deepEqual(resolveInterpretationVisibility(NO_ASTROLOGY_ENTITLEMENTS, false), { visible: false, reason: "not_entitled" });
    assert.deepEqual(resolveInterpretationVisibility(resolveAstrologyEntitlements({ isOwner: true }), true), { visible: false, reason: "owner_preview_hidden" });
  });
  await t("görünüm: yorum görünmezse yanıtta yorum içeriği/boyutu YOK; saat bilinmiyorsa maske", () => {
    assert.ok(proj.ok);
    if (!proj.ok) return;
    const row = { id: "r", technique: "western.natal", provider: "roxy", provider_api_version: "v", adapter_version: "a", projection_version: "p", technical: proj.value.technical as unknown as Record<string, unknown>, created_at: "x" };
    const hidden = buildNatalView(row, { time_known: true }, { visible: false, reason: "not_entitled" }, { provider: "roxy", lang: "tr", content: proj.value.interpretation as unknown as Record<string, unknown> });
    const hj = JSON.stringify(hidden);
    assertNoNarrative(hj, "hidden view");
    assert.deepEqual(hidden.interpretation, { visible: false, reason: "not_entitled" });
    const masked = buildNatalView(row, { time_known: false }, { visible: true }, { provider: "roxy", lang: "tr", content: proj.value.interpretation as unknown as Record<string, unknown> });
    assert.equal(masked.technical.houses.length, 0);
    assert.equal(masked.technical.angles, null);
    assert.ok(masked.technical.bodies.every((b) => b.house === null));
    assert.equal(masked.technical.points.partOfFortune, null);
    assert.ok(masked.interpretation.visible && masked.interpretation.content.bodies.length === 0, "ev içeren gezegen yorumları maskelenmeli");
  });

  // ─── F) Planlayıcı ─────────────────────────────────────────────────────────
  const birth = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 };
  const planned = (sels: { technique: TechniqueId; options: Record<string, unknown> }[]) =>
    sels.map((x) => ({ ...x, ctx: { birth, birthUtc: "1990-07-15T11:30:00Z", partner: null }, blocked: null }));
  await t("plan: 1 natal → 1 birim/1 yeni istek; aynı natal iki kez → tekilleştirilir; kayıtlı → 0 istek", () => {
    const s = parseSelections(NATAL_SEL);
    assert.ok(s.ok);
    if (!s.ok) return;
    const p1 = buildPlan(planned(s.selections), () => false);
    assert.deepEqual([p1.selectedCount, p1.units.length, p1.newRequestCount, p1.cachedCount], [1, 1, 1, 0]);
    const s2 = parseSelections([...NATAL_SEL, ...NATAL_SEL]);
    assert.ok(s2.ok);
    if (!s2.ok) return;
    const p2 = buildPlan(planned(s2.selections), () => false);
    assert.deepEqual([p2.selectedCount, p2.units.length, p2.newRequestCount, p2.dedupedCount], [2, 1, 1, 1]);
    const p3 = buildPlan(planned(s.selections), () => true);
    assert.deepEqual([p3.newRequestCount, p3.cachedCount], [0, 1]);
    const s3 = parseSelections([{ technique: "western.natal", options: { houseSystem: "koch" } }]);
    assert.ok(s3.ok);
    if (!s3.ok) return;
    assert.notEqual(buildPlan(planned(s3.selections), () => false).units[0].inputHash, p1.units[0].inputHash, "ev sistemi anahtara girmeli");
  });
  await t("plan: seçim doğrulama (boş / bilinmeyen teknik / geçersiz seçenek / 20+ seçim)", () => {
    assert.equal((parseSelections([]) as { code: string }).code, "NO_SELECTION");
    assert.equal((parseSelections([{ technique: "western.everything" }]) as { code: string }).code, "UNKNOWN_TECHNIQUE");
    assert.equal((parseSelections([{ technique: "western.natal", options: { houseSystem: "regiomontanus" } }]) as { code: string }).code, "INVALID_OPTIONS");
    assert.equal((parseSelections(Array.from({ length: 21 }, () => NATAL_SEL[0])) as { code: string }).code, "TOO_MANY_SELECTIONS");
  });

  // ─── G) Roxy HTTP istemcisi ────────────────────────────────────────────────
  const cfg = { apiKey: API_KEY, baseUrl: "https://roxy-fake.local/api/v2" };
  await t("istemci: başarı — X-API-Key yalnız başlıkta, lang=tr, no-store", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const r = await callRoxy(cfg, "/astrology/natal-chart", { date: "1990-07-15" }, {
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return new Response(JSON.stringify({ ok: 1 }), { status: 200 });
      },
    });
    assert.ok(r.ok && r.attempts === 1);
    const s = seen as unknown as { url: string; init: RequestInit };
    assert.equal(s.url, "https://roxy-fake.local/api/v2/astrology/natal-chart?lang=tr");
    assert.equal(new Headers(s.init.headers).get("X-API-Key"), API_KEY);
    assert.ok(!String(s.init.body).includes(API_KEY), "anahtar gövdede");
    assert.equal(s.init.cache, "no-store");
  });
  await t("istemci: 401 → unauthorized, yeniden deneme YOK; hata sonucu anahtar içermez", async () => {
    let n = 0;
    const r = await callRoxy(cfg, "/astrology/natal-chart", {}, { fetchImpl: async () => (n++, new Response(`{"error":"bad key ${API_KEY}"}`, { status: 401 })) });
    assert.ok(!r.ok && r.kind === "unauthorized" && n === 1);
    assert.ok(!JSON.stringify(r).includes(API_KEY));
  });
  await t("istemci: 429 (Retry-After 1) → 1 kez yeniden dener; 503 ×2 → saturated, 2 deneme", async () => {
    let n = 0;
    const r = await callRoxy(cfg, "/astrology/natal-chart", {}, {
      sleep: async () => undefined,
      fetchImpl: async () => (++n === 1 ? new Response("", { status: 429, headers: { "Retry-After": "1" } }) : new Response("{}", { status: 200 })),
    });
    assert.ok(r.ok && r.attempts === 2);
    let m = 0;
    const r2 = await callRoxy(cfg, "/astrology/natal-chart", {}, { sleep: async () => undefined, fetchImpl: async () => (m++, new Response("", { status: 503 })) });
    assert.ok(!r2.ok && r2.kind === "saturated" && r2.attempts === 2 && m === 2);
  });
  await t("istemci: zaman aşımı ve ağ hatası YENİDEN DENENMEZ (çift maliyet riski)", async () => {
    let n = 0;
    const r = await callRoxy(cfg, "/astrology/natal-chart", {}, {
      timeoutMs: 20,
      fetchImpl: (_u, init) =>
        new Promise((_res, rej) => {
          n++;
          init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    });
    assert.ok(!r.ok && r.kind === "timeout" && n === 1);
    let m = 0;
    const r2 = await callRoxy(cfg, "/astrology/natal-chart", {}, { fetchImpl: async () => (m++, Promise.reject(new Error("ECONNRESET"))) });
    assert.ok(!r2.ok && r2.kind === "network" && m === 1);
    const r3 = await callRoxy(cfg, "https://evil.example/x", {}, { fetchImpl: async () => new Response("{}") });
    assert.ok(!r3.ok && r3.attempts === 0, "geçersiz endpoint reddedilmeli");
  });

  // ─── H) Servis akışları ────────────────────────────────────────────────────
  const captured: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => {
    captured.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  };
  try {
    await t("servis: profil oluştur → revizyon 1 (UTC/ofset sunucuda), danışan adı listede", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const rev = store.tables.astro_birth_profile_revisions.find((r) => r.profile_id === pid)!;
      assert.equal(rev.utc_offset_seconds, 10800);
      assert.equal(rev.birth_utc, "1990-07-15T11:30:00.000Z");
      assert.equal(rev.timezone, "Europe/Istanbul");
      const list = await listAstroProfiles(ctx);
      const p = (list.body as { profiles: { id: string; clientName: string | null; current: { timeKnown: boolean } }[] }).profiles[0];
      assert.equal(p.clientName, "Ali Yılmaz");
      assert.equal(p.current.timeKnown, true);
    });

    // GA-P2-05 (2026-10-20): ücretli yanıt alındıktan sonra geçici yazım hatası → yanıt/yorum kaybolmamalı.
    const failN = (table: string, code: string, times: number) => {
      const seen = { n: 0 };
      return { seen, fn: (tbl: string) => (tbl === table && seen.n++ < times ? { code, message: "simulated" } : null) };
    };
    await t("GA-P2-05: yorum yazımı geçici hatada (57014) yeniden denenir → yorum kaybolmaz, 1 sağlayıcı isteği", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const f = failN("astro_provider_interpretations", "57014", 1);
      store.failInsert = f.fn;
      const rx = roxyDeps();
      const r1 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(r1.status, 200, JSON.stringify(r1.body).slice(0, 300));
      assert.equal(rx.calls.length, 1);
      assert.equal(store.tables.astro_provider_interpretations.length, 1, "yorum yeniden denemeyle yazılmalı");
      assert.equal(f.seen.n, 2);
      assert.ok(rx.logs.some((l) => l.startsWith("[astro] interpretation write retry")));
    });
    await t("GA-P2-05: sonuç yazımı geçici hatada (ağ, kodsuz) yeniden denenir → kaydedilir, 2. çalıştırma 0 istek", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const f = failN("astro_provider_results", "", 1);
      store.failInsert = f.fn;
      const rx = roxyDeps();
      const r1 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(r1.status, 200, JSON.stringify(r1.body).slice(0, 300));
      assert.equal(store.tables.astro_provider_results.length, 1);
      assert.equal(store.tables.astro_provider_interpretations.length, 1);
      store.failInsert = undefined;
      const r2 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(r2.status, 200);
      assert.equal(rx.calls.length, 1, "ikinci çalıştırma önbellekten (ücretsiz)");
    });
    await t("GA-P2-05: deterministik hata (23514, ham yanıt sınırı) yeniden DENENMEZ → tek yazım denemesi, 500", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const f = failN("astro_provider_results", "23514", 99);
      store.failInsert = f.fn;
      const rx = roxyDeps();
      const r1 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(r1.status, 500);
      assert.equal(f.seen.n, 1, "deterministik hata tekrar denenmemeli");
      assert.equal(store.tables.astro_provider_results.length, 0);
    });
    await t("GA-P2-05: yorum yazımı kalıcı geçici hatada en çok 3 deneme; sonuç yine 200 (sonuç kaydı korunur)", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const f = failN("astro_provider_interpretations", "08006", 99);
      store.failInsert = f.fn;
      const rx = roxyDeps();
      const r1 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(r1.status, 200);
      assert.equal(f.seen.n, 3);
      assert.equal(store.tables.astro_provider_results.length, 1);
    });

    await t("servis: cache MISS → 1 istek + teknik/yorum ayrı tablolara; tekrar → cache HIT 0 istek", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const rx = roxyDeps();
      const plan0 = await planAstrology(ctx, { profileId: pid, selections: NATAL_SEL });
      assert.deepEqual((plan0.body as { plan: { newRequestCount: number; cachedCount: number } }).plan.newRequestCount, 1);
      const r1 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(r1.status, 200, JSON.stringify(r1.body).slice(0, 300));
      assert.equal(rx.calls.length, 1);
      assert.equal(store.tables.astro_provider_results.length, 1);
      assert.equal(store.tables.astro_provider_interpretations.length, 1);
      const res = store.tables.astro_provider_results[0];
      assert.ok(res.raw_response && JSON.stringify(res.raw_response).includes("[RXU-top]"), "ham yanıt sunucuda saklanmalı");
      assert.ok(JSON.stringify(store.tables.astro_provider_interpretations[0].content).includes("[RXN-sun-summary]"));
      assertNoNarrative(JSON.stringify(res.technical), "stored technical");
      const body1 = JSON.stringify(r1.body);
      assert.ok(body1.includes("[RXN-sun-summary]"), "owner yorum görmeli");
      assert.ok(!body1.includes("[RXU-") && !body1.includes("raw_response") && !body1.includes(res.input_hash as string), "ham/bilinmeyen/hash sızdı");
      assert.equal((r1.body as { executed: { newResults: number } }).executed.newResults, 1);

      const plan1 = await planAstrology(ctx, { profileId: pid, selections: NATAL_SEL });
      assert.deepEqual((plan1.body as { plan: { newRequestCount: number; cachedCount: number } }).plan, { ...(plan1.body as { plan: object }).plan, newRequestCount: 0, cachedCount: 1 });
      const r2 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(rx.calls.length, 1, "aynı Ali + aynı yöntem → 0 yeni Roxy isteği");
      assert.deepEqual((r2.body as { executed: object }).executed, { newResults: 0, cachedResults: 1, providerAttempts: 0 });
      const viewId = ((r2.body as { results: { view: { id: string } }[] }).results[0]).view.id;
      const g = await getAstrologyResult(ctx, viewId, { profileId: null, revision: null, ownerPreviewHideInterp: false });
      assert.equal(g.status, 200);
      assert.equal(rx.calls.length, 1, "GET sonucu sağlayıcıyı çağırmaz");
      resultSelectsOk(store);
    });

    await t("servis: owner önizleme + yetkisiz uzman → yorum içeriği yanıtta YOK, yorum tablosu okunmaz", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const rx = roxyDeps();
      await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      const before = store.log.length;
      const rp = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: true });
      assertNoNarrative(JSON.stringify(rp.body), "owner preview");
      assert.ok(JSON.stringify(rp.body).includes('"reason":"owner_preview_hidden"'));
      assert.ok(!store.log.slice(before).some((l) => l.table === "astro_provider_interpretations"), "önizlemede yorum tablosu okundu");
      const noInterp = ownerCtx(store, TENANT_A, OWNER, { module: true, engine: true, knowledgeBank: true, providerInterpretations: false });
      const before2 = store.log.length;
      const rn = await runAstrology(noInterp, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assertNoNarrative(JSON.stringify(rn.body), "not entitled");
      assert.ok(JSON.stringify(rn.body).includes('"reason":"not_entitled"'));
      assert.ok(!store.log.slice(before2).some((l) => l.table === "astro_provider_interpretations"));
      // Yetki kapansa da veri SİLİNMEZ.
      assert.equal(store.tables.astro_provider_interpretations.length, 1);
      const noEngine = ownerCtx(store, TENANT_A, OWNER, { module: true, engine: false, knowledgeBank: true, providerInterpretations: true });
      assert.equal((await runAstrology(noEngine, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false })).status, 403);
    });

    await t("servis: revizyon — yeni doğum verisi yeni anahtar; eski revizyon + sonucu korunur; bayat expected → 409", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const rx = roxyDeps();
      await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      const r = await appendAstroRevision(ctx, pid, { expectedRevision: 1, birthDate: "1990-07-15", birthTime: "14:45", timeKnown: true, timeAccuracy: "rectified", locationId: ISTANBUL.id, changeNote: "rektifikasyon" }, resolveLoc);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const plan = await planAstrology(ctx, { profileId: pid, selections: NATAL_SEL });
      assert.equal((plan.body as { plan: { newRequestCount: number } }).plan.newRequestCount, 1, "yeni revizyon yeni hesap");
      const old = await runAstrology(ctx, { profileId: pid, revision: 1, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(rx.calls.length, 1, "eski revizyon kayıtlı sonuçtan açılır");
      assert.equal((old.body as { executed: { cachedResults: number } }).executed.cachedResults, 1);
      assert.equal(store.tables.astro_birth_profile_revisions.filter((x) => x.profile_id === pid).length, 2);
      const stale = await appendAstroRevision(ctx, pid, { expectedRevision: 1, birthDate: "1990-07-15", birthTime: "15:00", timeKnown: true, timeAccuracy: "approximate", locationId: ISTANBUL.id }, resolveLoc);
      assert.equal(stale.status, 409);
      const d = await getAstroProfileDetail(ctx, pid);
      assert.deepEqual((d.body as { profile: { revisions: { revision: number }[] } }).profile.revisions.map((x) => x.revision), [2, 1]);
    });

    await t("servis: saat bilinmiyor → sağlayıcıya 12:00:00; görünümde ev/ASC/MC yok", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx, { timeKnown: false, birthTime: null, timeAccuracy: "unknown" });
      const rx = roxyDeps();
      const r = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(rx.calls[0].body.time, "12:00:00");
      const v = (r.body as { results: { view: { timeUnknownMasked: boolean; technical: NatalTechnical } }[] }).results[0].view;
      assert.equal(v.timeUnknownMasked, true);
      assert.equal(v.technical.houses.length, 0);
      assert.equal(v.technical.angles, null);
    });

    await t("servis: eşzamanlı aynı istek (çift tık) → kilit + bekleme → TEK Roxy çağrısı", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const rx = roxyDeps({ delayMs: 40 });
      const [a, b] = await Promise.all([
        runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false }),
        runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false }),
      ]);
      assert.equal(rx.calls.length, 1, `Roxy ${rx.calls.length} kez çağrıldı`);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(store.tables.astro_provider_results.length, 1);
    });

    await t("servis: kilit aşılsa bile (çoklu instance) UNIQUE → tek satır, ikinci yanıt kayıtlıyı döner", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const rx = roxyDeps({ delayMs: 20 });
      rx.deps.rateLimit = async () => ({ allowed: true, retryAfterSec: 0 });
      const [a, b] = await Promise.all([
        runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false }),
        runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false }),
      ]);
      assert.equal(store.tables.astro_provider_results.length, 1);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
    });

    await t("servis: tenant izolasyonu — B'nin aynı-girdi sonucu A'ya verilmez; B profili/danışanı/sonucu A'dan 404", async () => {
      const store = seedStore();
      const ctxA = ownerCtx(store);
      const ctxB = ownerCtx(store, TENANT_B, OTHER_ADMIN);
      const rx = roxyDeps();
      const rb = await createAstroProfile(ctxB, { label: "B", clientId: CLIENT_B, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
      const pidB = (rb.body as { profile: { id: string } }).profile.id;
      const runB = await runAstrology(ctxB, { profileId: pidB, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      const resB = (runB.body as { results: { view: { id: string } }[] }).results[0].view.id;
      const pidA = await createProfile(ctxA);
      const planA = await planAstrology(ctxA, { profileId: pidA, selections: NATAL_SEL });
      assert.equal((planA.body as { plan: { newRequestCount: number } }).plan.newRequestCount, 1, "B'nin önbelleği A'ya sayılmamalı");
      await runAstrology(ctxA, { profileId: pidA, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(rx.calls.length, 2);
      assert.equal(store.tables.astro_provider_results.length, 2);
      assert.equal((await getAstrologyResult(ctxA, resB, { profileId: null, revision: null, ownerPreviewHideInterp: false })).status, 404);
      assert.equal((await getAstroProfileDetail(ctxA, pidB)).status, 404);
      assert.equal((await planAstrology(ctxA, { profileId: pidB, selections: NATAL_SEL })).status, 404);
      const xc = await createAstroProfile(ctxA, { label: "x", clientId: CLIENT_B, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id }, resolveLoc);
      assert.equal(xc.status, 404);
      const listA = JSON.stringify((await listAstroProfiles(ctxA)).body);
      assert.ok(!listA.includes(pidB) && !listA.includes("Başka"), "A listesinde B verisi");
    });

    await t("servis: sağlayıcı hatası / bozuk yanıt / yapılandırma yok → kayıt YOK; kayıtlı sonuç yine açılır", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const e1 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, roxyDeps({ fail: "server_error" }).deps, { ownerPreviewHideInterp: false });
      assert.equal(e1.status, 502);
      const badRaw = structuredClone(FIXTURE);
      delete badRaw.houses;
      const e2 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, roxyDeps({ raw: badRaw }).deps, { ownerPreviewHideInterp: false });
      assert.equal(e2.status, 502);
      assert.equal((store.tables.astro_provider_results ?? []).length, 0);
      const e3 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, roxyDeps({ config: false }).deps, { ownerPreviewHideInterp: false });
      assert.equal(e3.status, 503);
      assert.equal((e3.body as { code?: string }).code, "PROVIDER_NOT_CONFIGURED", "hepsi başarısızsa üst düzey kod dönmeli");
      assert.match(String((e3.body as { error?: string }).error), /yapılandırılmamış/);
      // GA-P2-05: bozuk (ücretli) yanıt karantinada → aynı girdi yeniden ÇAĞRILMAZ; owner incelemeyi kapatınca (satır silinir) serbest.
      assert.equal((store.tables.astro_provider_quarantine ?? []).length, 1, "bozuk yanıt karantinaya alınmalı");
      const blocked = roxyDeps();
      const e2b = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, blocked.deps, { ownerPreviewHideInterp: false });
      assert.equal((e2b.body as { code?: string }).code, "PROVIDER_RESPONSE_QUARANTINED");
      assert.equal(blocked.calls.length, 0);
      store.tables.astro_provider_quarantine = [];
      await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, roxyDeps().deps, { ownerPreviewHideInterp: false });
      const e4 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, roxyDeps({ config: false }).deps, { ownerPreviewHideInterp: false });
      assert.equal(e4.status, 200, "anahtar olmasa da kayıtlı sonuç açılmalı");
      const e5 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, roxyDeps({ fail: "unauthorized" }).deps, { ownerPreviewHideInterp: false });
      assert.equal(e5.status, 200, "kayıtlı sonuç sağlayıcı hatasından etkilenmez");
    });

    await t("servis: kullanıcı rate limit → 429, Roxy çağrılmaz", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const rx = roxyDeps({ limitDeny: "astro-roxy-user" });
      const r = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      assert.equal(r.status, 429);
      assert.equal(rx.calls.length, 0);
    });

    await t("servis: migration yoksa → 503 ASTRO_NOT_READY (ham DB hatası dönmez)", async () => {
      const store = seedStore();
      store.failSelect = (table) => (table === "astro_birth_profiles" ? { code: "42P01", message: 'relation "public.astro_birth_profiles" does not exist' } : null);
      // Aşama 7B: liste RPC'dir (astro_profile_page) → migration yoksa fonksiyon da yoktur.
      store.failRpc = (fn) => (fn.startsWith("astro_") ? { code: "PGRST202", message: `Could not find the function public.${fn}` } : null);
      const r = await listAstroProfiles(ownerCtx(store));
      assert.equal(r.status, 503);
      assert.equal((r.body as { code: string }).code, "ASTRO_NOT_READY");
      assert.ok(!JSON.stringify(r.body).includes("relation"));
    });

    await t("log: bilinmeyen alan YALNIZ yol olarak loglanır; loglarda anahtar/doğum verisi/koordinat/ad YOK", async () => {
      const store = seedStore();
      const ctx = ownerCtx(store);
      const pid = await createProfile(ctx);
      const rx = roxyDeps();
      await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, rx.deps, { ownerPreviewHideInterp: false });
      await runAstrology(ctx, { profileId: pid, selections: [{ technique: "western.natal", options: { houseSystem: "koch" } }] }, roxyDeps({ fail: "unauthorized" }).deps, { ownerPreviewHideInterp: false });
      const all = [...rx.logs, ...captured].join("\n");
      assert.ok(rx.logs.some((l) => l.includes("aiReading")), "bilinmeyen alan yolu loglanmalı");
      for (const bad of [API_KEY, "[RXU-", "1990-07-15", "41.0082", "28.9784", "İstanbul", "Yılmaz", "14:30"]) {
        assert.ok(!all.includes(bad), `log PII/anahtar içeriyor: ${bad}`);
      }
    });
  } finally {
    console.error = origErr;
  }

  // ─── I) GOLDEN: GERÇEK Roxy natal yanıtı (2026-10-07, tek çağrı, sentetik kişi) ─────────
  const GOLDEN = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8"));
  const goldenNarrative = collectNarrative(GOLDEN);
  const goldenDeps = () => {
    const calls: Record<string, unknown>[] = [];
    const deps: EngineDeps = {
      config: { apiKey: API_KEY, baseUrl: "https://roxy-fake.local/api/v2" },
      callProvider: async (_c, _e, body) => {
        calls.push(body);
        return { ok: true, raw: structuredClone(GOLDEN), attempts: 1 };
      },
      rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      log: () => undefined,
    };
    return { calls, deps };
  };

  await t("golden: anlatı metni envanteri çıkarıldı (planet/aspect/pattern/genel yorumlar)", () => {
    assert.ok(goldenNarrative.length >= 14 + 33 + 3 + 1, `yalnız ${goldenNarrative.length} anlatı metni`);
  });

  await t("golden: adaptör gerçek yanıtı eksiksiz eşler — düşen değer YOK, bilinmeyen alan YOK", () => {
    const p = projectRoxyNatal(GOLDEN, { houseSystem: "placidus", nodeType: "true" });
    assert.ok(p.ok, p.ok ? "" : p.errors.join("; "));
    if (!p.ok) return;
    const tech = p.value.technical;
    assert.equal(tech.bodies.length, GOLDEN.planets.length);
    assert.equal(tech.houses.length, 12);
    assert.equal(tech.aspects.length, GOLDEN.aspects.length);
    assert.equal(tech.patterns.length, GOLDEN.patterns.length);
    assert.deepEqual(p.value.droppedValues, []);
    assert.deepEqual(p.value.unmappedFields, [], "sınıflandırılmamış gerçek alan");
    // Sayısal kayıp yok: her gezegen boylamı birebir.
    for (const raw of GOLDEN.planets as { longitude: number }[]) {
      assert.ok(tech.bodies.some((b) => b.longitude === raw.longitude), "boylam kaybı");
    }
    // Teknik nitelik (aspects[].interpretation) ile sağlayıcı sayımları tutarlı.
    const n = (k: string) => tech.aspects.filter((a) => a.nature === k).length;
    assert.deepEqual(
      [n("harmonious"), n("challenging"), n("neutral")],
      [GOLDEN.aspectsInterpretation.harmonious, GOLDEN.aspectsInterpretation.challenging, GOLDEN.aspectsInterpretation.neutral],
    );
    assert.equal(tech.echo.nodeType, "true");
    assert.deepEqual(tech.variants, { lilith: "mean", node: "true" });
    assert.ok(tech.points.partOfFortune && tech.points.vertex && tech.angles);
  });

  await t("golden: bağımsız astronomi çapraz kontrolü (astronomy-engine) — gezegen ≤10″, ASC/MC ≤0.01°, Lilith=mean, düğüm=true", () => {
    const tm = Astronomy.MakeTime(new Date("1990-07-15T11:30:00Z"));
    const elon = (b: Astronomy.Body) => Astronomy.Ecliptic(Astronomy.GeoVector(b, tm, true)).elon;
    const dd = (a: number, b: number) => ((a - b + 540) % 360) - 180;
    const bodies: [string, Astronomy.Body][] = [
      ["Sun", Astronomy.Body.Sun], ["Moon", Astronomy.Body.Moon], ["Mercury", Astronomy.Body.Mercury], ["Venus", Astronomy.Body.Venus],
      ["Mars", Astronomy.Body.Mars], ["Jupiter", Astronomy.Body.Jupiter], ["Saturn", Astronomy.Body.Saturn], ["Uranus", Astronomy.Body.Uranus],
      ["Neptune", Astronomy.Body.Neptune], ["Pluto", Astronomy.Body.Pluto],
    ];
    const pl = (n: string) => (GOLDEN.planets as { name: string; longitude: number }[]).find((x) => x.name === n)!;
    for (const [n, b] of bodies) assert.ok(Math.abs(dd(pl(n).longitude, elon(b))) * 3600 <= 10, `${n}: ${(dd(pl(n).longitude, elon(b)) * 3600).toFixed(1)}″`);
    const T = tm.tt / 36525;
    const meanNode = (((125.0445479 - 1934.1362891 * T + 0.0020754 * T * T) % 360) + 360) % 360;
    const meanApogee = ((((83.3532465 + 4069.0137287 * T - 0.01032 * T * T) % 360) + 360) % 360 + 180) % 360;
    assert.ok(Math.abs(dd(pl("Black Moon Lilith").longitude, meanApogee)) < 0.2, "Lilith ortalama apoje değil");
    assert.ok(Math.abs(dd(pl("North Node").longitude, meanNode)) > 0.05, "düğüm ortalama düğümle aynı (true beklenirdi)");
    assert.ok(Math.abs(dd(pl("South Node").longitude, pl("North Node").longitude + 180)) < 1e-6);
    const lst = (Astronomy.SiderealTime(tm) * 15 + GOLDEN.birthDetails.longitude + 360) % 360;
    const r = Math.PI / 180;
    const eps = 23.4393 - 0.0000004 * tm.tt;
    const mc = ((Math.atan2(Math.sin(lst * r), Math.cos(lst * r) * Math.cos(eps * r)) / r) + 360) % 360;
    const asc = ((Math.atan2(Math.cos(lst * r), -(Math.sin(lst * r) * Math.cos(eps * r) + Math.tan(GOLDEN.birthDetails.latitude * r) * Math.sin(eps * r))) / r) + 360) % 360;
    assert.ok(Math.abs(dd(GOLDEN.ascendant.longitude, asc)) < 0.01 && Math.abs(dd(GOLDEN.midheaven.longitude, mc)) < 0.01, "ASC/MC sapması");
  });

  await t("golden: teknik katmanda sağlayıcı serbest metni YOK (kanonik kimlik denetimi)", () => {
    const p = projectRoxyNatal(GOLDEN, { houseSystem: "placidus", nodeType: "true" });
    assert.ok(p.ok);
    if (!p.ok) return;
    const json = JSON.stringify(p.value.technical);
    for (const s of goldenNarrative) assert.ok(!json.includes(s), `teknikte anlatı: ${s.slice(0, 30)}`);
    const allowed = /^([a-z][a-z_\-.0-9]*|\d{4}-\d{2}-\d{2}|\d{2}:\d{2}(:\d{2})?|tropical)$/;
    const walk = (v: unknown, path: string) => {
      if (typeof v === "string") assert.match(v, allowed, `kanonik değil: ${path}`);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(p.value.technical, "$");
  });

  await t("golden: sentetik profilin istek gövdesi gerçek çağrının yankısıyla birebir (önbellek anahtarı doğru girdiden)", () => {
    const body = buildNatalRequestBody({ birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, { houseSystem: "placidus", nodeType: "true" });
    const bd = GOLDEN.birthDetails;
    assert.deepEqual(
      [body.date, body.time, body.latitude, body.longitude, body.timezone, body.nodeType, body.houseSystem],
      [bd.date, bd.time, bd.latitude, bd.longitude, bd.timezone, bd.nodeType, GOLDEN.houseSystem],
    );
  });

  await t("golden A/B: yorum AÇIK → anlatı var; KAPALI (önizleme + yetkisiz) → anlatı YOK, teknik BİREBİR aynı, ham yanıt YOK", async () => {
    const store = seedStore();
    const ctx = ownerCtx(store);
    const pid = await createProfile(ctx);
    const g = goldenDeps();
    const a = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, g.deps, { ownerPreviewHideInterp: false });
    assert.equal(a.status, 200, JSON.stringify(a.body).slice(0, 200));
    const aJson = JSON.stringify(a.body);
    const aView = (a.body as { results: { view: { technical: unknown; interpretation: { visible: boolean; content?: { bodies: unknown[]; aspects: unknown[]; patterns: unknown[] } } } }[] }).results[0].view;
    assert.ok(aView.interpretation.visible && aView.interpretation.content!.bodies.length === 14 && aView.interpretation.content!.aspects.length === 33 && aView.interpretation.content!.patterns.length === 3);
    // A: kalıp adı/şablon anahtarı (bilinçli yok sayılan tesisat) DIŞINDAKİ tüm yorum metinleri birebir görünür.
    const plumbing = new Set<string>((GOLDEN.patterns as { name?: string; interpretationKey?: string }[]).flatMap((p) => [p.name ?? "", p.interpretationKey ?? ""]));
    const expectVisible = goldenNarrative.filter((s) => !plumbing.has(s));
    const missing = expectVisible.filter((s) => !aJson.includes(JSON.stringify(s).slice(1, -1)));
    assert.deepEqual(missing.map((s) => s.slice(0, 40)), [], "A: yorum katmanında kayıp");

    const b1 = await runAstrology(ctx, { profileId: pid, selections: NATAL_SEL }, g.deps, { ownerPreviewHideInterp: true });
    const noInterp = ownerCtx(store, TENANT_A, OWNER, { module: true, engine: true, knowledgeBank: true, providerInterpretations: false });
    const b2 = await runAstrology(noInterp, { profileId: pid, selections: NATAL_SEL }, g.deps, { ownerPreviewHideInterp: false });
    for (const [label, r] of [["önizleme", b1], ["yetkisiz", b2]] as const) {
      const json = JSON.stringify(r.body);
      for (const s of goldenNarrative) assert.ok(!json.includes(s), `${label}: anlatı sızdı → ${s.slice(0, 40)}`);
      for (const k of ["aspectInterpretation", "interpretationKey", "interpretationVars", "nameLocalized", "\"detailed\"", "Black Moon Lilith", "raw_response"]) {
        assert.ok(!json.includes(k), `${label}: ham/yorum anahtarı sızdı → ${k}`);
      }
      const v = (r.body as { results: { view: { technical: unknown } }[] }).results[0].view;
      assert.deepEqual(v.technical, aView.technical, `${label}: teknik veri eksildi/değişti`);
    }
    // Cache: ikinci ve üçüncü açılış 0 yeni sağlayıcı isteği.
    assert.equal(g.calls.length, 1, `sağlayıcı ${g.calls.length} kez çağrıldı`);
    assert.deepEqual((b1.body as { executed: object }).executed, { newResults: 0, cachedResults: 1, providerAttempts: 0 });
    resultSelectsOk(store);
    assert.ok(JSON.stringify(store.tables.astro_provider_results[0].raw_response).includes("Black Moon Lilith"), "ham yanıt sunucuda saklanmalı");
  });

  console.log(`\nastrology harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("harness çöktü:", e);
  process.exit(1);
});

void ROOT;
