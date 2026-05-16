"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { problemToDraft } from "../lib/protocolStorage";
import { resolveProblemDisplayRegions } from "../lib/resolveDisplayRegions";
import { useProtocolCatalog } from "../hooks/useProtocolCatalog";
import type { ProtocolFootView, ProtocolProblem, ProtocolProblemDraft } from "../types";
import { ProtocolFootMap } from "./ProtocolFootMap";
import { ProtocolFormModal } from "./ProtocolFormModal";

type FormState =
  | { open: false }
  | { open: true; mode: "create"; initial: null }
  | { open: true; mode: "edit"; problem: ProtocolProblem };

export function ProtokolHaritasiLayout() {
  const { protocols, hydrated, addProtocol, updateProtocol, deleteProtocol } = useProtocolCatalog();
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [selectedOrganId, setSelectedOrganId] = useState<string | null>(null);
  const [footView, setFootView] = useState<ProtocolFootView>("taban");
  const [formState, setFormState] = useState<FormState>({ open: false });

  const selectedProblem = useMemo(
    () => protocols.find((p) => p.id === selectedProblemId) ?? null,
    [protocols, selectedProblemId],
  );

  const selectedOrgan = useMemo(
    () => selectedProblem?.organs.find((o) => o.id === selectedOrganId) ?? null,
    [selectedProblem, selectedOrganId],
  );

  const displayRegions = useMemo(() => {
    if (!selectedProblem) return [];
    return resolveProblemDisplayRegions(selectedProblem.organs, {
      organId: selectedOrganId,
      footView,
    });
  }, [selectedProblem, selectedOrganId, footView]);

  const selectProblem = (problem: ProtocolProblem) => {
    setSelectedProblemId(problem.id);
    const firstOrgan = problem.organs[0] ?? null;
    setSelectedOrganId(firstOrgan?.id ?? null);
    setFootView(firstOrgan?.footView ?? "taban");
  };

  const handleSaveForm = (draft: ProtocolProblemDraft) => {
    if (formState.open && formState.mode === "edit") {
      const updated = updateProtocol(formState.problem.id, draft);
      if (updated) selectProblem(updated);
    } else {
      const created = addProtocol(draft);
      if (created) selectProblem(created);
    }
    setFormState({ open: false });
  };

  const handleDelete = () => {
    if (!selectedProblem) return;
    const removed = deleteProtocol(selectedProblem.id);
    if (removed) {
      setSelectedProblemId(null);
      setSelectedOrganId(null);
    }
  };

  if (!hydrated) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-sm font-semibold text-violet-900">Protokoller yükleniyor…</p>
      </main>
    );
  }

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full min-h-0 flex-col px-2 py-1.5 sm:px-3">
        <div className="flex max-h-[90px] shrink-0 items-center gap-3 pb-1">
          <Link
            href="/refleksoloji"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-violet-300/95 bg-white/90 px-3 py-2 text-base font-extrabold text-violet-950 shadow-md ring-1 ring-violet-200/80 backdrop-blur-sm transition hover:border-violet-400 hover:bg-white hover:shadow-lg sm:px-3.5"
          >
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">Ana Menü</span>
          </Link>
          <header className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-violet-700/90 sm:text-xs">
              Refleksoloji · Protokol Haritası
            </p>
            <h1 className="truncate text-xl font-black leading-tight tracking-tight text-slate-900 sm:text-2xl">
              Protokol Haritası
            </h1>
            <p className="line-clamp-1 text-sm font-medium text-slate-600">
              Hedef seçin, protokolleri yönetin ve ayak bölgelerini görüntüleyin.
            </p>
          </header>
        </div>

        <div className="flex min-h-0 flex-1 gap-2 lg:gap-3">
          <aside className="flex h-full min-h-0 w-full shrink-0 flex-col rounded-2xl border border-white/90 bg-white/80 p-3 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md lg:w-[280px]">
            <h2 className="text-lg font-black uppercase tracking-[0.18em] text-violet-900">
              Hedef / Sorun Seç
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Protokol seçin veya yeni ekleyin
            </p>

            <button
              type="button"
              onClick={() => setFormState({ open: true, mode: "create", initial: null })}
              className="mt-2 w-full rounded-xl border border-emerald-300/80 bg-emerald-50/95 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-100/90"
            >
              + Yeni Protokol
            </button>

            <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
              {protocols.map((problem) => {
                const isActive = problem.id === selectedProblemId;
                return (
                  <li key={problem.id}>
                    <button
                      type="button"
                      onClick={() => selectProblem(problem)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-all duration-200 ${
                        isActive
                          ? `bg-gradient-to-r ${problem.accentClass} text-slate-900 shadow-md ring-2 ring-violet-400/50`
                          : "border-violet-100/90 bg-gradient-to-r from-violet-50/90 via-fuchsia-50/70 to-white/80 text-slate-800 shadow-sm hover:border-violet-200 hover:from-violet-100/90"
                      }`}
                      aria-pressed={isActive}
                    >
                      <span className="block text-base font-bold">{problem.title}</span>
                      <span className="mt-1 line-clamp-2 text-xs font-medium text-slate-600">
                        {problem.shortDescription}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:gap-3">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/90 bg-white/80 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md lg:max-w-[420px]">
              {!selectedProblem ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                  <p className="text-base font-bold text-violet-900">Henüz sorun seçilmedi</p>
                  <p className="mt-2 text-sm font-medium text-slate-600">
                    Soldan bir hedef seçin veya yeni protokol ekleyin.
                  </p>
                </div>
              ) : (
                <>
                  <div className="shrink-0 border-b border-violet-100/80 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-900">{selectedProblem.title}</h2>
                        <p className="mt-1 text-sm font-medium text-slate-600">
                          {selectedProblem.shortDescription}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setFormState({
                              open: true,
                              mode: "edit",
                              problem: selectedProblem,
                            })
                          }
                          className="rounded-lg border border-violet-300/80 bg-violet-100 px-2 py-1 text-xs font-bold text-violet-950 hover:bg-violet-200/90"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={handleDelete}
                          className="rounded-lg border border-rose-300/80 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-900 hover:bg-rose-100/90"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  </div>

                  <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
                    {selectedProblem.organs.map((organ) => {
                      const isOrganActive = organ.id === selectedOrganId;
                      return (
                        <li key={organ.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrganId(organ.id);
                              setFootView(organ.footView);
                            }}
                            className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                              isOrganActive
                                ? "border-red-300/80 bg-red-50/90 ring-1 ring-red-200/80"
                                : "border-violet-100/90 bg-white/90 hover:border-violet-200 hover:bg-violet-50/50"
                            }`}
                            aria-pressed={isOrganActive}
                          >
                            <span className="block text-base font-bold text-slate-900">{organ.name}</span>
                            <p className="mt-1.5 text-sm font-semibold leading-snug text-red-900/90">
                              {organ.protocolSummary}
                            </p>
                            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                              {organ.applicationNotes}
                            </p>
                            <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                              {organ.footView === "taban" ? "Taban" : "Yan"} ·{" "}
                              {organ.footSide === "both"
                                ? "Her iki ayak"
                                : organ.footSide === "left"
                                  ? "Sol ayak"
                                  : "Sağ ayak"}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="shrink-0 border-t border-violet-100/80 p-3">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFootView("taban")}
                        aria-pressed={footView === "taban"}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                          footView === "taban"
                            ? "border-fuchsia-400/80 bg-fuchsia-100/90 text-fuchsia-950"
                            : "border-violet-200/80 bg-violet-50/80 text-violet-800"
                        }`}
                      >
                        Taban
                      </button>
                      <button
                        type="button"
                        onClick={() => setFootView("yan")}
                        aria-pressed={footView === "yan"}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                          footView === "yan"
                            ? "border-fuchsia-400/80 bg-fuchsia-100/90 text-fuchsia-950"
                            : "border-violet-200/80 bg-violet-50/80 text-violet-800"
                        }`}
                      >
                        Yan
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="hidden min-h-0 min-w-0 flex-1 lg:flex">
              {selectedProblem ? (
                <ProtocolFootMap
                  regions={displayRegions}
                  footView={footView}
                  highlightOrgan={selectedOrgan?.name ?? null}
                  activeOrganName={selectedOrgan?.name ?? null}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-violet-200/70 bg-white/60 px-6 text-center text-sm font-medium text-slate-500">
                  Sorun seçildiğinde ayak haritası burada açılır.
                </div>
              )}
            </div>
          </section>
        </div>

        {selectedProblem ? (
          <div className="mt-2 h-[42vh] shrink-0 lg:hidden">
            <ProtocolFootMap
              regions={displayRegions}
              footView={footView}
              highlightOrgan={selectedOrgan?.name ?? null}
              activeOrganName={selectedOrgan?.name ?? null}
            />
          </div>
        ) : null}
      </div>

      <ProtocolFormModal
        open={formState.open}
        mode={formState.open && formState.mode === "edit" ? "edit" : "create"}
        initial={
          formState.open && formState.mode === "edit"
            ? problemToDraft(formState.problem)
            : null
        }
        onClose={() => setFormState({ open: false })}
        onSave={handleSaveForm}
      />
    </main>
  );
}
