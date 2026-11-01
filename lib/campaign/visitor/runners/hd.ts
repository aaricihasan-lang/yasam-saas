/**
 * KM-3 — Human Design BodyGraph (standart harita). Sağlayıcı: Roxy POST /human-design/bodygraph (1 istek = 1 kredi).
 * MEVCUT motor zinciri değişmeden kullanılır (computeFictionalChart: konum + DST + şema + normalizasyon + doğum anı
 * tutarlılığı). Kurgusal/eğitim kaydına YAZILMAZ: findExisting her zaman null, sonuç yalnız bu yanıtta döner.
 * Roxy çağrısı YALNIZ kampanya rezervasyonuna bağlı guardedFetch ile yapılır (kota, kredi tavanı, uzman payı DB'de).
 *
 * Yorum: "Sistem Yorumu" sağlayıcının metnidir → yalnız Owner modül + teknik anahtarları açıksa. Uzman Bilgi Bankası /
 * expert_notes / danışmanlık notları bu dosyaya HİÇ alınmaz. Word raporu yalnız Owner "Word raporu" açtıysa üretilir;
 * uzman kaydı boş (expertRecords: []), yorum kapalıysa "none".
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { computeFictionalChart } from "@/lib/human-design/education/private/fictionalCompute";
import { callRoxyBodygraph } from "@/lib/human-design/providers/roxy/client";
import { readRoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { extractSystemReading } from "@/lib/human-design/providers/roxy/systemReading";
import { HD_NOT_SELF_TR, HD_SIGNATURE_TR, HD_STRATEGY_TR, hdCrossAngleLabel } from "@/lib/human-design/normalize/hdDisplayLabels";
import {
  hdAuthorityDisplayLabel, hdCenterLabelFromCode, hdChannelLabelFromCode, hdDefinitionLabelFromCode, hdProfileLabelFromCode, hdTypeLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { buildReportSnapshotV2 } from "@/lib/human-design/reporting/reportSnapshotV2";
import { renderHdReportV2Buffer } from "@/lib/human-design/reporting/wordReportV2";
import { loadHdReportLogo } from "@/lib/human-design/reporting/reportBrandAssets";
import type { HdTypeCode } from "@/lib/human-design/types";
import { guardedFetch, type GuardDenial } from "../roxyGuard";
import { roxyBaseUrl } from "../providerUsage";
import type { ResultBlock, VisitorResult } from "../types";
import { F, done, istanbulToday, notFuture, onlyKeys, parseDate, parsePlace, parseTime, trDate, trPlanet, type FieldErrors, type Place, type VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/hd");

type HdIn = { birth: { year: number; month: number; day: number; iso: string }; time: string; place: Place };

type Chart = {
  appCodes?: { type_code?: string; authority_code?: string; profile_code?: string; definition_code?: string; active_centers?: string[] };
  centers?: { defined?: string[]; open?: string[] };
  channels?: { id: string; name?: string }[];
  activations?: { body: string; side: string; gate: number; line: number }[];
  incarnationCross?: { name?: string; angle?: string; gates?: number[] };
};

const SIDE_TR: Record<string, string> = { personality: "Kişilik (bilinçli)", design: "Tasarım (bilinçdışı)" };
const centerCode = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/^g$/, "g");

export function hdBlocks(chart: Chart): ResultBlock[] {
  const c = chart.appCodes ?? {};
  const t = (c.type_code ?? "") as HdTypeCode;
  const cross = chart.incarnationCross ?? {};
  return [
    {
      type: "kv",
      title: "Temel tasarım",
      rows: [
        ["Tip", hdTypeLabelFromCode(c.type_code)],
        ["Strateji", HD_STRATEGY_TR[t] ?? "—"],
        ["Otorite", hdAuthorityDisplayLabel(c.authority_code, c.type_code)],
        ["Profil", hdProfileLabelFromCode(c.profile_code)],
        ["Tanım", hdDefinitionLabelFromCode(c.definition_code)],
        ["İmza", HD_SIGNATURE_TR[t] ?? "—"],
        ["Benlik-dışı tema", HD_NOT_SELF_TR[t] ?? "—"],
        ["Enkarnasyon teması", [hdCrossAngleLabel(cross.angle ?? null), cross.name].filter(Boolean).join(" · ") || "—"],
      ],
    },
    {
      type: "kv",
      title: "Merkezler",
      rows: [
        ["Tanımlı", (chart.centers?.defined ?? []).map((n) => hdCenterLabelFromCode(centerCode(n))).join(", ") || "—"],
        ["Tanımsız / açık", (chart.centers?.open ?? []).map((n) => hdCenterLabelFromCode(centerCode(n))).join(", ") || "—"],
      ],
    },
    { type: "table", title: "Kanallar", head: ["Kanal", "Ad"], rows: (chart.channels ?? []).map((ch) => [ch.id, hdChannelLabelFromCode(ch.id)]) },
    {
      type: "table",
      title: "Aktivasyonlar",
      head: ["Taraf", "Gezegen", "Kapı.Hat"],
      rows: (chart.activations ?? []).map((a) => [SIDE_TR[a.side] ?? a.side, trPlanet(a.body), `${a.gate}.${a.line}`]),
    },
  ];
}

export const hdBodygraph: VisitorRunner<HdIn> = {
  key: "hd:bodygraph",
  kind: "provider",
  formLabel: "Doğum tarihi, saati ve yeri",
  hasReport: true,
  fields: [F.birthDate, F.birthTime, F.birthPlace],
  parse(input, now) {
    const bad = onlyKeys(input, ["birthDate", "birthTime", "birthPlace"]);
    if (bad) return { ok: false, errors: bad };
    const errors: FieldErrors = {};
    const birth = parseDate(input, "birthDate", errors, { min: 1800, max: 2100 });
    notFuture(birth, "birthDate", errors, istanbulToday(now).iso);
    const time = parseTime(input, "birthTime", errors);
    const place = parsePlace(input, "birthPlace", errors);
    return done(errors, { birth: birth!, time: time ?? "", place: place! });
  },
  async run(ctx, v) {
    const config = readRoxyServerConfig(ctx.env as NodeJS.ProcessEnv);
    const base = roxyBaseUrl(ctx.env);
    if (!config || !base) return { ok: false, code: "saglayici", message: "Bu analiz şu anda kullanılamıyor." };
    const denials: GuardDenial[] = [];
    const fetchImpl = guardedFetch(ctx.guard, ctx.db, base, "hd/bodygraph", { fetchImpl: ctx.fetchImpl, denials });
    const r = await computeFictionalChart(
      { trainerId: "kampanya", tenantId: "kampanya", isDemo: false, birthDate: v.birth.iso, birthTime: v.time, locationRef: v.place.id },
      {
        config,
        callRoxy: (cfg, body, o) => callRoxyBodygraph(cfg, body, { ...o, fetchImpl }),
        // Kota ve eşzamanlılık kampanya rezervasyonunda (DB) uygulanır; uzman sayaçları kampanya için kullanılmaz.
        rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
        findExisting: async () => null,
      },
    );
    if (!r.ok) {
      if (r.status === 422) return { ok: false, code: "girdi", message: r.error, errors: { [r.code === "LOCATION_REQUIRED" ? "birthPlace" : r.code.startsWith("BIRTH_TIME") ? "birthTime" : "birthDate"]: r.error } };
      return { ok: false, code: denials.length ? "kota" : "saglayici", message: "Hesaplama şu anda yapılamadı. Lütfen daha sonra tekrar deneyin." };
    }
    const chart = (r.chart ?? {}) as Chart;
    const blocks = hdBlocks(chart);
    const notes: string[] = ["Harita sağlayıcı motoruyla hesaplanır ve Yaşam Sistemi tarafından doğrulanır."];
    const reading = ctx.commentsEnabled ? extractSystemReading(r.raw) : null;
    if (reading) {
      for (const g of reading.general) {
        const text = g.details.map((d) => `${d.label}: ${d.text}`).join("\n");
        if (text.trim()) blocks.push({ type: "text", title: `${g.title}${g.value ? ` — ${g.value}` : ""}`, text, kind: "yorum" });
      }
      if (reading.languageNote) notes.push(reading.languageNote);
      notes.push("Sistem Yorumu genel bir açıklamadır; kişiye özel uzman değerlendirmesi değildir.");
    } else {
      notes.push(ctx.commentsEnabled ? "Bu harita için sistem yorumu bulunamadı." : "Yorumlar bu kampanyada kapalı. Yorumlu raporlar profesyonel üyelikte.");
    }
    const result: VisitorResult = {
      title: "Human Design — BodyGraph",
      subtitle: `${trDate(v.birth)} ${v.time} · ${v.place.label}`,
      blocks,
      notes,
      commentsShown: !!reading,
      report: null,
    };
    if (ctx.hdOptions.word) {
      try {
        const snap = buildReportSnapshotV2({
          generatedAt: ctx.now.toISOString(),
          chartId: "kampanya",
          source: "computed",
          provider: "roxyapi",
          client: { name: "Ücretsiz analiz", birthDate: v.birth.iso, birthTime: `${v.time}:00`, birthPlace: v.place.label, timezone: v.place.timezone },
          codes: (chart.appCodes ?? {}) as never,
          computed: r.chart,
          requested: reading ? "system" : "none",
          systemReadingPermitted: !!reading,
          systemReading: reading,
          expertRecords: [],
          bodygraph: { status: "missing" } as never,
          chartImage: null,
        });
        const buf = await renderHdReportV2Buffer(snap, { logo: await loadHdReportLogo() });
        result.report = { kind: "docx", filename: `human-design-${v.birth.iso}.docx`, base64: buf.toString("base64") };
      } catch {
        result.notes.push("Word raporu şu anda hazırlanamadı; sonuç ekranda gösteriliyor.");
      }
    }
    return { ok: true, result };
  },
};
