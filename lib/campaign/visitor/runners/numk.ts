/**
 * KM-3 — Klasik Numeroloji (Pisagor + Kalde). Sağlayıcı: Roxy /numerology/* (istek başına 1 kredi; catalog azamisi tavan).
 * MEVCUT servis değişmeden kullanılır (computeClassicResult: doğrulama + plan + normalizasyon + oracle doğrulaması +
 * Klasik Numeroloji'nin kendi kota tabanı). Kampanya farkları:
 *   - Roxy çağrısı YALNIZ kampanya rezervasyonuna bağlı guardedFetch ile (kampanya kotası + uzman payı DB'de);
 *   - önbellek KAPALI (kişisel veri saklanmaz); uzman Klasik Numeroloji sağlayıcı defterine kampanya satırı YAZILMAZ
 *     (defter OKUMASI — ortak kota tabanı — aynen çalışır); analiz kaydı oluşturulmaz.
 * Yorum: sağlayıcının anlam metinleri yalnız Owner modül + teknik anahtarları açıksa. Taş önerileri / stok ASLA eklenmez.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeClassicResult, type ClassicServiceCtx } from "@/lib/numeroloji-klasik/server/service";
import { buildClassicServiceDeps } from "@/lib/numeroloji-klasik/server/deps";
import { callClassicEndpoint } from "@/lib/numeroloji-klasik/server/providerClient";
import { CLASSIC_TECHNIQUES, canonicalBusinessName, type ClassicAnalysisRequest } from "@/lib/numeroloji-klasik/input";
import type { BridgeResult, ChaldeanResult, ChartResult, ClassicNumber, CompatibilityResult, DailyResult, DualResult, PersonalDayResult, BusinessNameResult } from "@/lib/numeroloji-klasik/model";
import { guardedFetch, type GuardDenial } from "../roxyGuard";
import type { ResultBlock } from "../types";
import { F, done, istanbulToday, notFuture, onlyKeys, parseDate, parseName, trDate, type FieldErrors, type RunContext, type RunOutcome, type VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/numk");

/** Kampanyanın sözde kiracısı: Klasik Numeroloji servisinin kota anahtarları için sabit kimlik (uzman verisiyle karışmaz). */
export const CAMPAIGN_PSEUDO_TENANT = "00000000-0000-4000-8000-00000000c0de";
const BIRTH_RANGE = { min: 1900, max: 2100 };
const NK_LEDGER = "numerology_classic_provider_calls";

/** Uzman defterine YAZMAYAN db sarmalayıcısı (okumalar ve diğer tablolar aynen). */
export function campaignClassicDb(db: Pick<SupabaseClient, "rpc" | "from">): SupabaseClient {
  return new Proxy(db as SupabaseClient, {
    get(target, prop, recv) {
      if (prop === "from") {
        return (table: string) => {
          const real = target.from(table);
          if (table !== NK_LEDGER) return real;
          return new Proxy(real, { get: (t, p, r) => (p === "insert" || p === "upsert" || p === "update" || p === "delete" ? async () => ({ data: null, error: null }) : Reflect.get(t, p, r)) });
        };
      }
      return Reflect.get(target, prop, recv);
    },
  });
}

const n = (x: ClassicNumber | null | undefined) => (x ? String(x.value) : "—");

function renderChart(c: ChartResult, comments: boolean, out: ResultBlock[]) {
  const core = c.core;
  out.push({ type: "kv", title: "Çekirdek sayılar (Pisagor)", rows: [["Hayat Yolu", n(core.lifePath)], ["İfade", n(core.expression)], ["Ruh Güdüsü", n(core.soulUrge)], ["Kişilik", n(core.personality)], ["Doğum Günü", n(core.birthDay)], ["Olgunluk", n(core.maturity)]] });
  out.push({ type: "kv", title: "Karmik ve döngüler", rows: [["Eksik sayılar (karmik dersler)", c.karmicLessons.missingNumbers.join(", ") || "Yok"], ["Karmik borç", c.karmicDebt.hasKarmicDebt ? c.karmicDebt.debtNumbers.join(", ") : "Yok"], ["Kişisel yıl", String(c.personalYear.personalYear)], ["Kişisel ay", String(c.personalYear.personalMonth.personalMonth)]] });
  out.push({ type: "table", title: "Zirveler", head: ["Sıra", "Sayı", "Yaş"], rows: c.pinnacles.map((p) => [String(p.position), String(p.number), `${p.startAge}–${p.endAge ?? "…"}`]) });
  out.push({ type: "table", title: "Mücadeleler", head: ["Sıra", "Sayı", "Yaş"], rows: c.challenges.map((p) => [String(p.position), String(p.number), `${p.startAge}–${p.endAge ?? "…"}`]) });
  if (!comments) return;
  for (const [label, num] of [["Hayat Yolu", core.lifePath], ["İfade", core.expression], ["Ruh Güdüsü", core.soulUrge], ["Kişilik", core.personality]] as const) {
    if (num.meaning?.description) out.push({ type: "text", title: `${label} ${num.value} — ${num.meaning.title}`, text: num.meaning.description, kind: "yorum" });
  }
  if (c.personalYear.forecast) out.push({ type: "text", title: `Kişisel yıl ${c.personalYear.personalYear} — ${c.personalYear.theme}`, text: c.personalYear.forecast, kind: "yorum" });
  if (c.summary) out.push({ type: "text", title: "Özet", text: c.summary, kind: "yorum" });
}

