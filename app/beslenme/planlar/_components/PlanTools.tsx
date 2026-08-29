"use client";
/**
 * Beslenme FAZ 6 — Plan araç çubuğu: Analiz (özet), Word İndir, ve seçili gün için
 * "Şablon Olarak Kaydet" + "Şablon Uygula". Plan editörünün ana işlevini bozmadan,
 * kendine yeterli aksiyonlar. Owner-only (API guard'lı).
 */
import { useCallback, useEffect, useState } from "react";
import { BarChart3, FileText, LayoutTemplate, Save } from "lucide-react";
import {
  getPlanAnalytics,
  downloadPlanWord,
  listTemplates,
  createTemplate,
  applyTemplate,
  type TemplateListRow,
} from "@/lib/beslenme/faz6Client";
import { TEMPLATE_TYPE_LABELS, type TemplateType } from "@/lib/beslenme/templateContracts";
import { Modal } from "./planUi";
import { GhostButton, PrimaryButton, StatusMessage, TextInput, InlineSpinner, EmptyState } from "../../_components/primitives";
import { runInEffect } from "@/lib/runInEffect";

type DaySummary = { id: string; plan_date: string };

type NutrientAvg = Record<string, number>;
type AnalyticsShape = {
  summary?: {
    planDayCount: number;
    contentDayCount: number;
    avgEnergyPerContentDay: number;
    avgMacros?: NutrientAvg;
    targetAvg?: number | null;
    delta?: number | null;
    minEnergy?: number;
    maxEnergy?: number;
  };
  weekly?: Array<{
    weekIndex: number;
    dateStart: string;
    dateEnd: string;
    contentDays: number;
    emptyDays: number;
    avgEnergy: number;
  }>;
};

const fmt = (n: number | null | undefined, unit = "") =>
  n == null || !Number.isFinite(n) ? "—" : `${Math.round(n).toLocaleString("tr-TR")}${unit}`;
const fmt1 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export function PlanTools({
  planId,
  days,
  selectedDayId,
  archived,
  onChanged,
}: {
  planId: string;
  days: DaySummary[];
  selectedDayId: string | null;
  archived: boolean;
  onChanged: () => void;
}) {
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null;

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
            ? "Çok sık indirme. Lütfen biraz bekleyin."
            : r.code === "PLAN_TOO_LARGE"
              ? "Plan çok büyük — Word oluşturulamadı."
              : "Word indirme başarısız.",
      });
    }
  };

  return (
    <>
      <GhostButton icon={<BarChart3 className="h-4 w-4" />} onClick={() => setAnalyticsOpen(true)}>
        Analiz
      </GhostButton>
      <GhostButton icon={<FileText className="h-4 w-4" />} loading={wordBusy} onClick={() => void doWord()}>
        Word İndir
      </GhostButton>
      {!archived ? (
        <>
          <GhostButton
            icon={<Save className="h-4 w-4" />}
            disabled={!selectedDay}
            onClick={() => setSaveOpen(true)}
          >
            Günü Şablonla
          </GhostButton>
          <GhostButton
            icon={<LayoutTemplate className="h-4 w-4" />}
            disabled={!selectedDay}
            onClick={() => setApplyOpen(true)}
          >
            Şablon Uygula
          </GhostButton>
        </>
      ) : null}

      {msg ? (
        <span className="w-full">
          <StatusMessage type={msg.type}>{msg.text}</StatusMessage>
        </span>
      ) : null}

      {analyticsOpen ? (
        <AnalyticsModal planId={planId} onClose={() => setAnalyticsOpen(false)} />
      ) : null}

      {saveOpen && selectedDay ? (
        <SaveDayTemplateModal
          dayLabel={selectedDay.plan_date}
          dayId={selectedDay.id}
          onClose={() => setSaveOpen(false)}
          onSaved={() => {
            setSaveOpen(false);
            setMsg({ type: "success", text: "Gün şablon olarak kaydedildi." });
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
            setMsg({ type: "success", text: mode === "day" ? "Gün şablonu uygulandı." : "Öğün eklendi." });
          }}
        />
      ) : null}
    </>
  );
}

