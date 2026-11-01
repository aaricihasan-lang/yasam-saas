/**
 * Gece operasyonu — Human Design İlişki Analizi (Connection, 2 kişi). Sağlayıcı istekleri: kişi başına BodyGraph (2) +
 * Connection (1) = 3 kredi (katalog [3,3]); her istek kampanya rezervasyonuna bağlı guardedFetch ile.
 *
 * MEVCUT zincir değişmeden kullanılır:
 *   - Bireysel harita: computeFictionalChart (konum + DST + şema + normalizasyon + doğum anı tutarlılığı) — kayda YAZILMAZ.
 *   - Connection: callRoxyConnection → validateRoxyConnection → checkConnectionConsistency(expectedConnection(...)) — uzman
 *     akışıyla (relationService) AYNI doğrulama; uyuşmazsa sonuç GÖSTERİLMEZ.
 * Danışan / harita / ilişki kaydı OLUŞTURULMAZ; iki kişinin doğum bilgisi yalnız bellekte işlenir.
 * Yorum: dinamik tanımları (kaynak tanım) her zaman; ilişki açıklamaları (connectionExplanations) yalnız yorum açıksa.
 * Uzman Bilgi Bankası, ilişki yorumu (relationExtras) ve uzman notları HİÇ kullanılmaz.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { computeFictionalChart } from "@/lib/human-design/education/private/fictionalCompute";
import { callRoxyBodygraph } from "@/lib/human-design/providers/roxy/client";
import { callRoxyConnection } from "@/lib/human-design/providers/roxy/relationClient";
import { ROXY_POLICY, readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { checkConnectionConsistency, expectedConnection, validateRoxyConnection } from "@/lib/human-design/relations/connection";
import { chartBirthMoment, participantChartFacts } from "@/lib/human-design/relations/relationService";
import { connectionExplanations } from "@/lib/human-design/relations/explanations";
import { DYNAMIC_DEFINITION, DYNAMIC_LABEL, DYNAMIC_ORDER, circuitLabel, combinedDefinitionLabel, relationChannelLabel } from "@/lib/human-design/relations/labels";
import { hdCenterLabelFromCode } from "@/lib/human-design/codeHelpers";
import { guardedFetch, type GuardDenial } from "../roxyGuard";
import { roxyBaseUrl } from "../providerUsage";
import type { ResultBlock } from "../types";
import { F, done, istanbulToday, notFuture, onlyKeys, parseDate, parsePlace, parseTime, trDate, type FieldErrors, type Place, type RunOutcome, type VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/hdRelation");

type Person = { birth: { year: number; month: number; day: number; iso: string }; time: string; place: Place };
type ConnIn = { a: Person; b: Person };

const KEYS = ["birthDate", "birthTime", "birthPlace", "birthDate2", "birthTime2", "birthPlace2"];

function person(input: Record<string, unknown>, sfx: string, errors: FieldErrors, today: string): Person {
  const birth = parseDate(input, `birthDate${sfx}`, errors, { min: 1800, max: 2100 });
  notFuture(birth, `birthDate${sfx}`, errors, today);
  const time = parseTime(input, `birthTime${sfx}`, errors);
  const place = parsePlace(input, `birthPlace${sfx}`, errors);
  return { birth: birth!, time: time ?? "", place: place! };
}

export const hdConnection: VisitorRunner<ConnIn> = {
  key: "hd:connection",
  kind: "provider",
  formLabel: "İki kişinin doğum tarihi, saati ve yeri",
  fields: [
    { ...F.birthDate, label: "1. kişi — doğum tarihi" },
    { ...F.birthTime, label: "1. kişi — doğum saati" },
    { ...F.birthPlace, label: "1. kişi — doğum yeri" },
    { ...F.birthDate, k: "birthDate2", label: "2. kişi — doğum tarihi" },
    { ...F.birthTime, k: "birthTime2", label: "2. kişi — doğum saati" },
    { ...F.birthPlace, k: "birthPlace2", label: "2. kişi — doğum yeri" },
  ],
  parse(input, now) {
    const bad = onlyKeys(input, KEYS);
    if (bad) return { ok: false, errors: bad };
    const errors: FieldErrors = {};
    const today = istanbulToday(now).iso;
    const a = person(input, "", errors, today);
    const b = person(input, "2", errors, today);
    if (!Object.keys(errors).length && a.birth.iso === b.birth.iso && a.time === b.time && a.place.id === b.place.id) {
      errors.birthDate2 = "İki kişinin doğum bilgileri aynı olamaz.";
    }
    return done(errors, { a, b });
  },
  async run(ctx, v): Promise<RunOutcome> {
    const config = readRoxyServerConfig(ctx.env as NodeJS.ProcessEnv);
    const base = roxyBaseUrl(ctx.env);
    if (!config || !base) return { ok: false, code: "saglayici", message: "Bu analiz şu anda kullanılamıyor." };
    const denials: GuardDenial[] = [];
    const providerFail = (): RunOutcome => ({ ok: false, code: denials.length ? "kota" : "saglayici", message: "Hesaplama şu anda yapılamadı. Lütfen daha sonra tekrar deneyin." });
    const members: { moment: NonNullable<ReturnType<typeof chartBirthMoment>>; facts: NonNullable<ReturnType<typeof participantChartFacts>> }[] = [];
    for (const [i, p] of [v.a, v.b].entries()) {
      const fetchImpl = guardedFetch(ctx.guard, ctx.db, base, "hd/bodygraph", { fetchImpl: ctx.fetchImpl, denials });
      const r = await computeFictionalChart(
        { trainerId: "kampanya", tenantId: "kampanya", isDemo: false, birthDate: p.birth.iso, birthTime: p.time, locationRef: p.place.id },
        {
          config,
          callRoxy: (cfg, body, o) => callRoxyBodygraph(cfg, body, { ...o, fetchImpl }),
          rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
          findExisting: async () => null,
        },
      );
      if (!r.ok) {
        if (r.status === 422) {
          const sfx = i === 0 ? "" : "2";
          const field = r.code === "LOCATION_REQUIRED" ? "birthPlace" : r.code.startsWith("BIRTH_TIME") ? "birthTime" : "birthDate";
          return { ok: false, code: "girdi", message: `${i + 1}. kişi: ${r.error}`, errors: { [`${field}${sfx}`]: r.error } };
        }
        return providerFail();
      }
      const moment = chartBirthMoment(r.input);
      const facts = participantChartFacts(r.chart);
      if (!moment || !facts) return { ok: false, code: "saglayici", message: "Hesaplama sonucu doğrulanamadı; sonuç gösterilmedi." };
      members.push({ moment, facts });
    }
    const cFetch = guardedFetch(ctx.guard, ctx.db, base, "hd/connection", { fetchImpl: ctx.fetchImpl, denials });
    const call = await callRoxyConnection(config, { personA: members[0].moment, personB: members[1].moment }, { lang: ROXY_POLICY.lang, timeoutMs: ROXY_POLICY.timeoutMs, fetchImpl: cFetch });
    if (!call.ok) return providerFail();
    const val = validateRoxyConnection(call.raw);
    if (!val.ok) return { ok: false, code: "saglayici", message: "Hesaplama sonucu doğrulanamadı; sonuç gösterilmedi." };
    const errs = checkConnectionConsistency(val.value, expectedConnection(members[0].facts.gates, members[1].facts.gates, members[0].facts.defined, members[1].facts.defined));
    if (errs.length) return { ok: false, code: "saglayici", message: "İlişki sonucu bireysel haritalarla uyuşmadı; yanlış sonuç gösterilmedi." };
    const r = val.value;
    const who = (c: { personAGates: number[]; personBGates: number[] }) => `1. kişi: ${c.personAGates.join(", ") || "—"} · 2. kişi: ${c.personBGates.join(", ") || "—"}`;
    const blocks: ResultBlock[] = [
      {
        type: "kv",
        title: "Birleşik harita",
        rows: [
          ["Birleşik tanım", combinedDefinitionLabel(r.combinedDefinition)],
          ["Toplam kanal", String(r.totalChannels)],
          ...DYNAMIC_ORDER.map((d) => [DYNAMIC_LABEL[d], String(r.summary[d.toLowerCase() as keyof typeof r.summary] ?? 0)] as [string, string]),
        ],
      },
      {
        type: "table",
        title: "Kanallar",
        head: ["Kanal", "Devre", "Dinamik", "Kapılar"],
        rows: r.channels.map((c) => [relationChannelLabel(c.id, c.name), circuitLabel(c.circuit), DYNAMIC_LABEL[c.dynamic] ?? c.dynamic, who(c)]),
      },
      {
        type: "table",
        title: "Merkezler",
        head: ["Merkez", "Birleşik", "Kendi haritasında tanımlayan"],
        rows: r.centers.map((c) => [hdCenterLabelFromCode(c.code), c.defined ? "Tanımlı" : "Açık", c.definedBy.length ? c.definedBy.map((x) => (x === "A" ? "1. kişi" : "2. kişi")).join(", ") : "—"]),
      },
      { type: "list", title: "Dinamik türleri (tanım)", items: DYNAMIC_ORDER.map((d) => `${DYNAMIC_LABEL[d]}: ${DYNAMIC_DEFINITION[d]}`), kind: "veri" },
    ];
    let shown = false;
    if (ctx.commentsEnabled) {
      for (const s of connectionExplanations(r, "1. kişi", "2. kişi")) {
        const items = s.items.filter((x) => x.text?.trim()).slice(0, 20).map((x) => `${x.title}: ${x.text}`);
        if (items.length) {
          blocks.push({ type: "list", title: s.title, items, kind: "yorum" });
          shown = true;
        }
      }
    }
    return {
      ok: true,
      result: {
        title: "Human Design — İlişki Haritası (Connection)",
        subtitle: `${trDate(v.a.birth)} ${v.a.time} · ${v.a.place.label} & ${trDate(v.b.birth)} ${v.b.time} · ${v.b.place.label}`,
        blocks,
        notes: [
          "Haritalar sağlayıcı motoruyla hesaplanır ve Yaşam Sistemi tarafından doğrulanır; ilişki sonucu bireysel haritalarla karşılaştırılır.",
          shown ? "Açıklamalar sistemin genel metinleridir; kişiye özel uzman değerlendirmesi değildir." : "Yorumlar bu kampanyada kapalı. Yorumlu çalışma profesyonel üyelikte.",
          "İki kişinin bilgileri yalnız bu hesap için kullanıldı; kaydedilmedi.",
        ],
        commentsShown: shown,
      },
    };
  },
};
