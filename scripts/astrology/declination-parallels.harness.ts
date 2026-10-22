/**
 * ASTROLOJİ — DEKLİNASYON PARALELLERİ (aylık) harness'i (2026-10-22; western.declination_parallels, POST /astrology/parallels/monthly).
 *
 * Kaynaklar: (1) GERÇEK sağlayıcı yanıtı (23.10.2026; fixtures/golden/declination-parallels-monthly-2026-03.json,
 * `_kaynak: gercek-saglayici-yaniti-2026-10-23`, 27 olay); (2) OpenAPI yanıt şemasından ŞEMA-ÖRNEĞİ fixture
 * (fixtures/schema/declination-parallels-monthly.json, `_kaynak: openapi-schema-example`; yalnız biçim / fail-closed — astronomik
 * olarak gerçek değil, B4). Bu harness sağlayıcıya çağrı YAPMAZ.
 * Bağımsız doğrulama astronomy-engine ile (yalnız bu betikte; ürün kodu astronomy-engine kullanmaz).
 *
 *   A) şema örneği ↔ projeksiyon (gövde ürünün üreticisiyle aynı; bilinmeyen alan 0; yorum katmanı yok)
 *   B) bağımsız matematik: Güneş deklinasyonu 0 = Mart ekinoksu (yayımlanmış an); iki yoldan deklinasyon; Mart 2026 paralel
 *      çizelgesi (astronomy-engine) → sağlayıcı biçimli test yanıtı → projeksiyon + doğrulayıcı; şema örneği astronomik DEĞİL
 *      (doğrulayıcı yakalar); mevcut Transit takvimi golden'ının açı / burç girişi anları ≤ 0,01°
 *   C) fail-closed (≥ 10 bozuk vaka)
 *   D) motor: seçenek normalizasyonu · plan 1 istek → çalıştır (gövde şema örneğiyle BİREBİR) → önbellek 0 istek · farklı orb = yeni
 *      istek · doğum saati bilinmiyor → engel YOK ve maske YOK (doğum verisi kullanılmaz)
 *   E) kaydet → aç 0 istek · Word/PDF rapor metni · yorum katmanı yok / sızma yok · tenant / uzman 404 · not + konu türü
 *   F) mevcut tekniklerin girdi özeti DEĞİŞMEDİ (sabit hash) · UI yardımcıları · "Yakında" maddesi · güvenlik
 *   G) gerçek yanıt: saniyeli datetime kabul → projeksiyon (27 temas, Kiron / düğümler) · bağımsız doğrulayıcı (yavaş çift eşiği,
 *      en yakın yaklaşım = sıfır geçişi yok + yerel en küçük) · çalıştır / önbellek / kaydet-aç · rapor "en yakın yaklaşım" ayrımı
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/declination-parallels.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as AE from "astronomy-engine";
import { createFakeClient, createStore, type FakeStore } from "./fakeSupabase";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { createAstroProfile } from "@/lib/astrology/profiles/service";
import { planAstrology, runAstrology, type EngineCtx, type EngineDeps } from "@/lib/astrology/engine/service";
import { getTechnique, TECHNIQUE_IDS } from "@/lib/astrology/engine/techniques";
import { getAnalysis, getWorkspace, saveAnalysis, saveExpertNote } from "@/lib/astrology/analyses/service";
import { declinationParallelsBody, projectRoxyDeclinationParallels, ROXY_DECLINATION_PARALLELS } from "@/lib/astrology/providers/roxy/declinationParallels";
import {
  DECLINATION_BODIES,
  DECLINATION_PARALLELS_TECHNICAL_SCHEMA,
  isOutOfBounds,
  meanObliquityDeg,
  type DeclinationParallelsTechnical,
} from "@/lib/astrology/model/westernDeclination";
import * as DM from "@/lib/astrology/model/westernDeclination";
import { maskTechnical } from "@/lib/astrology/view/techniqueView";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { isSectionKeyForTechnique, parseAnyTopicKey, topicsForTechnique } from "@/lib/astrology/topics/index";
import { buildSelections, defaultParams, describeOptions, missingReason, TECHNIQUE_META, UI_TECHNIQUES } from "@/app/admin/astroloji/_lib/techniques";
import * as SOON from "@/app/admin/astroloji/_lib/comingSoon";
import type { ResolvedLocation } from "@/lib/astrology/birth/profileInput";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

const ROOT = join(__dirname, "..", "..");
const SCHEMA = JSON.parse(readFileSync(join(__dirname, "fixtures", "schema", "declination-parallels-monthly.json"), "utf8")) as { _kaynak: string; endpoint: string; body: Record<string, unknown>; response: J };
/** GERÇEK sağlayıcı yanıtı (23.10.2026; gövde şema örneğiyle aynı, 27 olay). */
const REAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "declination-parallels-monthly-2026-03.json"), "utf8")) as { _kaynak: string; endpoint: string; query: null; body: Record<string, unknown>; response: J };
const FORECAST = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden", "forecast.json"), "utf8")) as { response: J };
const NATAL = JSON.parse(readFileSync(join(__dirname, "fixtures", "roxy-natal-golden-2026-10-07.json"), "utf8")) as J;
const canon = (v: unknown): string =>
  v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
const A = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 };
const EXPECT = { month: "2026-03", orb: 1.5, nodeType: "true" as const };

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

