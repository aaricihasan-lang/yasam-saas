"use client";
/**
 * Beslenme — Plan araç çubuğu: Analiz, Word İndir, seçili gün için "Şablon Olarak Kaydet" +
 * "Şablon Uygula" ve TASLAK planda manuel "Besin Değerlerini Güncelle". Plan editörünün ana
 * işlevini bozmadan, kendine yeterli aksiyonlar (API guard'lı).
 *
 * ANALİZ: ortak Modal body'e portal edilir (hero header içindeki eski render kutuya
 * sıkışıyordu); masaüstünde geniş, mobil/WebView'de tam ekran; tek doğal scroll. Gösterilen
 * tüm değerler API'nin döndürdüğü SNAPSHOT analitiğidir (yeni hesap yok).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BarChart3, FileText, LayoutTemplate, RefreshCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  getPlanAnalytics,
  downloadPlanWord,
  listTemplates,
  createTemplate,
  applyTemplate,
  type TemplateListRow,
} from "@/lib/beslenme/faz6Client";
import { applySnapshotRefresh, previewSnapshotRefresh, type SnapshotRefreshPreview } from "@/lib/beslenme/planClient";
import { type TemplateType } from "@/lib/beslenme/templateContracts";
import { Modal } from "./planUi";
import { usePlanFormat } from "./usePlanFormat";
import { GhostButton, PrimaryButton, StatusMessage, TextInput, InlineSpinner, EmptyState } from "../../_components/primitives";
import { runInEffect } from "@/lib/runInEffect";

type DaySummary = { id: string; plan_date: string };

type NutrientAvg = Record<string, number>;
type NutrientTotalLite = { nutrient_code: string; unit_code: string; amount: number };
type AnalyticsShape = {
  summary?: {
    planDayCount: number;
    contentDayCount: number;
    avgEnergyPerContentDay: number | null;
    avgMacros?: NutrientAvg;
    targetAvg?: number | null;
    delta?: number | null;
    minEnergy?: number | null;
    maxEnergy?: number | null;
  };
  weekly?: Array<{
    weekIndex: number;
    dateStart: string;
    dateEnd: string;
    contentDays: number;
    emptyDays: number;
    avgEnergy: number | null;
    avgMacros?: NutrientAvg;
    targetAvg?: number | null;
    delta?: number | null;
  }>;
  daily?: Array<{
    dayId: string;
    plan_date: string;
    itemCount: number;
    isContentDay: boolean;
    energyTotal: number;
    nutrients: NutrientTotalLite[];
    effectiveTarget: number | null;
    energyDelta: number | null;
  }>;
};

const MACROS = ["protein", "carbohydrate", "total_fat", "fiber"] as const;
const SECONDARY: Array<{ code: string; unit: string }> = [
  { code: "sugar", unit: "g" },
  { code: "sodium", unit: "mg" },
  { code: "potassium", unit: "mg" },
];

// Yalnız gösterim biçimi; `tag` ekran diline göre (TR'de bugünkü "tr-TR"). Hesap değişmez.
const fmt = (n: number | null | undefined, unit = "", tag = "tr-TR") =>
  n == null || !Number.isFinite(n) ? "—" : `${Math.round(n).toLocaleString(tag)}${unit}`;
const fmt1 = (n: number | null | undefined, tag = "tr-TR") =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString(tag, { maximumFractionDigits: 1 });
const fmtDelta = (n: number | null | undefined, tag = "tr-TR") =>
  n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString(tag)} kcal`;
const deltaTone = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "text-slate-400" : Math.abs(n) <= 100 ? "text-emerald-700" : n > 0 ? "text-amber-700" : "text-sky-700";

export function PlanTools({
  planId,
  planStatus,
  days,
  selectedDayId,
  archived,
  onChanged,
}: {
  planId: string;
  planStatus?: string;
  days: DaySummary[];
  selectedDayId: string | null;
  archived: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("beslenme.tools");
  const pf = usePlanFormat();
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null;
  const isDraft = planStatus === "draft";

  const doWord = async () => {
    setWordBusy(true);
    setMsg(null);
    const r = await downloadPlanWord(planId);
    setWordBusy(false);
    if (!r.ok) {
      setMsg({
        type: "error",
        text:
          r.code === "RATE_LIMITED"
            ? t("wordRateLimited")
            : r.code === "PLAN_TOO_LARGE"
              ? t("wordTooLarge")
              : r.code === "WORD_FAILED"
                // BES-02: plan verisi eksiksiz okunamadı → eksik belge üretilmedi.
                ? t("wordIncomplete")
                : t("wordFailed"),
      });
    }
  };

  return (
    <>
      <GhostButton icon={<BarChart3 className="h-4 w-4" />} onClick={() => setAnalyticsOpen(true)}>
        {t("analysis")}
      </GhostButton>
      {/* Word export CTA TÜM cihazlarda görünür (2026-10-14 owner kararı: masaüstü, mobil web,
          Android Chrome, Android uygulaması, iPhone, tablet). Önceki "yalnız masaüstü" kuralı
          kaldırıldı. Word oluşturma mantığı ve backend endpoint'i değişmez. */}
      <GhostButton icon={<FileText className="h-4 w-4" />} loading={wordBusy} onClick={() => void doWord()}>
        {t("wordDownload")}
      </GhostButton>
      {!archived ? (
        <>
          <GhostButton
            icon={<Save className="h-4 w-4" />}
            disabled={!selectedDay}
            onClick={() => setSaveOpen(true)}
          >
            {t("saveDayTemplate")}
          </GhostButton>
          <GhostButton
            icon={<LayoutTemplate className="h-4 w-4" />}
            disabled={!selectedDay}
            onClick={() => setApplyOpen(true)}
          >
            {t("applyTemplate")}
          </GhostButton>
        </>
      ) : null}
      {isDraft ? (
        <GhostButton icon={<RefreshCcw className="h-4 w-4" />} onClick={() => setRefreshOpen(true)}>
          {t("refreshValues")}
        </GhostButton>
      ) : null}

      {msg ? (
        <span className="w-full">
          <StatusMessage type={msg.type}>{msg.text}</StatusMessage>
        </span>
      ) : null}

      {analyticsOpen ? (
        <AnalyticsModal planId={planId} onClose={() => setAnalyticsOpen(false)} />
      ) : null}

      {refreshOpen ? (
        <RefreshSnapshotsModal
          planId={planId}
          onClose={() => setRefreshOpen(false)}
          onDone={(n) => {
            setRefreshOpen(false);
            onChanged();
            setMsg({ type: "success", text: n > 0 ? t("refreshDone", { n }) : t("refreshNone") });
          }}
        />
      ) : null}

      {saveOpen && selectedDay ? (
        <SaveDayTemplateModal
          dayLabel={pf.date(selectedDay.plan_date)}
          dayId={selectedDay.id}
          onClose={() => setSaveOpen(false)}
          onSaved={() => {
            setSaveOpen(false);
            setMsg({ type: "success", text: t("daySaved") });
          }}
        />
      ) : null}

      {applyOpen && selectedDay ? (
        <ApplyTemplateModal
          planId={planId}
          targetDayId={selectedDay.id}
          onClose={() => setApplyOpen(false)}
          onApplied={(mode) => {
            setApplyOpen(false);
            onChanged();
            setMsg({ type: "success", text: mode === "day" ? t("dayTemplateApplied") : t("mealAdded") });
          }}
        />
      ) : null}
    </>
  );
}