function renderLabel(label: string, v: unknown, comments: boolean, out: ResultBlock[]) {
  switch (label) {
    case "chart":
      return renderChart(v as ChartResult, comments, out);
    case "bridge": {
      const b = v as BridgeResult;
      const items = [["Hayat Yolu – İfade", b.lifePathExpression], ["İfade – Ruh Güdüsü", b.expressionSoulUrge], ["Ruh Güdüsü – Kişilik", b.soulUrgePersonality], ["İfade – Kişilik", b.expressionPersonality]] as const;
      out.push({ type: "table", title: "Köprü sayıları", head: ["Köprü", "Sayılar", "Köprü sayısı"], rows: items.map(([l, i]) => [l, `${i.from.number} ↔ ${i.to.number}`, String(i.bridge)]) });
      if (comments) for (const [l, i] of items) if (i.meaning) out.push({ type: "text", title: l, text: i.meaning, kind: "yorum" });
      return;
    }
    case "personal_day": {
      const p = v as PersonalDayResult;
      out.push({ type: "kv", title: `Kişisel gün — ${p.targetDate}`, rows: [["Kişisel gün", String(p.personalDay)], ["Kişisel ay", String(p.personalMonth)], ["Kişisel yıl", String(p.personalYear)]] });
      if (comments) out.push({ type: "text", title: p.theme || "Günün teması", text: [p.guidance, p.personalMonthTheme && `Ay: ${p.personalMonthTheme}`, p.personalYearTheme && `Yıl: ${p.personalYearTheme}`].filter(Boolean).join("\n"), kind: "yorum" });
      return;
    }
    case "daily": {
      const d = v as DailyResult;
      out.push({ type: "kv", title: `Günün sayısı — ${d.date}`, rows: [["Sayı", n(d.number)]] });
      if (comments && d.dailyMessage) out.push({ type: "text", title: "Günün mesajı (sembolik)", text: d.dailyMessage, kind: "yorum" });
      return;
    }
    case "chaldean": {
      const c = v as ChaldeanResult;
      out.push({ type: "kv", title: "Kalde sistemi", rows: [["Kader", `${c.destiny.compound ?? c.destiny.total}/${c.destiny.root}`], ["Ruh Güdüsü", `${c.soulUrge.compound ?? c.soulUrge.total}/${c.soulUrge.root}`], ["Kişilik", `${c.personality.compound ?? c.personality.total}/${c.personality.root}`], ["Gezegen", c.numberMeaning?.planet ?? "—"]] });
      if (comments) {
        if (c.numberMeaning?.meaning) out.push({ type: "text", title: c.numberMeaning.title, text: c.numberMeaning.meaning, kind: "yorum" });
        if (c.summary) out.push({ type: "text", title: "Özet", text: c.summary, kind: "yorum" });
      }
      return;
    }
    case "dual": {
      const d = v as DualResult;
      out.push({ type: "kv", title: "İki sistem karşılaştırması", rows: [["Pisagor", n(d.pythagorean)], ["Kalde", `${d.chaldean.compound ?? d.chaldean.total}/${d.chaldean.root}`], ["Uyum", d.agreement ? "İki sistem aynı sonuçta" : "Sistemler farklı sonuçta"]] });
      if (comments && d.note) out.push({ type: "text", title: "Not", text: d.note, kind: "yorum" });
      return;
    }
    case "compatibility": {
      const c = v as CompatibilityResult;
      out.push({ type: "kv", title: "Uyum", rows: [["Genel puan", `%${c.overallScore}`], ["Değerlendirme", c.rating], ["Hayat Yolu", `${c.lifePath.person1} ↔ ${c.lifePath.person2} (%${c.lifePath.compatibility})`], ["İfade", `${c.expression.person1} ↔ ${c.expression.person2} (%${c.expression.compatibility})`], ["Ruh Güdüsü", `${c.soulUrge.person1} ↔ ${c.soulUrge.person2} (%${c.soulUrge.compatibility})`]] });
      if (comments) {
        if (c.strengths.length) out.push({ type: "list", title: "Güçlü yönler", items: c.strengths, kind: "yorum" });
        if (c.challenges.length) out.push({ type: "list", title: "Zorlayıcı yönler", items: c.challenges, kind: "yorum" });
        if (c.advice) out.push({ type: "text", title: "Öneri", text: c.advice, kind: "yorum" });
      }
      return;
    }
    case "business_name": {
      const b = v as BusinessNameResult;
      const R: Record<string, string> = { excellent: "Çok uygun", good: "Uygun", caution: "Dikkat", avoid: "Kaçınılması önerilir" };
      out.push({ type: "kv", title: `İşletme adı — ${b.name}`, rows: [["Kalde sayısı", `${b.number.compound ?? b.number.total}/${b.number.root}`], ["Gezegen", b.planet], ["Değerlendirme", R[b.rating] ?? b.rating]] });
      if (comments) {
        if (b.industries.length) out.push({ type: "list", title: "Uygun sektörler", items: b.industries, kind: "yorum" });
        if (b.guidance) out.push({ type: "text", title: "Öneri", text: b.guidance, kind: "yorum" });
      }
      return;
    }
  }
}