// ─── Bağımsız deklinasyon (astronomy-engine; yer merkezli, görünür, tarihin ekvatoru) ──────────────────────────────────────
const AE_BODIES: Record<string, AE.Body> = {
  sun: AE.Body.Sun,
  mercury: AE.Body.Mercury,
  venus: AE.Body.Venus,
  mars: AE.Body.Mars,
  jupiter: AE.Body.Jupiter,
  saturn: AE.Body.Saturn,
  uranus: AE.Body.Uranus,
  neptune: AE.Body.Neptune,
  pluto: AE.Body.Pluto,
};
const GEO = new AE.Observer(0, 0, 0);
const decAt = (id: string, ms: number) => AE.Equator(AE_BODIES[id], new Date(ms), GEO, true, true).dec;
/** İkinci yol: tarihin gerçek ekliptiği (λ, β) + gerçek eğiklik → δ = asin(sinβ cosε + cosβ sinε sinλ). */
function decViaEcliptic(id: string, ms: number): number {
  const time = AE.MakeTime(new Date(ms));
  const v = AE.GeoVector(AE_BODIES[id], time, true);
  const e = AE.SphereFromVector(AE.RotateVector(AE.Rotation_EQJ_ECT(time), v));
  const eps = (AE.e_tilt(time).tobl * Math.PI) / 180;
  const l = (e.lon * Math.PI) / 180;
  const b = (e.lat * Math.PI) / 180;
  return (Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l)) * 180) / Math.PI;
}
type RefContact = { a: string; b: string; type: "parallel" | "contraparallel"; ms: number; d1: number; d2: number };
/** Ay içindeki paralel / kontraparalel kesinleşme anları (6 saatlik tarama + ikiye bölme, ~1 sn). */
function referenceMonth(year: number, month: number): RefContact[] {
  const ids = Object.keys(AE_BODIES);
  const t0 = Date.UTC(year, month - 1, 1);
  const t1 = Date.UTC(year, month, 1);
  const step = 6 * 3600_000;
  const out: RefContact[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      for (const type of ["parallel", "contraparallel"] as const) {
        const f = (ms: number) => (type === "parallel" ? decAt(ids[i], ms) - decAt(ids[j], ms) : decAt(ids[i], ms) + decAt(ids[j], ms));
        let pm = t0;
        let pf = f(pm);
        for (let ms = t0 + step; ms <= t1; ms += step) {
          const fv = f(ms);
          if (Math.sign(fv) !== Math.sign(pf)) {
            let lo = pm;
            let hi = ms;
            let flo = pf;
            for (let k = 0; k < 40; k++) {
              const mid = (lo + hi) / 2;
              const fm = f(mid);
              if (Math.sign(fm) === Math.sign(flo)) {
                lo = mid;
                flo = fm;
              } else hi = mid;
            }
            const at = Math.round((lo + hi) / 2);
            if (at >= t0 && at < t1) out.push({ a: ids[i], b: ids[j], type, ms: at, d1: decAt(ids[i], at), d2: decAt(ids[j], at) });
          }
          pm = ms;
          pf = fv;
        }
      }
  return out.sort((x, y) => x.ms - y.ms);
}
const NAME: Record<string, string> = { sun: "Sun", mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune", pluto: "Pluto" };
/** TEST VERİSİ: astronomy-engine çizelgesinden sağlayıcı BİÇİMLİ yanıt (ürüne / golden'a / sahte arka uca girmez). */
function providerShaped(ref: RefContact[], year: number, month: number, orb: number) {
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  return {
    year,
    month,
    timezone: 0,
    orb,
    events: ref.map((c) => {
      const iso = new Date(c.ms).toISOString();
      const d1 = r4(c.d1);
      const d2 = r4(c.d2);
      return { planet1: NAME[c.b], planet2: NAME[c.a], type: c.type, date: iso.slice(0, 10), time: iso.slice(11, 16), datetime: iso.slice(0, 16), orb: Math.round(Math.abs(c.type === "parallel" ? d1 - d2 : d1 + d2) * 100) / 100, declination1: d2, declination2: d1 };
    }),
  };
}
/** Doğrulayıcı: her temasta (astronomy-engine'in desteklediği gök cisimleri) deklinasyon farkı ve en yakın kesinleşme anı. */
function verifyAgainstEphemeris(tech: DeclinationParallelsTechnical, ref: RefContact[]): { checked: number; bad: string[] } {
  const bad: string[] = [];
  let checked = 0;
  for (const c of tech.contacts) {
    if (!(c.a in AE_BODIES) || !(c.b in AE_BODIES)) continue;
    checked += 1;
    const ms = Date.parse(c.exactUtc);
    const dA = Math.abs(decAt(c.a, ms) - c.declinationA);
    const dB = Math.abs(decAt(c.b, ms) - c.declinationB);
    const near = ref.filter((r) => r.type === c.type && ((r.a === c.a && r.b === c.b) || (r.a === c.b && r.b === c.a))).map((r) => Math.abs(r.ms - ms) / 60_000);
    const minutes = near.length ? Math.min(...near) : Infinity;
    if (dA > 0.05 || dB > 0.05 || minutes > 30) bad.push(`${c.a}-${c.b} ${c.type} ${c.exactUtc}: Δδ ${dA.toFixed(3)}/${dB.toFixed(3)}°, en yakın an ${Number.isFinite(minutes) ? minutes.toFixed(0) : "yok"} dk`);
  }
  return { checked, bad };
}

// ─── Gerçek yanıt (23.10.2026) doğrulayıcısı ──────────────────────────────────────────────────────────────────────────────
/** İşaretli fark: paralelde δa − δb, kontraparalelde δa + δb (astronomy-engine). */
const gapF = (a: string, b: string, type: "parallel" | "contraparallel") => (ms: number) => (type === "parallel" ? decAt(a, ms) - decAt(b, ms) : decAt(a, ms) + decAt(b, ms));
/** ms ± gün içinde fark fonksiyonunun sıfır geçişleri (6 saatlik tarama + ikiye bölme). */
function crossingsAround(a: string, b: string, type: "parallel" | "contraparallel", ms: number, days: number): number[] {
  const f = gapF(a, b, type);
  const step = 6 * 3600_000;
  const t0 = ms - days * 86_400_000;
  const t1 = ms + days * 86_400_000;
  const out: number[] = [];
  let pm = t0;
  let pf = f(t0);
  for (let m = t0 + step; m <= t1; m += step) {
    const fv = f(m);
    if (Math.sign(fv) !== Math.sign(pf)) {
      let lo = pm;
      let hi = m;
      let flo = pf;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (Math.sign(fm) === Math.sign(flo)) {
          lo = mid;
          flo = fm;
        } else hi = mid;
      }
      out.push(Math.round((lo + hi) / 2));
    }
    pm = m;
    pf = fv;
  }
  return out;
}
/**
 * Gerçek yanıt doğrulayıcısı (yavaş çift düzeltmesi): her doğrulanabilir temasta Δδ ≤ 0,01° ve
 *   • tam temas (orb ≤ 0,01°): bağımsız sıfır geçişine uzaklık ≤ 30 dk VEYA o anda bağımsız |δa ∓ δb| ≤ 0,01° (iki yavaş gök cisminde
 *     0,004°'lik deklinasyon farkı saatlere dönüşür — hata değil, hassasiyet);
 *   • en yakın yaklaşım (orb > 0,01°): ± 10 günde sıfır geçişi YOK, an yerel en küçük |δa ∓ δb| (± 3 saat) ve bağımsız fark ↔ orb ≤ 0,01°.
 */
function verifyRealAgainstEphemeris(tech: DeclinationParallelsTechnical): { checked: number; exact: number; nearest: number; bad: string[] } {
  const bad: string[] = [];
  let checked = 0;
  let exact = 0;
  let nearest = 0;
  for (const c of tech.contacts) {
    if (!(c.a in AE_BODIES) || !(c.b in AE_BODIES)) continue;
    checked += 1;
    const ms = Date.parse(c.exactUtc);
    const dA = Math.abs(decAt(c.a, ms) - c.declinationA);
    const dB = Math.abs(decAt(c.b, ms) - c.declinationB);
    const f = gapF(c.a, c.b, c.type);
    const gapNow = Math.abs(f(ms));
    const tag = `${c.a}-${c.b} ${c.type} ${c.exactUtc}`;
    if (dA > 0.01 || dB > 0.01) bad.push(`${tag}: Δδ ${dA.toFixed(4)}/${dB.toFixed(4)}°`);
    if (c.orb <= 0.01) {
      exact += 1;
      const cross = crossingsAround(c.a, c.b, c.type, ms, 1).map((x) => Math.abs(x - ms) / 60_000);
      const minutes = cross.length ? Math.min(...cross) : Infinity;
      if (!(minutes <= 30 || gapNow <= 0.01)) bad.push(`${tag}: tam temas, en yakın geçiş ${Number.isFinite(minutes) ? minutes.toFixed(0) : "yok"} dk, |f| ${gapNow.toFixed(4)}°`);
    } else {
      nearest += 1;
      const cross = crossingsAround(c.a, c.b, c.type, ms, 10);
      const h3 = 3 * 3600_000;
      const localMin = gapNow <= Math.abs(f(ms - h3)) && gapNow <= Math.abs(f(ms + h3));
      if (cross.length > 0 || !localMin || Math.abs(gapNow - c.orb) > 0.01) bad.push(`${tag}: en yakın yaklaşım — geçiş ${cross.length}, yerel en küçük ${localMin}, |f| ${gapNow.toFixed(4)}° ↔ orb ${c.orb}`);
    }
  }
  return { checked, exact, nearest, bad };
}

// ─── Motor ortamı ────────────────────────────────────────────────────────────────────────────────────────────────────────
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const USER_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const USER_A2 = "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c";
const CLIENT_X = "44444444-4444-4444-8444-444444444444";
const ISTANBUL: ResolvedLocation = { id: "tr-34-istanbul", label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const resolveLoc = (id: unknown) => (id === ISTANBUL.id ? ISTANBUL : null);
const FULL = resolveAstrologyEntitlements({ isOwner: true });
const seed = (): FakeStore => createStore({ clients: [{ id: CLIENT_X, tenant_id: TENANT_A, ad: "Sentetik", soyad: "A" }] });
const ctxOf = (store: FakeStore, over: Partial<EngineCtx> = {}): EngineCtx => ({ db: createFakeClient(store), tenantId: TENANT_A, userId: OWNER, entitlements: FULL, ...over });

/** Sahte sağlayıcı: YALNIZ kaynağın (şema örneği veya gerçek yanıt) BİREBİR gövdesine yanıt verir; başka gövde → 400 (yeni sonuç uydurulmaz). */
function provider(mutate?: (r: J) => void, SRC: { endpoint: string; body: Record<string, unknown>; response: J } = SCHEMA) {
  const calls: { endpoint: string; body: Record<string, unknown> }[] = [];
  const deps: EngineDeps = {
    config: { apiKey: "k-test-dp", baseUrl: "https://provider-fake.local/api/v2" },
    callProvider: async (_c, endpoint, body) => {
      calls.push({ endpoint, body });
      if (endpoint !== SRC.endpoint || canon(body) !== canon(SRC.body)) return { ok: false, kind: "bad_request", status: 400, attempts: 1 };
      const r = structuredClone(SRC.response);
      mutate?.(r);
      return { ok: true, raw: r, attempts: 1 };
    },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    log: () => undefined,
  };
  return { calls, deps };
}
async function profile(ctx: EngineCtx, over: Record<string, unknown> = {}): Promise<string> {
  const r = await createAstroProfile(ctx, { label: "Sentetik A", clientId: CLIENT_X, birthDate: "1990-07-15", birthTime: "14:30", timeKnown: true, timeAccuracy: "exact_record", locationId: ISTANBUL.id, ...over }, resolveLoc);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return (r.body as J).profile.id;
}
const DP = (month = "2026-03", orb: number | undefined = 1.5, extra: Record<string, unknown> = {}) => ({ technique: "western.declination_parallels", options: { month, ...(orb === undefined ? {} : { orb }), nodeType: "true", ...extra } });
const run = (ctx: EngineCtx, pid: string, selections: unknown[], deps: EngineDeps, hide = false) => runAstrology(ctx, { profileId: pid, selections }, deps, { ownerPreviewHideInterp: hide });
const proj = (mutate?: (r: J) => void, expect = EXPECT) => {
  const raw = structuredClone(SCHEMA.response);
  mutate?.(raw);
  return projectRoxyDeclinationParallels(raw, expect);
};

async function main() {
  // ═══ A) ŞEMA ÖRNEĞİ ↔ PROJEKSİYON ════════════════════════════════════════════
  await t("A: şema örneği işaretli; gövde ürünün üreticisiyle aynı; projeksiyon kabul; kanonik çift sırası; bilinmeyen alan 0; yorum yok", () => {
    assert.equal(SCHEMA._kaynak, "openapi-schema-example");
    assert.equal(ROXY_DECLINATION_PARALLELS.endpoint, "/astrology/parallels/monthly");
    assert.equal(canon(declinationParallelsBody(EXPECT)), canon(SCHEMA.body));
    const r = proj();
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;
    assert.deepEqual(r.unmappedFields, []);
    assert.deepEqual(r.droppedValues, []);
    assert.equal(r.interpretation, null);
    const tt = r.technical;
    assert.equal(tt.schema, DECLINATION_PARALLELS_TECHNICAL_SCHEMA);
    assert.equal(tt.month, "2026-03");
    assert.equal(tt.orbLimit, 1.5);
    assert.equal(tt.nodeType, "true");
    assert.deepEqual(tt.window, { startUtc: "2026-03-01T00:00Z", endUtc: "2026-04-01T00:00Z" });
    assert.equal(tt.contacts.length, 1);
    assert.deepEqual(tt.contacts[0], { a: "venus", b: "saturn", type: "parallel", exactUtc: "2026-03-14T09:42Z", orb: 0.01, declinationA: -12.4183, declinationB: -12.4102 });
    assert.deepEqual(tt.summary, { total: 1, parallel: 1, contraparallel: 0 });
    assert.equal(JSON.stringify(tt).includes("Saturno"), false, "yerelleştirilmiş sağlayıcı adı teknik katmana girmemeli");
  });

  // ═══ B) BAĞIMSIZ MATEMATİK ═══════════════════════════════════════════════════
  await t("B1: Güneş deklinasyonu 0 → Mart ekinoksu 2026 (yayımlanmış 20.03.2026 14:46 UTC) ±3 dk", () => {
    let lo = Date.UTC(2026, 2, 19);
    let hi = Date.UTC(2026, 2, 22);
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (decAt("sun", mid) < 0) lo = mid;
      else hi = mid;
    }
    const diff = Math.abs(lo - Date.UTC(2026, 2, 20, 14, 46)) / 60_000;
    assert.ok(diff <= 3, `fark ${diff.toFixed(1)} dk`);
  });

  await t("B2: deklinasyon iki bağımsız yoldan (ekvator koordinatı ↔ ekliptik + gerçek eğiklik) ≤ 0,01°", () => {
    for (const ms of [Date.UTC(2026, 2, 6, 18, 30), Date.UTC(1990, 6, 15, 11, 30), Date.UTC(2049, 1, 8)])
      for (const id of Object.keys(AE_BODIES)) {
        const d = Math.abs(decAt(id, ms) - decViaEcliptic(id, ms));
        assert.ok(d <= 0.01, `${id} ${new Date(ms).toISOString()}: ${d}`);
      }
  });

  await t("B3: Mart 2026 bağımsız paralel çizelgesi → sağlayıcı biçimli test yanıtı → projeksiyon (kronolojik, iki tür) → doğrulayıcı 0 sapma", () => {
    const ref = referenceMonth(2026, 3);
    assert.ok(ref.length >= 10, `çizelge ${ref.length}`);
    const vs = ref.find((c) => c.a === "venus" && c.b === "saturn" && c.type === "parallel");
    assert.ok(vs && Math.abs(vs.ms - Date.UTC(2026, 2, 6, 18, 30)) < 10 * 60_000, "Venüs–Satürn paraleli ~06.03.2026 18:30 UTC");
    assert.ok(ref.some((c) => c.type === "contraparallel"));
    const raw = providerShaped(ref, 2026, 3, 1.5);
    const r = projectRoxyDeclinationParallels(raw, EXPECT);
    assert.ok(r.ok, JSON.stringify(r).slice(0, 400));
    if (!r.ok) return;
    assert.equal(r.technical.contacts.length, ref.length);
    const times = r.technical.contacts.map((c) => c.exactUtc);
    assert.deepEqual(times, [...times].sort(), "kronolojik değil");
    // Çift kanonik sırada (BODY_IDS): sağlayıcı ters sırada verse de a < b ve deklinasyonlar birlikte yer değiştirir.
    for (const c of r.technical.contacts) assert.ok(DECLINATION_BODIES.indexOf(c.a) < DECLINATION_BODIES.indexOf(c.b), `${c.a}-${c.b}`);
    const v = verifyAgainstEphemeris(r.technical, ref);
    assert.equal(v.checked, ref.length);
    assert.deepEqual(v.bad, []);
  });

  await t("B4: şema örneği astronomik olarak GERÇEK DEĞİL — doğrulayıcı yakalar (gerçek yanıt G1–G4: 06.03 18:33)", () => {
    const r = proj();
    assert.ok(r.ok);
    if (!r.ok) return;
    const v = verifyAgainstEphemeris(r.technical, referenceMonth(2026, 3));
    assert.equal(v.checked, 1);
    assert.equal(v.bad.length, 1, "şema örneği doğrulayıcıdan geçmemeli");
    const ms = Date.UTC(2026, 2, 14, 9, 42);
    assert.ok(Math.abs(decAt("venus", ms) - 2.94) < 0.05 && Math.abs(decAt("saturn", ms) + 0.62) < 0.05);
  });

  await t("B5: mevcut Transit takvimi golden'ı (/forecast/transits) — 87 açı anında transit boylam ↔ natal ≤ 0,01°; burç girişleri sınırda ≤ 0,01°", () => {
    const natal = Object.fromEntries((NATAL.planets as J[]).map((p) => [p.name, p.longitude as number]));
    const ANG: Record<string, number> = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };
    const lonOfDate = (id: string, ms: number) => {
      const time = AE.MakeTime(new Date(ms));
      return AE.SphereFromVector(AE.RotateVector(AE.Rotation_EQJ_ECT(time), AE.GeoVector(AE_BODIES[id], time, true))).lon;
    };
    let n = 0;
    let max = 0;
    for (const e of FORECAST.response.events as J[]) {
      if (e.type !== "transit-aspect") continue;
      const id = String(e.body).toLowerCase();
      if (!(id in AE_BODIES) || natal[e.target] === undefined) continue;
      const sep = Math.abs(((((lonOfDate(id, Date.parse(e.datetime)) - natal[e.target]) % 360) + 540) % 360) - 180);
      max = Math.max(max, Math.abs(sep - ANG[e.aspect]));
      n += 1;
    }
    assert.equal(n, 87);
    assert.ok(max <= 0.01, `en büyük sapma ${max}`);
    let ing = 0;
    for (const e of FORECAST.response.events as J[]) {
      if (e.type !== "sign-ingress") continue;
      const l = lonOfDate(String(e.body).toLowerCase(), Date.parse(e.datetime));
      const edge = Math.abs(((l + 15) % 30) - 15);
      assert.ok(edge <= 0.01, `${e.body} ${e.datetime}: sınıra ${edge}°`);
      ing += 1;
    }
    assert.equal(ing, 8);
  });

  await t("B6: OOB (sınır dışı) yalnız türetilmiş gösterim — ortalama eğiklik 2026 ≈ 23,436°; |δ| > ε", () => {
    const e = meanObliquityDeg("2026-03-01T00:00Z");
    assert.ok(Math.abs(e - 23.4359) < 0.002, String(e));
    assert.equal(isOutOfBounds(24.1, "2026-03-01T00:00Z"), true);
    assert.equal(isOutOfBounds(-23.5, "2026-03-01T00:00Z"), true);
    assert.equal(isOutOfBounds(-12.4, "2026-03-01T00:00Z"), false);
  });

  // ═══ G) GERÇEK SAĞLAYICI YANITI (23.10.2026) ═════════════════════════════════
  await t("G1: gerçek yanıt işaretli; gövde ürünün üreticisiyle BİREBİR; saniyeli datetime kabul → projeksiyon 27 temas (14 paralel / 13 kontraparalel); bilinmeyen alan 0", () => {
    assert.equal(REAL._kaynak, "gercek-saglayici-yaniti-2026-10-23");
    assert.equal(REAL.endpoint, ROXY_DECLINATION_PARALLELS.endpoint);
    assert.equal(REAL.query, null);
    assert.equal(canon(declinationParallelsBody(EXPECT)), canon(REAL.body));
    assert.equal(REAL.response.events[0].datetime, "2026-03-01T06:41:00", "gerçek datetime saniyeli");
    const r = projectRoxyDeclinationParallels(structuredClone(REAL.response), EXPECT);
    assert.ok(r.ok, JSON.stringify(r).slice(0, 600));
    if (!r.ok) return;
    assert.deepEqual(r.unmappedFields, []);
    assert.deepEqual(r.droppedValues, []);
    const tt = r.technical;
    assert.equal(tt.contacts.length, 27);
    assert.deepEqual(tt.summary, { total: 27, parallel: 14, contraparallel: 13 });
    // exactUtc dakika biçimi korunur (saniye atılır; sağlayıcı saniyesi her olayda :00).
    for (const c of tt.contacts) assert.match(c.exactUtc, /^2026-03-\d{2}T\d{2}:\d{2}Z$/);
    const bodies = new Set(tt.contacts.flatMap((c) => [c.a, c.b]));
    assert.deepEqual([...bodies].sort(), ["chiron", "mars", "mercury", "neptune", "north_node", "saturn", "south_node", "sun", "venus"]);
    assert.ok(!(bodies as Set<string>).has("moon"));
    assert.deepEqual(
      tt.contacts.find((c) => c.a === "venus" && c.b === "saturn" && c.type === "parallel"),
      { a: "venus", b: "saturn", type: "parallel", exactUtc: "2026-03-06T18:33Z", orb: 0, declinationA: -0.9896, declinationB: -0.9896 },
    );
    assert.deepEqual(tt.contacts[0], { a: "mercury", b: "saturn", type: "contraparallel", exactUtc: "2026-03-01T06:41Z", orb: 1.42, declinationA: -0.1663, declinationB: -1.256 });
    // Aynı anda iki düğüm teması (Kuzey paralel / Güney kontraparalel) ayrı olaydır, yinelenen sayılmaz.
    assert.equal(tt.contacts.filter((c) => c.exactUtc === "2026-03-17T08:38Z").length, 2);
    assert.deepEqual(tt.contacts.filter((c) => c.orb > 0.01).map((c) => `${c.a}-${c.b}-${c.type}-${c.orb}`), ["mercury-saturn-contraparallel-1.42", "mercury-north_node-parallel-0.18", "mercury-south_node-contraparallel-0.18"]);
    assert.ok(!JSON.stringify(tt).includes("Localized"), "yerelleştirilmiş sağlayıcı alanı teknik katmana girmemeli");
  });

  await t("G2: gerçek yanıt bağımsız doğrulayıcıdan GEÇER — 19 doğrulanabilir temas (18 tam + 1 en yakın yaklaşım), Δδ ≤ 0,01°; Chiron / düğüm temasları (8) doğrulanamaz", () => {
    const r = projectRoxyDeclinationParallels(structuredClone(REAL.response), EXPECT);
    assert.ok(r.ok);
    if (!r.ok) return;
    const v = verifyRealAgainstEphemeris(r.technical);
    assert.equal(v.checked, 19);
    assert.equal(v.exact, 18);
    assert.equal(v.nearest, 1);
    assert.deepEqual(v.bad, []);
    assert.equal(r.technical.contacts.length - v.checked, 8);
    // Şema örneğindeki 14.03 09:42 gerçek değil; gerçek Venüs–Satürn paraleli 06.03 18:33 (bağımsız ~18:30).
    const ref = referenceMonth(2026, 3).find((c) => c.a === "venus" && c.b === "saturn" && c.type === "parallel")!;
    assert.ok(Math.abs(ref.ms - Date.UTC(2026, 2, 6, 18, 33)) <= 10 * 60_000);
    // Eski (yalnız sıfır geçişi + 30 dk) doğrulayıcı iki YANLIŞ alarm verir: yavaş Satürn–Neptün paraleli (~180 dk) ve ay içinde
    // kesinleşmeyen Merkür–Satürn kontraparaleli (geçiş yok) → eşik düzeltmesinin gerekçesi.
    const old = verifyAgainstEphemeris(r.technical, referenceMonth(2026, 3));
    assert.deepEqual(old.bad.map((x) => x.split(":")[0]).sort(), ["mercury-saturn contraparallel 2026-03-01T06", "saturn-neptune parallel 2026-03-15T05"].sort());
  });

  await t("G3: tam olmayan temas (orb > 0,01°) — Merkür–Satürn kontraparaleli ± 10 günde sıfır geçişi YOK, an yerel en küçük fark (en yakın yaklaşım)", () => {
    const ms = Date.UTC(2026, 2, 1, 6, 41);
    assert.equal(crossingsAround("mercury", "saturn", "contraparallel", ms, 10).length, 0);
    const f = gapF("mercury", "saturn", "contraparallel");
    assert.ok(Math.abs(Math.abs(f(ms)) - 1.42) <= 0.01, String(f(ms)));
    assert.ok(Math.abs(f(ms)) < Math.abs(f(ms - 6 * 3600_000)) && Math.abs(f(ms)) < Math.abs(f(ms + 6 * 3600_000)));
  });

  await t("G4: gerçek yanıtla çalıştır → kaydet → aç 0 istek; Word/PDF: UTC + İstanbul yerel saat, Kiron / Ay düğümleri, en yakın yaklaşım ayrımı", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const px = provider(undefined, REAL);
    const sel = DP("2026-03", 1.5, { displayTz: "Europe/Istanbul" });
    const r1 = (await run(ctx, pa, [sel], px.deps)).body as J;
    assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 400));
    assert.equal(px.calls.length, 1);
    assert.equal(r1.results[0].view.technical.contacts.length, 27);
    await run(ctx, pa, [sel], px.deps);
    assert.equal(px.calls.length, 1, "önbellek yeni istek yaptı");
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(px.calls.length, 1, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.equal(a.technical.contacts.length, 27);
    const lines = reportTexts(buildAstroReport(a));
    const s = lines.join("\n");
    for (const want of ["06.03.2026 18:33 UTC", "06.03.2026 21:33", "01.03.2026 06:41 UTC", "Kiron", "Kuzey Ay Düğümü", "Güney Ay Düğümü", "−0,9896°", "1,42°", "0,18°", "Tam kesinleşme", "En yakın yaklaşım (tam kesinleşme yok)"])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    // Orb > 0,01° satırları kesinleşme gibi sunulmaz: 3 satır en yakın yaklaşım, 24 satır tam kesinleşme.
    assert.equal((s.match(/En yakın yaklaşım \(tam kesinleşme yok\) — orb/g) ?? []).length, 3, s.slice(0, 200));
    for (const bad of ["undefined", "NaN", "[object Object]", "Roxy", "roxy", "parallels/monthly", "fixture", "golden", "Localized", "kesinlikle"]) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
  });

  // ═══ C) FAIL-CLOSED ══════════════════════════════════════════════════════════
  await t("C: bozuk / tutarsız yanıt → hata (sonuç yok)", () => {
    const cases: [string, (r: J) => void, string][] = [
      ["yıl yankısı", (r) => (r.year = 2027), "year"],
      ["ay yankısı", (r) => (r.month = 4), "month"],
      ["saat dilimi yankısı", (r) => (r.timezone = -4), "timezone"],
      ["orb yankısı", (r) => (r.orb = 1), "orb"],
      ["olaylar dizi değil", (r) => (r.events = {}), "events"],
      ["bilinmeyen gök cismi", (r) => (r.events[0].planet2 = "Vulcan"), "events[0]: gök cismi"],
      ["Ay (kapsam dışı)", (r) => (r.events[0].planet2 = "Moon"), "events[0]: gök cismi"],
      ["aynı cisim", (r) => (r.events[0].planet2 = "Venus"), "events[0]: aynı gök cismi"],
      ["tür", (r) => (r.events[0].type = "conjunction"), "events[0]: tür"],
      ["datetime ≠ tarih+saat", (r) => (r.events[0].datetime = "2026-03-14T09:43"), "events[0]: zaman"],
      ["datetime saniyeli ama dakika farklı", (r) => (r.events[0].datetime = "2026-03-14T09:43:00"), "events[0]: zaman"],
      ["datetime saniye 60", (r) => (r.events[0].datetime = "2026-03-14T09:42:60"), "events[0]: zaman"],
      ["datetime saniye tek hane", (r) => (r.events[0].datetime = "2026-03-14T09:42:5"), "events[0]: zaman"],
      ["datetime saniye + ek", (r) => (r.events[0].datetime = "2026-03-14T09:42:00Z"), "events[0]: zaman"],
      ["datetime milisaniyeli", (r) => (r.events[0].datetime = "2026-03-14T09:42:00.000"), "events[0]: zaman"],
      ["time saniyeli", (r) => Object.assign(r.events[0], { time: "09:42:00", datetime: "2026-03-14T09:42:00" }), "events[0]: zaman"],
      ["ay dışında tarih", (r) => Object.assign(r.events[0], { date: "2026-04-01", datetime: "2026-04-01T09:42" }), "events[0]: ay dışında"],
      ["orb sınır üstü", (r) => (r.events[0].orb = 1.7), "events[0]: orb"],
      ["deklinasyon aralık dışı", (r) => (r.events[0].declination1 = 91), "events[0]: deklinasyon"],
      ["orb ↔ deklinasyon tutarsız", (r) => (r.events[0].declination2 = -11.9), "events[0]: tutarsız"],
      ["kontraparalel işaret", (r) => (r.events[0].type = "contraparallel"), "events[0]: tutarsız"],
      ["eksik alan", (r) => delete r.events[0].declination2, "events[0]: deklinasyon"],
    ];
    for (const [label, m, e] of cases) {
      const r = proj(m);
      assert.equal(r.ok, false, label);
      if (!r.ok) assert.ok(r.errors.some((x) => x.startsWith(e)), `${label}: ${r.errors.join("; ")}`);
    }
    for (const raw of [null, [], "x", 42]) assert.equal(projectRoxyDeclinationParallels(raw, EXPECT).ok, false);
    const extra = proj((r) => (r.newField = 1));
    assert.ok(extra.ok && extra.unmappedFields.includes("newField"), "bilinmeyen alan raporlanmalı");
    const dup = proj((r) => r.events.push(structuredClone(r.events[0])));
    assert.ok(dup.ok && dup.technical.contacts.length === 1 && dup.droppedValues.length === 1, "yinelenen olay tekilleşmeli");
    const sec = proj((r) => (r.events[0].datetime = "2026-03-14T09:42:59"));
    assert.ok(sec.ok && sec.technical.contacts[0].exactUtc === "2026-03-14T09:42Z", "saniyeli datetime kabul; exactUtc dakika biçimi");
    const empty = proj((r) => (r.events = []));
    assert.ok(empty.ok && empty.technical.contacts.length === 0, "boş ay geçerli");
  });

  // ═══ D) MOTOR ════════════════════════════════════════════════════════════════
  await t("D: kayıt defteri + UI listesi + seçenek normalizasyonu (ay, orb, düğüm, gösterim saat dilimi)", () => {
    assert.ok((TECHNIQUE_IDS as readonly string[]).includes("western.declination_parallels"));
    assert.ok((UI_TECHNIQUES as readonly string[]).includes("western.declination_parallels"));
    const def = getTechnique("western.declination_parallels")!;
    assert.equal(def.family, "western");
    assert.equal(def.requiresKnownTime, false);
    assert.equal(def.requiresPartner, false);
    assert.equal(TECHNIQUE_META["western.declination_parallels"].needsTime, false);
    const now = new Date("2026-10-22T09:00:00Z");
    assert.deepEqual(def.parseOptions({ month: "2026-03" }, now), { month: "2026-03", orb: 1.5, nodeType: "true" });
    assert.deepEqual(def.parseOptions({ month: "2026-03", orb: 1, nodeType: "mean", displayTz: "Europe/Istanbul" }, now), { month: "2026-03", orb: 1, nodeType: "mean", displayTz: "Europe/Istanbul" });
    for (const bad of [{}, { month: "2026-13" }, { month: "2026-3" }, { month: "1500-01" }, { month: "2700-01" }, { month: "2026-03", orb: 3 }, { month: "2026-03", orb: "1.5" }, { month: "2026-03", nodeType: "osc" }, { month: "2026-03", displayTz: "Mars/Olympus" }])
      assert.equal(def.parseOptions(bad, now), null, JSON.stringify(bad));
    const u = def.units({ birth: A, birthUtc: "1990-07-15T11:30:00.000Z", partner: null }, def.parseOptions({ month: "2026-03" }, now)!);
    assert.equal(u.length, 1);
    assert.equal(canon(u[0].body), canon(SCHEMA.body));
    assert.ok(!JSON.stringify(u[0].body).includes("1990"), "gövde doğum verisi içermemeli");
    // Gösterim saat dilimi gövdeye / anahtara girmez.
    const u2 = def.units({ birth: A, birthUtc: "x", partner: null }, def.parseOptions({ month: "2026-03", displayTz: "America/New_York" }, now)!);
    assert.equal(u2[0].inputHash, u[0].inputHash);
    // Doğum verisi anahtara girmez (başka danışan aynı ay = aynı anahtar).
    const u3 = def.units({ birth: { ...A, birthDate: "1971-01-02", latitude: 39.9 }, birthUtc: "x", partner: null }, def.parseOptions({ month: "2026-03" }, now)!);
    assert.equal(u3[0].inputHash, u[0].inputHash);
  });

  await t("D: plan 1 yeni istek → çalıştır (gövde şema örneğiyle BİREBİR, 1 istek) → tekrar 0 istek; farklı orb = yeni istek", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const p1 = (await planAstrology(ctx, { profileId: pa, selections: [DP()] })).body as J;
    assert.equal(p1.plan.newRequestCount, 1, JSON.stringify(p1.plan).slice(0, 300));
    assert.ok(!JSON.stringify(p1.plan).includes("declination1"), "plan özeti yanıt / gövde içermemeli");
    const px = provider();
    const r1 = (await run(ctx, pa, [DP()], px.deps)).body as J;
    assert.equal(r1.ok, true, JSON.stringify(r1).slice(0, 400));
    assert.equal(px.calls.length, 1);
    assert.equal(px.calls[0].endpoint, "/astrology/parallels/monthly");
    assert.equal(canon(px.calls[0].body), canon(SCHEMA.body));
    const v = r1.results[0].view;
    assert.equal(v.technical.contacts.length, 1);
    assert.equal(v.method.nodeType, "true");
    const p2 = (await planAstrology(ctx, { profileId: pa, selections: [DP()] })).body as J;
    assert.equal(p2.plan.newRequestCount, 0);
    await run(ctx, pa, [DP("2026-03", 1.5, { displayTz: "Europe/Istanbul" })], px.deps);
    assert.equal(px.calls.length, 1, "gösterim saat dilimi yeni istek yaptı");
    const p3 = (await planAstrology(ctx, { profileId: pa, selections: [DP("2026-03", 1)] })).body as J;
    assert.equal(p3.plan.newRequestCount, 1);
    const p4 = (await planAstrology(ctx, { profileId: pa, selections: [DP("2026-04")] })).body as J;
    assert.equal(p4.plan.newRequestCount, 1);
  });

  await t("D: doğum saati bilinmiyor → engel yok (doğum verisi kullanılmaz), sonuç maskelenmez", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx, { birthTime: undefined, timeKnown: false, timeAccuracy: undefined });
    const px = provider();
    const r = (await run(ctx, pa, [DP()], px.deps)).body as J;
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    assert.equal(px.calls.length, 1);
    assert.ok(!JSON.stringify(r).includes("TIME_REQUIRED"));
    const m = maskTechnical("western.declination_parallels", r.results[0].view.technical, { primary: false, partner: null });
    assert.equal(m.masked, false);
    assert.equal(r.results[0].view.technical.contacts.length, 1);
  });

  await t("D: bozuk yanıt → sonuç yok, kayıt yapılamaz", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const corrupt = (await run(ctx, pa, [DP()], provider((r) => (r.events[0].declination2 = 5)).deps)).body as J;
    assert.ok(!corrupt.ok || !corrupt.results?.some((x: J) => x.view?.technical), "bozuk yanıt sonuç üretti");
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...DP(), saveRequestId: randomUUID() }, false);
    assert.notEqual(sv.status, 201, "hesaplanmamış sonuç kaydedildi");
  });

  // ═══ E) KAYIT / ARŞİV / RAPOR / YETKİ / NOT / KONU ════════════════════════════
  await t("E: kaydet → aç 0 istek; Word/PDF rapor metni (UTC + yerel saat, tür, deklinasyonlar, yöntem / kapsam); sağlayıcı adı / ham uç yok", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    await saveExpertNote(ctx, { profileId: pa, technique: "western.declination_parallels", noteContext: null, sectionKey: "overall", body: "Paralel uzman notu", expectedRevision: null });
    const px = provider();
    const sel = DP("2026-03", 1.5, { displayTz: "Europe/Istanbul" });
    await run(ctx, pa, [sel], px.deps);
    const n = px.calls.length;
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...sel, saveRequestId: randomUUID() }, false);
    assert.equal(sv.status, 201, JSON.stringify(sv.body));
    const a = ((await getAnalysis(ctx, (sv.body as J).analysisId, false)).body as J).analysis;
    assert.equal(px.calls.length, n, "kayıtlı analizi açmak sağlayıcı çağırdı");
    assert.equal(a.technical.contacts.length, 1);
    assert.equal(a.params.displayTz, "Europe/Istanbul");
    const s = reportTexts(buildAstroReport(a)).join("\n");
    for (const want of [
      "Deklinasyon paralelleri",
      "Mart 2026",
      "Paralel",
      "Venüs",
      "Satürn",
      "14.03.2026 09:42 UTC",
      "14.03.2026 12:42",
      "−12,4183°",
      "−12,4102°",
      "0,01°",
      "Yöntem: deklinasyon paralelleri",
      "Ay dahil değildir",
      "Paralel uzman notu",
    ])
      assert.ok(s.includes(want), `rapor: "${want}" yok`);
    for (const bad of ["undefined", "NaN", "[object Object]", "Roxy", "roxy", "parallels/monthly", "fixture", "golden", "Saturno", "kesinlikle"]) assert.ok(!s.includes(bad), `rapor: "${bad}" olmamalı`);
  });

  await t("E: yorum katmanı yok — sağlayıcı yerelleştirilmiş metni yanıtta YOK; yetkisiz uzmanda teknik aynı", async () => {
    const store = seed();
    const ctx = ctxOf(store, { entitlements: { ...FULL, providerInterpretations: false } });
    const pa = await profile(ctx);
    const body = (await run(ctx, pa, [DP()], provider().deps)).body as J;
    assert.equal(body.ok, true, JSON.stringify(body).slice(0, 300));
    assert.equal(body.results[0].view.interpretation?.visible ?? false, false);
    assert.ok(!JSON.stringify(body).includes("Saturno"), "yerelleştirilmiş sağlayıcı metni sızdı");
    assert.equal(body.results[0].view.technical.contacts.length, 1);
    const store2 = seed();
    const ctx2 = ctxOf(store2);
    const pb = await profile(ctx2);
    const owner = (await run(ctx2, pb, [DP()], provider().deps)).body as J;
    assert.ok(!JSON.stringify(owner).includes("Saturno"));
  });

  await t("E: izolasyon — başka tenant ve aynı tenant'taki başka uzman analizi açamaz / çalıştıramaz / not yazamaz (404)", async () => {
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    const px = provider();
    await run(ctx, pa, [DP()], px.deps);
    const sv = await saveAnalysis(ctx, { profileId: pa, revision: 1, ...DP(), saveRequestId: randomUUID() }, false);
    const id = (sv.body as J).analysisId;
    assert.equal((await getAnalysis(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), id, false)).status, 404);
    assert.equal((await getAnalysis(ctxOf(store, { userId: USER_A2 }), id, false)).status, 404);
    assert.equal((await run(ctxOf(store, { tenantId: TENANT_B, userId: USER_B }), pa, [DP()], px.deps)).status, 404);
    assert.equal((await saveExpertNote(ctxOf(store, { userId: USER_A2 }), { profileId: pa, technique: "western.declination_parallels", noteContext: null, sectionKey: "overall", body: "x", expectedRevision: null })).status, 404);
  });

  await t("E: konu türü — declination_parallel / declination_contraparallel kendi bağlamında; çalışma alanında konu + not", async () => {
    const k = "declination_parallel:venus:saturn";
    const parsed = parseAnyTopicKey("western", k);
    assert.ok(parsed && parsed.context === "declination" && parsed.label.includes("Venüs") && parsed.label.includes("Satürn"), JSON.stringify(parsed));
    assert.ok(/^[a-z][a-z_]{1,40}(:[a-z0-9_\-]{1,40}){1,4}$/.test(k), "KB konu anahtarı DB biçimine uymalı");
    assert.equal(parseAnyTopicKey("western", "declination_parallel:venus:venus"), null);
    assert.equal(parseAnyTopicKey("western", "declination_parallel:moon:saturn"), null);
    assert.ok(parseAnyTopicKey("western", "declination_contraparallel:sun:mars"));
    assert.ok(isSectionKeyForTechnique("western.declination_parallels", k));
    assert.equal(isSectionKeyForTechnique("western.transit", k), false, "transit bağlamına karışmamalı");
    assert.equal(isSectionKeyForTechnique("western.declination_parallels", "transit_aspect:mars:square:sun"), false);
    assert.equal(topicsForTechnique("western.declination_parallels", null).length, 0);
    const store = seed();
    const ctx = ctxOf(store);
    const pa = await profile(ctx);
    await run(ctx, pa, [DP()], provider().deps);
    assert.equal((await saveExpertNote(ctx, { profileId: pa, technique: "western.declination_parallels", noteContext: null, sectionKey: k, body: "Venüs ∥ Satürn notu", expectedRevision: null })).status, 201);
    const ws = (await getWorkspace(ctx, { profileId: pa, revision: 1, ...DP() })).body as J;
    assert.equal(ws.ok, true, JSON.stringify(ws).slice(0, 300));
    assert.ok(ws.topics.some((x: J) => x.key === k), JSON.stringify(ws.topics).slice(0, 200));
    assert.deepEqual(ws.notes.map((x: J) => x.body), ["Venüs ∥ Satürn notu"]);
  });

  // ═══ F) MEVCUT TEKNİKLER DEĞİŞMEDİ · UI · GÜVENLİK ═════════════════════════════
  await t("F: mevcut tekniklerin girdi özeti DEĞİŞMEDİ (sabit hash; taban 40f31195)", () => {
    const ctx = { birth: A, birthUtc: "1990-07-15T11:30:00.000Z", partner: null };
    const h = (id: string, opt: Record<string, unknown>) => getTechnique(id as never)!.units(ctx, getTechnique(id as never)!.parseOptions(opt, new Date("2026-10-22T09:00:00Z"))!).map((u) => u.inputHash).join(",");
    for (const [id, opt, want] of FIXED) assert.equal(h(id, opt), want, `${id} ${JSON.stringify(opt)}`);
  });

  await t("F: UI — seçim {month, orb, nodeType, displayTz}; özet Türkçe; eksik / geçersiz ay plana girmez", () => {
    const p = defaultParams(new Date("2026-10-22T09:00:00Z"));
    const method = { houseSystem: "placidus" as const, nodeType: "true" as const };
    assert.deepEqual(buildSelections({ "western.declination_parallels": true }, p, method), [{ technique: "western.declination_parallels", options: { month: "2026-10", orb: 1.5, nodeType: "true", displayTz: "Europe/Istanbul" } }]);
    const p2 = { ...p, declinationMonth: "2026-03", declinationOrb: 1, declinationTz: "UTC" };
    assert.deepEqual(buildSelections({ "western.declination_parallels": true }, p2, { ...method, nodeType: "mean" }), [{ technique: "western.declination_parallels", options: { month: "2026-03", orb: 1, nodeType: "mean", displayTz: "UTC" } }]);
    assert.equal(describeOptions("western.declination_parallels", { month: "2026-03", orb: 1.5, nodeType: "true", displayTz: "Europe/Istanbul" }), "Mart 2026 · orb 1,5° · gerçek düğüm · Europe/Istanbul");
    const p3 = { ...p, declinationMonth: "0002-10" };
    assert.deepEqual(buildSelections({ "western.declination_parallels": true }, p3, method), []);
    assert.ok(missingReason("western.declination_parallels", p3));
    assert.equal(missingReason("western.declination_parallels", p), null);
  });

  await t("F: tam kesinleşme / en yakın yaklaşım ayrımı — eşik 0,01°; ekran ve rapor aynı etiketi kullanır", () => {
    assert.equal(DM.DECLINATION_EXACT_ORB_MAX, 0.01);
    assert.equal(DM.isExactContact(0), true);
    assert.equal(DM.isExactContact(0.01), true);
    assert.equal(DM.isExactContact(0.18), false);
    assert.equal(DM.declinationStatusLabel(0), "Tam kesinleşme");
    assert.equal(DM.declinationStatusLabel(1.42), "En yakın yaklaşım (tam kesinleşme yok) — orb 1,42°");
    assert.deepEqual(DM.declinationExactCounts([{ orb: 0 }, { orb: 1.42 }, { orb: 0.01 }]), { exact: 2, nearest: 1 });
    const panel = readFileSync(join(ROOT, "app/admin/astroloji/_components/DeclinationParallelsPanel.tsx"), "utf8");
    for (const want of ["DECLINATION_TIME_HEADER", "declinationStatusLabel(c.orb)", "data-dp-exact", "astro-declination-exact-summary", "DECLINATION_EXACT_NOTE"]) assert.ok(panel.includes(want), `panel: ${want}`);
    assert.ok(!panel.includes(">Kesinleşme (UTC)<"), "eski sütun başlığı kalmamalı");
  });

  await t("F: 'Yakında' — 'Deklinasyon Paralelleri' maddesi teknik açılınca gizlenir; diğer maddeler (Ekliptik Geçişleri vb.) kalır", () => {
    // Panel yazı tipi yüklediği için içe aktarılmaz (panchanga-hours deseni): bölümler kaynak metinden okunur.
    const src = readFileSync(join(ROOT, "app/admin/astroloji/_components/atlas/ComingSoonPanel.tsx"), "utf8");
    const block = src.slice(src.indexOf("COMING_SOON_SECTIONS"), src.indexOf("/** Yalnız henüz"));
    const sections = [...block.matchAll(/items: \[([\s\S]*?)\]/g)].map((m) => ({ items: [...m[1].matchAll(/"([^"\n]+)"/g)].map((x) => x[1]) }));
    assert.equal(sections.filter((x) => x.items.includes("Deklinasyon Paralelleri")).length, 2, "madde iki bölümde");
    assert.equal(SOON.COMING_SOON_AVAILABLE_AS["Deklinasyon Paralelleri"], "western.declination_parallels");
    const items = SOON.visibleComingSoonSections(sections, SOON.AVAILABLE_TECHNIQUES).flatMap((x) => x.items);
    assert.ok(!items.includes("Deklinasyon Paralelleri"));
    for (const keep of ["Ekliptik Geçişleri", "Ayrıntılı Transit–Natal Açıları", "Astrolojik Zaman Çizelgesi", "Önemli Tarihler"]) assert.ok(items.includes(keep), keep);
  });

  await t("güvenlik: istemci dosyaları sağlayıcı istemcisini / anahtarı / astronomy-engine'i içe aktarmaz; kullanıcı metninde sağlayıcı adı yok", () => {
    for (const f of [
      "app/admin/astroloji/_components/DeclinationParallelsPanel.tsx",
      "app/admin/astroloji/_components/DeclinationParallelsFields.tsx",
      "lib/astrology/model/westernDeclination.ts",
      "lib/astrology/report/declinationParallelsReport.ts",
    ]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      assert.ok(!src.includes("providers/roxy") && !src.includes("ROXY_API_KEY") && !src.includes("process.env") && !src.includes("astronomy-engine"), f);
      assert.ok(!/roxy/i.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), `${f}: sağlayıcı adı`);
      assert.ok(!/parallels\/monthly|golden|fixture/.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), `${f}: ham uç / iç terim`);
    }
  });

  console.log(`\nastrology declination-parallels harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

// Sabit girdi özetleri (taban origin/main 40f31195 üzerinde hesaplandı; mevcut tekniklerin gövde / adaptör / anahtarı değişirse test düşer).
const FIXED: [string, Record<string, unknown>, string][] = [
  ["western.natal", { houseSystem: "placidus", nodeType: "true" }, "6ebb8ad39201c478fb7fee2cd6094fe4bfbb936c90701182ceb51c8a11a9a822"],
  ["western.forecast", { startDate: "2026-10-01", days: 90 }, "7eb172768ac82aa2a73df119d9790584902fc92ee64fa662c2196aaea2751d80"],
  [
    "western.forecast",
    { startDate: "2026-10-01", days: 366, displayTz: "Europe/Istanbul" },
    "7eb172768ac82aa2a73df119d9790584902fc92ee64fa662c2196aaea2751d80,dfbc35f86e648924dc4c769e3df6a69394ceb1009c9fdfe0da65898d8e89edf2,50f76af1d0097b192ab20dd9d4a7786132a9e501c2b155fb114c4ac01b947df0,94f355183e739fe3833d8aea1f580c1a4bbcda05c31f2f7039a423061d2ce630,ad832b0578f5468b5fd7ebcaae03efdded20f96a9a48e68d0546816f06dcb063",
  ],
  ["western.transit", { atUtc: "2026-10-22T09:00", nodeType: "true" }, "9375ab009bfaf5ff4721396a5f5c35c1e1e6fa62b681d6913f46e665bf40f72a"],
  ["western.solar_return", { returnYear: 2026, houseSystem: "placidus" }, "2985cb59dd678dd794449b33f3878f7beddaa55eae870ff3c4c390e80d86af34"],
  ["western.progression", { targetDate: "2026-10-22", nodeType: "true" }, "164fe36af65936d2088b982f1c0e4b4629d5bf38e4cb61216d79e05009d454d7"],
  ["western.planetary_return", { planet: "saturn", approxDate: "2049-02-01" }, "e922ead4ec1384369187caba262e14021f261773750416a843a9f43c07c90dcb"],
];

void main().catch((e) => {
  console.error("declination-parallels harness çöktü:", e);
  process.exit(1);
});