const DAILY_PREVIEW = 14;

function AnalyticsModal({ planId, onClose }: { planId: string; onClose: () => void }) {
  const t = useTranslations("beslenme.tools.an");
  const pf = usePlanFormat();
  const tag = pf.numTag;
  const [data, setData] = useState<AnalyticsShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAllDays, setShowAllDays] = useState(false);
  const [onlyContentDays, setOnlyContentDays] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await getPlanAnalytics(planId);
      if (!alive) return;
      if (r.ok && r.data) setData((r.data as { analytics: AnalyticsShape }).analytics);
      else setErr(t("loadFailed"));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [planId, t]);

  const s = data?.summary;
  const dailyAll = (data?.daily ?? []).filter((d) => (onlyContentDays ? d.isContentDay : true));
  const daily = showAllDays ? dailyAll : dailyAll.slice(0, DAILY_PREVIEW);
  const nut = (list: NutrientTotalLite[], code: string) => list.find((n) => n.nutrient_code === code)?.amount ?? null;
  const secondaryPresent = SECONDARY.filter((x) => s?.avgMacros && s.avgMacros[x.code] != null);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      subtitle={t("subtitle")}
      maxWidthClass="sm:max-w-6xl"
      fullScreenOnMobile
    >
      {loading ? (
        <InlineSpinner label={t("computing")} />
      ) : err ? (
        <StatusMessage type="error">{err}</StatusMessage>
      ) : s ? (
        <div className="flex flex-col gap-5">
          {/* Özet */}
          <section>
            <SectionTitle>{t("summary")}</SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={t("planDays")} value={String(s.planDayCount)} />
              <Stat label={t("contentDays")} value={String(s.contentDayCount)} />
              <Stat label={t("avgEnergy")} value={fmt(s.avgEnergyPerContentDay, " kcal", tag)} emphasis />
              <Stat label={t("targetAvg")} value={fmt(s.targetAvg, " kcal", tag)} />
              <Stat label={t("delta")} value={fmtDelta(s.delta, tag)} tone={deltaTone(s.delta)} />
              <Stat label={t("minMax")} value={`${fmt(s.minEnergy, "", tag)} – ${fmt(s.maxEnergy, "", tag)} kcal`} />
            </div>
          </section>

          {/* Makro ortalamaları */}
          {s.avgMacros ? (
            <section>
              <SectionTitle>{t("avgNutrients")}</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {MACROS.map((c) => (
                  <Stat key={c} label={pf.nutrient(c)} value={`${fmt1(s.avgMacros?.[c], tag)} g`} />
                ))}
                {secondaryPresent.map((x) => (
                  <Stat key={x.code} label={pf.nutrient(x.code)} value={`${fmt1(s.avgMacros?.[x.code], tag)} ${x.unit}`} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Haftalık */}
          {data?.weekly && data.weekly.length > 0 ? (
            <section>
              <SectionTitle>{t("weekly")}</SectionTitle>
              {/* Masaüstü tablo */}
              <div className="hidden overflow-hidden rounded-xl border border-slate-100 md:block">
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{t("week")}</th>
                      <th className="px-3 py-2">{t("date")}</th>
                      <th className="px-3 py-2 text-right">{t("contentEmpty")}</th>
                      <th className="px-3 py-2 text-right">{t("avgEnergyShort")}</th>
                      <th className="px-3 py-2 text-right">{t("targetAvg")}</th>
                      <th className="px-3 py-2 text-right">{t("deltaShort")}</th>
                      {MACROS.map((c) => (
                        <th key={c} className="px-3 py-2 text-right">{pf.nutrient(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.weekly.map((w) => (
                      <tr key={w.weekIndex} className="border-t border-slate-100 font-bold text-slate-700">
                        <td className="px-3 py-2">{t("weekN", { n: w.weekIndex + 1 })}</td>
                        <td className="px-3 py-2 text-slate-500">{pf.date(w.dateStart)} – {pf.date(w.dateEnd)}</td>
                        <td className="px-3 py-2 text-right">{w.contentDays} / {w.emptyDays}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{fmt(w.avgEnergy, " kcal", tag)}</td>
                        <td className="px-3 py-2 text-right">{fmt(w.targetAvg, " kcal", tag)}</td>
                        <td className={`px-3 py-2 text-right ${deltaTone(w.delta)}`}>{fmtDelta(w.delta, tag)}</td>
                        {MACROS.map((c) => (
                          <td key={c} className="px-3 py-2 text-right">{fmt1(w.avgMacros?.[c], tag)} g</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobil kartlar */}
              <div className="flex flex-col gap-2 md:hidden">
                {data.weekly.map((w) => (
                  <div key={w.weekIndex} className="rounded-xl border border-slate-100 bg-white/70 p-3 text-[12px] font-bold text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-800">{t("weekN", { n: w.weekIndex + 1 })}</span>
                      <span className="text-emerald-700">{fmt(w.avgEnergy, " kcal", tag)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {pf.date(w.dateStart)} – {pf.date(w.dateEnd)} · {t("weekCounts", { content: w.contentDays, empty: w.emptyDays })}
                    </p>
                    <p className={`mt-1 ${deltaTone(w.delta)}`}>{t("targetLine", { target: fmt(w.targetAvg, " kcal", tag), delta: fmtDelta(w.delta, tag) })}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {MACROS.map((c) => `${pf.nutrient(c)} ${fmt1(w.avgMacros?.[c], tag)} g`).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Günlük döküm */}
          {data?.daily && data.daily.length > 0 ? (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <SectionTitle className="mb-0">{t("daily")}</SectionTitle>
                <label className="inline-flex items-center gap-2 text-[12px] font-bold text-slate-500">
                  <input
                    type="checkbox"
                    checked={onlyContentDays}
                    onChange={(e) => setOnlyContentDays(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                  />
                  {t("onlyContentDays")}
                </label>
              </div>
              {dailyAll.length === 0 ? (
                <p className="text-[12px] font-medium text-slate-400">{t("noDays")}</p>
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-xl border border-slate-100 md:block">
                    <table className="w-full text-[12px]">
                      <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">{t("day")}</th>
                          <th className="px-3 py-2 text-right">{t("items")}</th>
                          <th className="px-3 py-2 text-right">{t("energy")}</th>
                          <th className="px-3 py-2 text-right">{t("target")}</th>
                          <th className="px-3 py-2 text-right">{t("deltaShort")}</th>
                          {MACROS.map((c) => (
                            <th key={c} className="px-3 py-2 text-right">{pf.nutrient(c)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {daily.map((d) => (
                          <tr key={d.dayId} className="border-t border-slate-100 font-bold text-slate-700">
                            <td className="px-3 py-2">{pf.dateShort(d.plan_date)}</td>
                            <td className="px-3 py-2 text-right">{d.itemCount}</td>
                            <td className="px-3 py-2 text-right text-emerald-700">{d.isContentDay ? fmt(d.energyTotal, " kcal", tag) : "—"}</td>
                            <td className="px-3 py-2 text-right">{fmt(d.effectiveTarget, " kcal", tag)}</td>
                            <td className={`px-3 py-2 text-right ${deltaTone(d.energyDelta)}`}>{d.isContentDay ? fmtDelta(d.energyDelta, tag) : "—"}</td>
                            {MACROS.map((c) => (
                              <td key={c} className="px-3 py-2 text-right">{d.isContentDay ? `${fmt1(nut(d.nutrients, c), tag)} g` : "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-2 md:hidden">
                    {daily.map((d) => (
                      <div key={d.dayId} className="rounded-xl border border-slate-100 bg-white/70 p-3 text-[12px] font-bold text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-800">{pf.dateShort(d.plan_date)}</span>
                          <span className="text-emerald-700">{d.isContentDay ? fmt(d.energyTotal, " kcal", tag) : t("emptyDay")}</span>
                        </div>
                        {d.isContentDay ? (
                          <>
                            <p className={`mt-0.5 ${deltaTone(d.energyDelta)}`}>
                              {t("dayLine", { target: fmt(d.effectiveTarget, " kcal", tag), delta: fmtDelta(d.energyDelta, tag), count: d.itemCount })}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {MACROS.map((c) => `${pf.nutrient(c)} ${fmt1(nut(d.nutrients, c), tag)} g`).join(" · ")}
                            </p>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {dailyAll.length > DAILY_PREVIEW ? (
                    <div className="mt-2">
                      <GhostButton onClick={() => setShowAllDays((v) => !v)}>
                        {showAllDays ? t("showLess") : t("showAll", { count: dailyAll.length })}
                      </GhostButton>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          <p className="text-[11px] font-medium leading-relaxed text-slate-400">
            {t("footnote")}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function SectionTitle({ children, className = "mb-2" }: { children: ReactNode; className?: string }) {
  return <p className={`${className} text-[12px] font-black uppercase tracking-wide text-slate-500`}>{children}</p>;
}

function Stat({ label, value, emphasis, tone }: { label: string; value: string; emphasis?: boolean; tone?: string }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${emphasis ? "border-emerald-200 bg-emerald-50/60" : "border-slate-100 bg-white/70"}`}>
      <p className="text-[11px] font-bold text-slate-400">{label}</p>
      <p className={`mt-0.5 text-[16px] font-black ${tone ?? (emphasis ? "text-emerald-800" : "text-slate-800")}`}>{value}</p>
    </div>
  );
}

/**
 * TASLAK plan — manuel "Besin Değerlerini Güncelle". Otomatik ÇALIŞMAZ: önce önizleme (hangi
 * kalem, hangi besin, 100 g enerji önce/sonra) gösterilir; kullanıcı onaylarsa sunucu değişen
 * kalemlerin snapshot'larını güncel besin değerlerinden (kişisel değer varsa o) yeniden yazar.
 * Gram/porsiyon değişmez. Çalışma alanından kaldırılmış besinlerin kalemleri olduğu gibi kalır.
 */
function RefreshSnapshotsModal({
  planId,
  onClose,
  onDone,
}: {
  planId: string;
  onClose: () => void;
  onDone: (updated: number) => void;
}) {
  const t = useTranslations("beslenme.tools.rf");
  const tt = useTranslations("beslenme.tools");
  const pf = usePlanFormat();
  const tag = pf.numTag;
  const [data, setData] = useState<SnapshotRefreshPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const r = await previewSnapshotRefresh(planId);
    setLoading(false);
    if (r.ok && r.data) setData(r.data);
    else setErr(pf.error(r.code, r.status));
  }, [planId, pf]);
  useEffect(() => {
    runInEffect(() => void load());
  }, [load]);

  const apply = async () => {
    if (!data || busy) return;
    setBusy(true);
    setErr("");
    const r = await applySnapshotRefresh(planId, data.changes.length);
    setBusy(false);
    if (r.ok) onDone(r.data?.updated ?? 0);
    else {
      setErr(pf.error(r.code, r.status));
      if (r.code === "REFRESH_STALE") void load();
    }
  };

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={tt("refreshValues")} subtitle={t("subtitle")} maxWidthClass="sm:max-w-3xl">
      {loading ? (
        <InlineSpinner label={t("computing")} />
      ) : !data ? (
        err ? <StatusMessage type="error">{err}</StatusMessage> : null
      ) : !data.eligible ? (
        <StatusMessage type="info">{t("draftOnly")}</StatusMessage>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-medium leading-relaxed text-slate-700">
            {t.rich("intro", { b: (chunks) => <b>{chunks}</b> })}
          </p>
          {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
          {data.changes.length === 0 ? (
            <StatusMessage type="success">{t("upToDate")}</StatusMessage>
          ) : (
            <>
              <p className="text-[12px] font-black text-slate-500">
                {t("willUpdate", { count: data.changes.length, total: data.totalItems })}
              </p>
              <div className="max-h-[50vh] overflow-x-auto overflow-y-auto rounded-xl border border-slate-100">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{t("dayMeal")}</th>
                      <th className="px-3 py-2">{t("food")}</th>
                      <th className="px-3 py-2 text-right">{t("energy100")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.changes.map((c) => (
                      <tr key={c.item_id} className="border-t border-slate-100 font-bold text-slate-700">
                        <td className="px-3 py-2 text-slate-500">
                          {pf.dateShort(c.plan_date)}{c.meal_label ? ` · ${c.meal_label}` : ""}
                        </td>
                        <td className="px-3 py-2">
                          {c.food_name_after}
                          {c.food_name_before !== c.food_name_after ? (
                            <span className="block text-[11px] font-medium text-slate-400">{t("previousName", { name: c.food_name_before })}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-slate-400">{fmt(c.energy_per100_before, "", tag)}</span>
                          <span className="mx-1 text-slate-300">→</span>
                          <span className="text-emerald-700">{fmt(c.energy_per100_after, "", tag)} kcal</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {data.unavailable.length > 0 ? (
            <StatusMessage type="info">
              {t("unavailable", { count: data.unavailable.length })}
            </StatusMessage>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <GhostButton onClick={onClose} disabled={busy}>{t("cancel")}</GhostButton>
            {data.changes.length > 0 ? (
              <PrimaryButton loading={busy} onClick={() => void apply()}>
                {t("updateN", { count: data.changes.length })}
              </PrimaryButton>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}

function SaveDayTemplateModal({
  dayLabel,
  dayId,
  onClose,
  onSaved,
}: {
  dayLabel: string;
  dayId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tx = useTranslations("beslenme.tools.sd");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    setErr("");
    const r = await createTemplate({ from: "day", source_id: dayId, title: t });
    setSaving(false);
    if (r.ok) onSaved();
    else setErr(tx("saveFailed"));
  };

  return (
    <Modal open onClose={onClose} title={tx("title")} subtitle={dayLabel} maxWidthClass="sm:max-w-md">
      <div className="flex flex-col gap-3">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx("placeholder")} autoFocus />
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
        <div className="flex justify-end gap-2">
          <GhostButton onClick={onClose}>{tx("cancel")}</GhostButton>
          <PrimaryButton loading={saving} disabled={!title.trim()} onClick={() => void save()}>
            {tx("save")}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

function ApplyTemplateModal({
  planId,
  targetDayId,
  onClose,
  onApplied,
}: {
  planId: string;
  targetDayId: string;
  onClose: () => void;
  onApplied: (mode: TemplateType) => void;
}) {
  const t = useTranslations("beslenme.tools.ap");
  const tt = useTranslations("beslenme.tools");
  const pf = usePlanFormat();
  const [rows, setRows] = useState<TemplateListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [meal, day] = await Promise.all([listTemplates("meal"), listTemplates("day")]);
    const all = [...(meal.data?.templates ?? []), ...(day.data?.templates ?? [])];
    setRows(all);
    setLoading(false);
  }, []);
  useEffect(() => {
    runInEffect(() => void load());
  }, [load]);

  const apply = async (tpl: TemplateListRow) => {
    setBusyId(tpl.id);
    setErr("");
    const r = await applyTemplate(tpl.id, {
      mode: tpl.template_type,
      target_plan_id: planId,
      target_day_id: targetDayId,
    });
    setBusyId(null);
    if (r.ok) onApplied(tpl.template_type);
    else if (r.code === "TARGET_NOT_EMPTY") setErr(t("notEmpty"));
    else setErr(t("failed"));
  };

  return (
    <Modal open onClose={onClose} title={tt("applyTemplate")} subtitle={t("subtitle")} maxWidthClass="sm:max-w-lg">
      {loading ? (
        <InlineSpinner />
      ) : rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDesc")} />
      ) : (
        <div className="flex flex-col gap-2">
          {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
          {rows.map((tpl) => (
            <div key={tpl.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white/70 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-black text-slate-700">{tpl.title}</p>
                <p className="text-[11px] font-bold text-emerald-600">{pf.templateType(tpl.template_type)}</p>
              </div>
              <PrimaryButton loading={busyId === tpl.id} onClick={() => void apply(tpl)}>
                {tpl.template_type === "day" ? t("applyDay") : t("addMeal")}
              </PrimaryButton>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
