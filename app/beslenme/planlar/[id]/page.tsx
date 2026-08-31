"use client";
/**
 * Beslenme Planı editörü (orkestratör). getPlan ile plan + gün özetleri yüklenir.
 * Gün / Hafta / Ay görünümleri arasında geçiş; seçili gün burada tutulur. Arşiv
 * planı salt-okunur. Meta düzenleme optimistic-concurrency (expectedUpdatedAt).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  Copy,
  GitBranch,
  Lock,
  Settings2,
  UtensilsCrossed,
} from "lucide-react";
import {
  copyPlan,
  getPlan,
  patchPlan,
  revisePlan,
  syncRange,
  type Plan,
  type PlanDaySummary,
} from "@/lib/beslenme/planClient";
import { cleanDate, daysBetween } from "@/lib/beslenme/planContracts";
import {
  BeslenmeGate,
  BeslenmeShell,
  useBeslenmeOwnerGuard,
} from "../../_components/BeslenmeShell";
import {
  DangerButton,
  Field,
  GhostButton,
  InlineSpinner,
  PrimaryButton,
  StatusMessage,
  TextArea,
  TextInput,
} from "../../_components/primitives";
import { Modal } from "../_components/planUi";
import {
  formatDateTr,
  friendlyPlanError,
  revisionLabel,
  statusClass,
  statusLabel,
} from "../_components/planFormat";
import { PlanTools } from "../_components/PlanTools";
import { DayEditor } from "../_components/DayEditor";
import { WeekView } from "../_components/WeekView";
import { MonthView } from "../_components/MonthView";

type View = "day" | "week" | "month";

export default function PlanEditorPage() {
  const guard = useBeslenmeOwnerGuard();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [plan, setPlan] = useState<Plan | null>(null);
  const [days, setDays] = useState<PlanDaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [view, setView] = useState<View>("day");
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionErr, setActionErr] = useState("");

  const reloadPlan = useCallback(async () => {
    if (!id) return;
    const r = await getPlan(id);
    if (r.ok && r.data?.plan) {
      setPlan(r.data.plan);
      const ds = r.data.days ?? [];
      setDays(ds);
      setSelectedDayId((prev) => (prev && ds.some((d) => d.id === prev) ? prev : ds[0]?.id ?? null));
      setErr("");
    } else {
      setErr(friendlyPlanError(r.code, r.status));
    }
  }, [id]);

  useEffect(() => {
    if (guard !== "ok") return;
    let alive = true;
    void (async () => {
      setLoading(true);
      await reloadPlan();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [guard, reloadPlan]);

  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  const archived = plan?.status === "archived";

  async function doCopy() {
    if (!plan) return;
    setActionBusy(true);
    setActionErr("");
    const r = await copyPlan(plan.id, {});
    setActionBusy(false);
    if (r.ok && r.data?.plan) router.push(`/beslenme/planlar/${r.data.plan.id}`);
    else setActionErr(friendlyPlanError(r.code, r.status));
  }

  async function doRevise() {
    if (!plan) return;
    setActionBusy(true);
    setActionErr("");
    const r = await revisePlan(plan.id);
    setActionBusy(false);
    if (r.ok && r.data?.plan) router.push(`/beslenme/planlar/${r.data.plan.id}`);
    else setActionErr(friendlyPlanError(r.code, r.status));
  }

  async function doArchive() {
    if (!plan) return;
    setActionBusy(true);
    setActionErr("");
    const r = await patchPlan(plan.id, { status: "archived", expectedUpdatedAt: plan.updated_at });
    setActionBusy(false);
    setConfirmArchive(false);
    if (r.ok) await reloadPlan();
    else setActionErr(friendlyPlanError(r.code, r.status));
  }

  const headerActions = plan ? (
    <div className="flex flex-wrap items-center gap-2">
      <PlanTools
        planId={plan.id}
        days={days}
        selectedDayId={selectedDayId}
        archived={archived}
        onChanged={() => void reloadPlan()}
      />
      <GhostButton icon={<Copy className="h-4 w-4" />} loading={actionBusy} onClick={() => void doCopy()}>
        Kopyala
      </GhostButton>
      {!archived ? (
        <>
          <GhostButton icon={<GitBranch className="h-4 w-4" />} loading={actionBusy} onClick={() => void doRevise()}>
            Yeni Revizyon
          </GhostButton>
          <GhostButton icon={<Settings2 className="h-4 w-4" />} onClick={() => setMetaOpen(true)}>
            Düzenle
          </GhostButton>
          {confirmArchive ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-[12px] font-bold text-rose-600">Emin misiniz?</span>
              <DangerButton loading={actionBusy} onClick={() => void doArchive()}>
                Evet, Arşivle
              </DangerButton>
              <GhostButton onClick={() => setConfirmArchive(false)}>Vazgeç</GhostButton>
            </span>
          ) : (
            <DangerButton onClick={() => setConfirmArchive(true)}>Arşivle</DangerButton>
          )}
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <BeslenmeShell
      title={plan ? plan.title : "Plan"}
      subtitle={
        plan
          ? `${formatDateTr(plan.start_date)} – ${formatDateTr(plan.end_date)}`
          : "Beslenme planı yükleniyor…"
      }
      icon={<UtensilsCrossed className="h-32 w-32" strokeWidth={1} />}
      backHref="/beslenme/planlar"
      backLabel="Planlar"
      actions={headerActions}
    >
      {loading ? (
        <InlineSpinner label="Plan yükleniyor…" />
      ) : err || !plan ? (
        <StatusMessage type="error">{err || "Plan bulunamadı."}</StatusMessage>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Bilgi şeridi */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${statusClass(plan.status)}`}>
              {statusLabel(plan.status)}
            </span>
            {plan.revision_number > 1 ? (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-600">
                {revisionLabel(plan.revision_number)}
              </span>
            ) : null}
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">
              {plan.daily_energy_target ? `${plan.daily_energy_target.toLocaleString("tr-TR")} kcal/gün` : "Hedef yok"}
            </span>
            <span className="text-[11px] font-bold text-slate-400">{days.length} gün</span>
          </div>

          {actionErr ? <StatusMessage type="error">{actionErr}</StatusMessage> : null}

          {archived ? (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-800">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>Bu plan arşivlenmiş — salt-okunur. Düzenlemek için kopyalayın.</span>
            </div>
          ) : null}

          {/* Görünüm sekmeleri */}
          <div className="inline-flex w-fit gap-1 rounded-xl bg-white/70 p-1 ring-1 ring-emerald-100">
            <ViewTab active={view === "day"} onClick={() => setView("day")} icon={<UtensilsCrossed className="h-4 w-4" />}>
              Gün
            </ViewTab>
            <ViewTab active={view === "week"} onClick={() => setView("week")} icon={<CalendarRange className="h-4 w-4" />}>
              Hafta
            </ViewTab>
            <ViewTab active={view === "month"} onClick={() => setView("month")} icon={<CalendarDays className="h-4 w-4" />}>
              Ay
            </ViewTab>
          </div>

          {view === "day" ? (
            <DayEditor
              key={selectedDayId ?? "none"}
              plan={plan}
              days={days}
              selectedDayId={selectedDayId}
              setSelectedDayId={setSelectedDayId}
              readOnly={archived}
              onChanged={() => void reloadPlan()}
            />
          ) : view === "week" ? (
            <WeekView
              plan={plan}
              days={days}
              selectedDayId={selectedDayId}
              readOnly={archived}
              onOpenDay={(dayId) => {
                setSelectedDayId(dayId);
                setView("day");
              }}
              onChanged={() => void reloadPlan()}
            />
          ) : (
            <MonthView
              plan={plan}
              days={days}
              onOpenDay={(dayId) => {
                setSelectedDayId(dayId);
                setView("day");
              }}
            />
          )}
        </div>
      )}

      {plan && metaOpen ? (
        <PlanMetaDialog
          onClose={() => setMetaOpen(false)}
          plan={plan}
          onSaved={() => {
            setMetaOpen(false);
            void reloadPlan();
          }}
        />
      ) : null}
    </BeslenmeShell>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-black transition ${
        active ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ── Plan meta düzenleme (ad/not/hedef + tarih aralığı) ── (koşullu mount) */
function PlanMetaDialog({
  onClose,
  plan,
  onSaved,
}: {
  onClose: () => void;
  plan: Plan;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [note, setNote] = useState(plan.note ?? "");
  const [target, setTarget] = useState(plan.daily_energy_target != null ? String(plan.daily_energy_target) : "");
  const [start, setStart] = useState(plan.start_date);
  const [end, setEnd] = useState(plan.end_date);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    const t = title.trim();
    if (!t) {
      setErr("Plan adı zorunludur.");
      return;
    }
    let dailyTarget: number | null = null;
    const rawTarget = target.trim().replace(",", ".");
    if (rawTarget) {
      const n = Number(rawTarget);
      if (!Number.isFinite(n) || n <= 0) {
        setErr("Günlük kalori hedefi geçerli bir sayı olmalı.");
        return;
      }
      dailyTarget = Math.round(n);
    }

    setSaving(true);
    // 1) Meta (optimistic-concurrency).
    const meta = await patchPlan(plan.id, {
      title: t,
      note: note.trim() || null,
      daily_energy_target: dailyTarget,
      expectedUpdatedAt: plan.updated_at,
    });
    if (!meta.ok) {
      setSaving(false);
      setErr(friendlyPlanError(meta.code, meta.status));
      return;
    }

    // 2) Tarih aralığı değiştiyse syncRange.
    const s = cleanDate(start);
    const e = cleanDate(end);
    if (!s || !e) {
      setSaving(false);
      setErr("Geçerli başlangıç ve bitiş tarihi girin.");
      return;
    }
    if (s !== plan.start_date || e !== plan.end_date) {
      if (daysBetween(s, e) < 0) {
        setSaving(false);
        setErr("Bitiş tarihi, başlangıç tarihinden önce olamaz.");
        return;
      }
      const range = await syncRange(plan.id, { start_date: s, end_date: e });
      if (!range.ok) {
        setSaving(false);
        setErr(friendlyPlanError(range.code, range.status));
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Planı Düzenle" subtitle={plan.title} maxWidthClass="max-w-lg">
      <div className="flex flex-col gap-3">
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}
        <Field label="Plan Adı" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Günlük Kalori Hedefi" hint="opsiyonel">
          <TextInput inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Örn: 2000" />
        </Field>
        <Field label="Not" hint="opsiyonel">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Plana dair not…" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Başlangıç Tarihi">
            <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Bitiş Tarihi">
            <TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} min={start} />
          </Field>
        </div>
        <p className="text-[11px] font-medium text-slate-400">
          Tarih aralığını daraltırken, aralık dışında öğün bulunan günler varsa değişiklik reddedilir.
        </p>
        <div className="flex items-center justify-end gap-2">
          <GhostButton onClick={onClose}>Vazgeç</GhostButton>
          <PrimaryButton loading={saving} onClick={() => void save()}>
            Kaydet
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