function AnalyticsModal({ planId, onClose }: { planId: string; onClose: () => void }) {
  const [data, setData] = useState<AnalyticsShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await getPlanAnalytics(planId);
      if (!alive) return;
      if (r.ok && r.data) setData((r.data as { analytics: AnalyticsShape }).analytics);
      else setErr("Analiz yüklenemedi.");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [planId]);

  const s = data?.summary;
  return (
    <Modal open onClose={onClose} title="Plan Analizi" subtitle="Snapshot verilerine göre profesyonel özet" maxWidthClass="max-w-2xl">
      {loading ? (
        <InlineSpinner label="Analiz hesaplanıyor…" />
      ) : err ? (
        <StatusMessage type="error">{err}</StatusMessage>
      ) : s ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Plan günü" value={String(s.planDayCount)} />
            <Stat label="İçerikli gün" value={String(s.contentDayCount)} />
            <Stat label="Ort. enerji / içerikli gün" value={fmt(s.avgEnergyPerContentDay, " kcal")} />
            <Stat label="Hedef ort." value={fmt(s.targetAvg, " kcal")} />
            <Stat label="Fark" value={fmt(s.delta, " kcal")} />
            <Stat label="Min–Maks" value={`${fmt(s.minEnergy)} – ${fmt(s.maxEnergy)}`} />
          </div>
          {s.avgMacros ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Protein" value={`${fmt1(s.avgMacros.protein)} g`} />
              <Stat label="Karbonhidrat" value={`${fmt1(s.avgMacros.carbohydrate)} g`} />
              <Stat label="Yağ" value={`${fmt1(s.avgMacros.total_fat)} g`} />
              <Stat label="Lif" value={`${fmt1(s.avgMacros.fiber)} g`} />
            </div>
          ) : null}
          {data?.weekly && data.weekly.length > 0 ? (
            <div className="rounded-xl border border-slate-100 bg-white/60 p-3">
              <p className="mb-2 text-[12px] font-black text-slate-500">Haftalık ortalama</p>
              <div className="flex flex-col gap-1">
                {data.weekly.map((w) => (
                  <div key={w.weekIndex} className="flex items-center justify-between text-[12px] font-bold text-slate-600">
                    <span>
                      {w.weekIndex + 1}. hafta ({w.contentDays} içerikli / {w.emptyDays} boş)
                    </span>
                    <span className="text-emerald-700">{fmt(w.avgEnergy, " kcal")}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-[11px] font-medium leading-relaxed text-slate-400">
            Ortalamalar yalnızca içerikli günler (≥1 besin) üzerinden hesaplanır; boş günler ortalamayı düşürmez.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/70 px-3 py-2">
      <p className="text-[11px] font-bold text-slate-400">{label}</p>
      <p className="mt-0.5 text-[15px] font-black text-slate-800">{value}</p>
    </div>
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
    else setErr("Şablon kaydedilemedi.");
  };

  return (
    <Modal open onClose={onClose} title="Günü Şablon Olarak Kaydet" subtitle={dayLabel} maxWidthClass="max-w-md">
      <div className="flex flex-col gap-3">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn: 2000 kcal Standart Gün" autoFocus />
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
        <div className="flex justify-end gap-2">
          <GhostButton onClick={onClose}>Vazgeç</GhostButton>
          <PrimaryButton loading={saving} disabled={!title.trim()} onClick={() => void save()}>
            Kaydet
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
    else if (r.code === "TARGET_NOT_EMPTY") setErr("Bu gün dolu — gün şablonu yalnızca boş güne uygulanır. Öğün şablonu ekleyebilirsiniz.");
    else setErr("Uygulama başarısız.");
  };

  return (
    <Modal open onClose={onClose} title="Şablon Uygula" subtitle="Öğün şablonu eklenir; gün şablonu boş güne uygulanır" maxWidthClass="max-w-lg">
      {loading ? (
        <InlineSpinner />
      ) : rows.length === 0 ? (
        <EmptyState title="Şablon yok" description="Önce bir öğün veya günü şablon olarak kaydedin." />
      ) : (
        <div className="flex flex-col gap-2">
          {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
          {rows.map((tpl) => (
            <div key={tpl.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white/70 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-black text-slate-700">{tpl.title}</p>
                <p className="text-[11px] font-bold text-emerald-600">{TEMPLATE_TYPE_LABELS[tpl.template_type]}</p>
              </div>
              <PrimaryButton loading={busyId === tpl.id} onClick={() => void apply(tpl)}>
                {tpl.template_type === "day" ? "Günü Uygula" : "Öğün Ekle"}
              </PrimaryButton>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