const LABEL_ORDER = ["chart", "chaldean", "dual", "bridge", "personal_day", "daily", "compatibility", "business_name"];

async function runClassic(ctx: RunContext, req: ClassicAnalysisRequest, title: string, subtitle: string): Promise<RunOutcome> {
  const denials: GuardDenial[] = [];
  const base = await buildClassicServiceDeps(ctx.db as SupabaseClient, ctx.env);
  if (!base.config) return { ok: false, code: "saglayici", message: "Bu analiz şu anda kullanılamıyor." };
  const fetchImpl = guardedFetch(ctx.guard, ctx.db, base.config.baseUrl, "numerology", { fetchImpl: ctx.fetchImpl, denials });
  const sctx: ClassicServiceCtx = { db: campaignClassicDb(ctx.db), tenantId: CAMPAIGN_PSEUDO_TENANT, userId: CAMPAIGN_PSEUDO_TENANT, isDemo: false, canLinkClients: false };
  const r = await computeClassicResult(sctx, req, {
    ...base,
    ...((ctx.classicTestOverrides ?? {}) as Partial<typeof base>),
    cacheDisabled: true,
    callProvider: (cfg, id, payload, o) => callClassicEndpoint(cfg, id, payload, { ...o, fetchImpl }),
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    now: () => ctx.now,
  });
  if (r.body.ok !== true) {
    if (r.status === 400 || r.status === 422) return { ok: false, code: "girdi", message: r.body.error };
    return { ok: false, code: denials.length ? "kota" : "saglayici", message: "Hesaplama şu anda yapılamadı. Lütfen daha sonra tekrar deneyin." };
  }
  const result = r.body.computed.result;
  const blocks: ResultBlock[] = [];
  for (const label of LABEL_ORDER) if (result[label]) renderLabel(label, result[label], ctx.commentsEnabled, blocks);
  return {
    ok: true,
    result: {
      title,
      subtitle,
      blocks,
      notes: ctx.commentsEnabled ? ["Yorumlar hesaplama altyapısının genel anlam metinleridir; kişiye özel uzman değerlendirmesi değildir."] : ["Yorumlar bu kampanyada kapalı. Yorumlu raporlar profesyonel üyelikte."],
      commentsShown: ctx.commentsEnabled && blocks.some((b) => b.type !== "kv" && b.type !== "table" && (b as { kind?: string }).kind === "yorum"),
    },
  };
}

type PersonIn = { fullName: string; birth: { year: number; month: number; day: number; iso: string }; target: string | null };

