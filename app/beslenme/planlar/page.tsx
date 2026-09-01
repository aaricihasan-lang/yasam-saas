"use client";
/**
 * Beslenme Planları listesi. Plan kartları + durum filtresi + yeni plan. Kart
 * aksiyonları: Aç / Kopyala / Yeni Revizyon / Arşivle (2 adımlı onay). Arşiv
 * planlarda yalnız Kopyala.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { runInEffect } from "@/lib/runInEffect";
import { useRouter } from "next/navigation";
import { CalendarDays, Copy, GitBranch, Plus } from "lucide-react";
import {
  copyPlan,
  listPlans,
  patchPlan,
  revisePlan,
  type Plan,
} from "@/lib/beslenme/planClient";
import {
  BeslenmeGate,
  BeslenmeShell,
  useBeslenmeOwnerGuard,
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

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tümü" },
  { value: "draft", label: "Taslak" },
  { value: "active", label: "Aktif" },
  { value: "archived", label: "Arşiv" },
];

export default function PlanlarPage() {
  const guard = useBeslenmeOwnerGuard();
  const router = useRouter();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
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
    const r = await listPlans({ status: filter || undefined });
    setLoading(false);
    if (r.ok && r.data) setPlans(r.data.plans ?? []);
    else setErr(friendlyPlanError(r.code, r.status));
  }, [filter]);

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

  async function doArchive(plan: Plan) {
    setBusyId(plan.id);
    setActionErr("");
    const r = await patchPlan(plan.id, { status: "archived", expectedUpdatedAt: plan.updated_at });
    setBusyId(null);
    setConfirmArchiveId(null);
    if (r.ok) await load();
    else setActionErr(friendlyPlanError(r.code, r.status));
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
      {/* Durum filtresi */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-xl border px-3.5 py-1.5 text-[12px] font-black shadow-sm transition ${
              filter === f.value
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

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
          description={filter ? "Bu duruma uygun plan bulunamadı." : "İlk beslenme planınızı oluşturarak başlayın."}
          action={
            <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setDialogOpen(true)}>
              Yeni Plan
            </PrimaryButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => {
            const archived = p.status === "archived";
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

                {archived ? (
                  <p className="mt-1 text-[11px] font-bold text-amber-600">Arşiv — yalnız kopyalanabilir</p>
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
                    Kopyala
                  </GhostButton>
                  {!archived ? (
                    <>
                      <GhostButton
                        icon={<GitBranch className="h-4 w-4" />}
                        loading={busyId === p.id}
                        onClick={() => void doRevise(p)}
                      >
                        Yeni Revizyon
                      </GhostButton>
                      {confirmArchiveId === p.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[12px] font-bold text-rose-600">Emin misiniz?</span>
                          <DangerButton loading={busyId === p.id} onClick={() => void doArchive(p)}>
                            Evet
                          </DangerButton>
                          <GhostButton onClick={() => setConfirmArchiveId(null)}>Vazgeç</GhostButton>
                        </span>
                      ) : (
                        <DangerButton onClick={() => setConfirmArchiveId(p.id)}>Arşivle</DangerButton>
                      )}
                    </>
                  ) : null}
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
