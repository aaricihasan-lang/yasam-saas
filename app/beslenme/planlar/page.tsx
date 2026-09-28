"use client";
/**
 * Beslenme Planları listesi. Plan kartları + yeni plan. Kart aksiyonları:
 * Aç / Kopyala / Yeni Revizyon / Sil (açık onay; arşiv YOK). Geçmişten kalan
 * kilitli (legacy archived) planlarda yalnız Kopyala + Sil.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { runInEffect } from "@/lib/runInEffect";
import { useRouter } from "next/navigation";
import { CalendarDays, Copy, GitBranch, Plus } from "lucide-react";
import {
  copyPlan,
  deletePlan,
  listPlans,
  revisePlan,
  type Plan,
} from "@/lib/beslenme/planClient";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { Trash2 } from "lucide-react";
import {
  BeslenmeGate,
  BeslenmeShell,
  useBeslenmeModuleGuard,
} from "../_components/BeslenmeShell";
import {
  DangerButton,
  EmptyState,
  GhostButton,
  InlineSpinner,
  PrimaryButton,
  StatusMessage,
} from "../_components/primitives";
import { NewPlanDialog } from "./_components/NewPlanDialog";
import {
  formatDateTr,
  friendlyPlanError,
  revisionLabel,
  statusClass,
  statusLabel,
} from "./_components/planFormat";

export default function PlanlarPage() {
  const guard = useBeslenmeModuleGuard();
  const router = useRouter();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [actionOk, setActionOk] = useState("");
  const deleteConfirm = useDeleteConfirm();
  // FAZ 7: danışan detayından "Yeni Beslenme Planı" → ?newForClient=&clientName= ile ön-seçili danışan.
  // useSearchParams yerine window.location (Suspense sınırı gerektirmez).
  const [presetClient, setPresetClient] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const cid = p.get("newForClient");
    if (cid) {
      runInEffect(() => {
        setPresetClient({ id: cid, name: p.get("clientName") || "Danışan" });
        setDialogOpen(true);
      });
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const r = await listPlans();
    setLoading(false);
    if (r.ok && r.data) setPlans(r.data.plans ?? []);
    else setErr(friendlyPlanError(r.code, r.status));
  }, []);

  useEffect(() => {
    if (guard !== "ok") return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [guard, load]);

  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  async function doCopy(plan: Plan) {
    setBusyId(plan.id);
    setActionErr("");
    const r = await copyPlan(plan.id, {});
    setBusyId(null);
    if (r.ok && r.data?.plan) router.push(`/beslenme/planlar/${r.data.plan.id}`);
    else setActionErr(friendlyPlanError(r.code, r.status));
  }

  async function doRevise(plan: Plan) {
    setBusyId(plan.id);
    setActionErr("");
    const r = await revisePlan(plan.id);
    setBusyId(null);
    if (r.ok && r.data?.plan) router.push(`/beslenme/planlar/${r.data.plan.id}`);
    else setActionErr(friendlyPlanError(r.code, r.status));
  }

  /** "Sil": bu plan revizyonu kalıcı silinir (onaylı; ilişkili gün/öğün/kalemler açıkça söylenir). */
  async function doDelete(plan: Plan) {
    if (busyId) return;
    const ok = await deleteConfirm({
      title: "Planı sil",
      message:
        "Bu plan kalıcı olarak silinecek. Plana ait tüm günler, öğünler ve besin kalemleri de silinir. " +
        "Varsa diğer revizyonlar etkilenmez.",
      names: [`${plan.title}${plan.revision_number > 1 ? ` (${revisionLabel(plan.revision_number)})` : ""}`],
      confirmText: "Sil",
    });
    if (!ok) return;
    setBusyId(plan.id);
    setActionErr("");
    setActionOk("");
    const r = await deletePlan(plan.id);
    setBusyId(null);
    if (r.ok) {
      setActionOk(`"${plan.title}" silindi.`);
      await load();
    } else setActionErr(friendlyPlanError(r.code, r.status));
  }

  return (
    <BeslenmeShell
      title="Beslenme Planları"
      subtitle="Günlük, haftalık ve aylık beslenme planları. Kalori ve besin değerleri seçtiğiniz besinlerden otomatik hesaplanır."
      icon={<CalendarDays className="h-32 w-32" strokeWidth={1} />}
      backHref="/beslenme"
      actions={
        <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setDialogOpen(true)}>
          Yeni Plan
        </PrimaryButton>
      }
    >
      {actionOk ? (
        <div className="mb-4">
          <StatusMessage type="success">{actionOk}</StatusMessage>
        </div>
      ) : null}
      {actionErr ? (
        <div className="mb-4">
          <StatusMessage type="error">{actionErr}</StatusMessage>
        </div>
      ) : null}

      {loading ? (
        <InlineSpinner label="Planlar yükleniyor…" />
      ) : err ? (
        <div>
          <StatusMessage type="error">{err}</StatusMessage>
          <div className="mt-3">
            <GhostButton onClick={() => void load()}>Tekrar Dene</GhostButton>
          </div>
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="Henüz plan yok."
          description="İlk beslenme planınızı oluşturarak başlayın."
          action={
            <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setDialogOpen(true)}>
              Yeni Plan
            </PrimaryButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => {
            // Geçmişten kalan kilitli kayıt (legacy archived): düzenlenemez; kopyalanabilir / silinebilir.
            const locked = p.status === "archived";
            return (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl border border-emerald-100/70 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 truncate text-[15px] font-black text-slate-900">{p.title}</h2>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${statusClass(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                </div>

                <p className="mt-1 text-[12px] font-bold text-slate-500">
                  {formatDateTr(p.start_date)} – {formatDateTr(p.end_date)}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-black text-emerald-700">
                    {p.daily_energy_target ? `${p.daily_energy_target.toLocaleString("tr-TR")} kcal/gün` : "Hedef yok"}
                  </span>
                  {p.revision_number > 1 ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-black text-slate-600">
                      {revisionLabel(p.revision_number)}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-[11px] font-medium text-slate-400">
                  Son güncelleme: {formatDateTr(p.updated_at)}
                </p>

                {locked ? (
                  <p className="mt-1 text-[11px] font-bold text-amber-600">Düzenlemeye kapalı — düzenlemek için kopyalayın</p>
                ) : null}

                {/* Aksiyonlar */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <Link
                    href={`/beslenme/planlar/${p.id}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2 text-[13px] font-black text-white shadow-sm ring-1 ring-white/25 transition hover:brightness-105"
                  >
                    Aç
                  </Link>
                  <GhostButton
                    icon={<Copy className="h-4 w-4" />}
                    loading={busyId === p.id}
                    onClick={() => void doCopy(p)}
                  >
                    Planı Kopyala
                  </GhostButton>
                  {!locked ? (
                    <GhostButton
                      icon={<GitBranch className="h-4 w-4" />}
                      loading={busyId === p.id}
                      onClick={() => void doRevise(p)}
                    >
                      Yeni Revizyon
                    </GhostButton>
                  ) : null}
                  <DangerButton
                    icon={<Trash2 className="h-4 w-4" />}
                    loading={busyId === p.id}
                    onClick={() => void doDelete(p)}
                  >
                    Sil
                  </DangerButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogOpen ? (
        <NewPlanDialog
          open
          presetClient={presetClient}
          onClose={() => { setDialogOpen(false); setPresetClient(null); }}
          onCreated={(plan) => {
            setDialogOpen(false);
            setPresetClient(null);
            router.push(`/beslenme/planlar/${plan.id}`);
          }}
        />
      ) : null}
    </BeslenmeShell>
  );
}