function personRunner(key: string, techniques: readonly string[], title: string, withTarget: boolean): VisitorRunner<PersonIn> {
  return {
    key,
    kind: "provider",
    formLabel: withTarget ? "Ad soyad, doğum tarihi ve bakılacak tarih" : "Ad soyad ve doğum tarihi",
    fields: [F.name, F.birthDate, ...(withTarget ? [{ k: "targetDate", label: "Bakılacak tarih", type: "date", hint: "Boş bırakılırsa bugün." } as const] : [])],
    parse(input, now) {
      const bad = onlyKeys(input, withTarget ? ["name", "birthDate", "targetDate"] : ["name", "birthDate"]);
      if (bad) return { ok: false, errors: bad };
      const errors: FieldErrors = {};
      const fullName = parseName(input, "name", errors);
      const birth = parseDate(input, "birthDate", errors, BIRTH_RANGE);
      notFuture(birth, "birthDate", errors, istanbulToday(now).iso);
      const t = withTarget ? parseDate(input, "targetDate", errors, BIRTH_RANGE, false) : null;
      if (t && birth && t.iso < birth.iso) errors.targetDate = "Bakılacak tarih doğum tarihinden önce olamaz.";
      return done(errors, { fullName, birth: birth!, target: t?.iso ?? null });
    },
    run(ctx, v) {
      const req: ClassicAnalysisRequest = {
        kind: "person", title: "Kampanya", clientId: null, techniques: [...techniques],
        input: { fullName: v.fullName, birth: { year: v.birth.year, month: v.birth.month, day: v.birth.day }, ...(v.target ? { targetDate: v.target } : {}) },
      };
      return runClassic(ctx, req, title, `${v.fullName} · ${trDate(v.birth)}`);
    },
  };
}

type RelIn = { p1: { name: string; birth: { year: number; month: number; day: number; iso: string } }; p2: { name: string; birth: { year: number; month: number; day: number; iso: string } } };

const compatibility: VisitorRunner<RelIn> = {
  key: "numk:compatibility",
  kind: "provider",
  formLabel: "İki kişinin adı ve doğum tarihi",
  fields: [
    { ...F.name, k: "name1", label: "1. kişi — ad soyad" },
    { ...F.birthDate, k: "birthDate1", label: "1. kişi — doğum tarihi" },
    { ...F.name, k: "name2", label: "2. kişi — ad soyad" },
    { ...F.birthDate, k: "birthDate2", label: "2. kişi — doğum tarihi" },
  ],
  parse(input, now) {
    const bad = onlyKeys(input, ["name1", "birthDate1", "name2", "birthDate2"]);
    if (bad) return { ok: false, errors: bad };
    const errors: FieldErrors = {};
    const today = istanbulToday(now).iso;
    const name1 = parseName(input, "name1", errors), name2 = parseName(input, "name2", errors);
    const b1 = parseDate(input, "birthDate1", errors, BIRTH_RANGE), b2 = parseDate(input, "birthDate2", errors, BIRTH_RANGE);
    notFuture(b1, "birthDate1", errors, today);
    notFuture(b2, "birthDate2", errors, today);
    return done(errors, { p1: { name: name1, birth: b1! }, p2: { name: name2, birth: b2! } });
  },
  run(ctx, v) {
    const bd = (b: RelIn["p1"]["birth"]) => ({ year: b.year, month: b.month, day: b.day });
    return runClassic(ctx, { kind: "relationship", title: "Kampanya", clientId: null, techniques: ["compatibility"], input: { person1: { fullName: v.p1.name, birth: bd(v.p1.birth) }, person2: { fullName: v.p2.name, birth: bd(v.p2.birth) } } }, "Numeroloji uyumu", `${v.p1.name} & ${v.p2.name}`);
  },
};

const businessName: VisitorRunner<{ name: string }> = {
  key: "numk:business_name",
  kind: "provider",
  formLabel: "İşletme adı",
  fields: [{ k: "businessName", label: "İşletme adı", type: "text", required: true, maxLength: 120, placeholder: "Ör. Yaşam Atölyesi" }],
  parse(input) {
    const bad = onlyKeys(input, ["businessName"]);
    if (bad) return { ok: false, errors: bad };
    const r = canonicalBusinessName(input.businessName, "businessName");
    return r.ok ? { ok: true, value: { name: r.value } } : { ok: false, errors: { businessName: r.error } };
  },
  run(ctx, v) {
    return runClassic(ctx, { kind: "business", title: "Kampanya", clientId: null, techniques: ["business_name"], input: { name: v.name } }, "İşletme adı analizi", v.name);
  },
};

export const NUMK_RUNNERS: VisitorRunner<never>[] = [
  personRunner("numk:core", ["core"], "Tam Numeroloji Haritası", false),
  personRunner("numk:bridge", ["bridge"], "Köprü Sayıları", false),
  personRunner("numk:personal_day", ["personal_day"], "Kişisel Gün", true),
  personRunner("numk:daily", ["daily"], "Günün Sayısı", true),
  personRunner("numk:chaldean", ["chaldean"], "Kalde İsim Analizi", false),
  personRunner("numk:dual", ["dual"], "İki Sistem Karşılaştırması", false),
  personRunner("numk:person_all", CLASSIC_TECHNIQUES.person, "Klasik Numeroloji — tüm kişi teknikleri", true),
  compatibility,
  businessName,
] as unknown as VisitorRunner<never>[];
