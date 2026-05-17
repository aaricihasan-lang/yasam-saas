"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

type MineralRecord = {
  id: string;
  tenant_id: string;
  mineral_name: string;
  general_info: string | null;
  organ_effects: string | null;
  deficiency_symptoms: string | null;
  excess_symptoms: string | null;
  overdose: string | null;
  physiology: string | null;
  physical_effects: string | null;
  mental_spiritual_effects: string | null;
  related_stones: string | null;
  stone_count: number | null;
  proportional: number | null;
  created_at: string;
  updated_at: string | null;
};

type SearchType =
  | "all"
  | "mineral_name"
  | "general_info"
  | "organ_effects"
  | "deficiency_symptoms"
  | "overdose"
  | "physiology"
  | "related_stones";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function preview(value: string | null | undefined, limit = 80) {
  if (!value || !value.trim()) return "—";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}...` : clean;
}

function relatedStoneCount(value: string | null | undefined) {
  if (!value || !value.trim()) return 0;

  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function filledCount(mineral: MineralRecord) {
  return [
    mineral.general_info,
    mineral.organ_effects,
    mineral.deficiency_symptoms,
    mineral.excess_symptoms,
    mineral.overdose,
    mineral.physiology,
    mineral.physical_effects,
    mineral.mental_spiritual_effects,
    mineral.related_stones,
  ].filter((item) => item && item.trim().length > 0).length;
}

const uiHeaderCard =
  "rounded-[32px] border-[3px] border-emerald-400/40 bg-white/70 p-6 shadow-[0_0_40px_rgba(16,185,129,0.14)] backdrop-blur-xl";
const uiFilterCard =
  "rounded-[28px] border-[3px] border-amber-300/40 bg-white/70 p-5 shadow-[0_0_35px_rgba(245,158,11,0.14)] backdrop-blur-xl";
const uiTableCard =
  "w-full min-h-[520px] overflow-hidden rounded-[32px] border-[3px] border-emerald-400/40 bg-white/75 shadow-[0_0_45px_rgba(16,185,129,0.16)] backdrop-blur-xl";
const uiField =
  "h-14 rounded-2xl border-2 border-emerald-200 bg-white/90 px-5 font-semibold shadow-inner outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30";
const uiActionBtn =
  "rounded-2xl px-6 py-4 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5";
const uiStatCard =
  "rounded-2xl border-2 border-amber-300/40 bg-white/80 px-8 py-4 text-center shadow-md";

export default function MineralListesiPage() {
  const [minerals, setMinerals] = useState<MineralRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mineralToDelete, setMineralToDelete] = useState<MineralRecord | null>(
    null
  );

  async function loadMinerals() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("minerals")
      .select("*")
      .eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      setErrorMessage(`Mineraller alınamadı: ${error.message}`);
      return;
    }

    setMinerals((data || []) as MineralRecord[]);
  }

  useEffect(() => {
    runInEffect(() => {
      loadMinerals();
    });
  }, []);

  const filteredMinerals = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("tr-TR");
    if (!keyword) return minerals;

    return minerals.filter((mineral) => {
      if (searchType === "all") {
        const text = [
          mineral.mineral_name,
          mineral.general_info,
          mineral.organ_effects,
          mineral.deficiency_symptoms,
          mineral.excess_symptoms,
          mineral.overdose,
          mineral.physiology,
          mineral.physical_effects,
          mineral.mental_spiritual_effects,
          mineral.related_stones,
        ]
          .join(" ")
          .toLocaleLowerCase("tr-TR");

        return text.includes(keyword);
      }

      const target = String(mineral[searchType] || "").toLocaleLowerCase("tr-TR");
      return target.includes(keyword);
    });
  }, [minerals, search, searchType]);

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleSelectAll() {
    const visibleIds = filteredMinerals.map((mineral) => mineral.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleIds.includes(id))
      );
      return;
    }

    setSelectedIds((current) => Array.from(new Set([...current, ...visibleIds])));
  }

  async function deleteMineral() {
    if (!mineralToDelete) return;

    setDeleteLoading(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("minerals")
      .delete()
      .eq("tenant_id", TENANT_ID)
      .eq("id", mineralToDelete.id);

    setDeleteLoading(false);

    if (error) {
      setErrorMessage(`Mineral silinemedi: ${error.message}`);
      return;
    }

    setMinerals((current) =>
      current.filter((mineral) => mineral.id !== mineralToDelete.id)
    );
    setSelectedIds((current) =>
      current.filter((id) => id !== mineralToDelete.id)
    );
    setMineralToDelete(null);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#f5f5dc_35%,#ecfccb_100%)] text-slate-950">
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-amber-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-emerald-300/20 blur-[150px]" />

      <div className="relative z-10 w-full px-6 py-6 xl:px-10 2xl:px-14">
        <header className={`${uiHeaderCard} mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link
                href="/dogaltas"
                className="rounded-2xl border border-white/40 bg-white/60 px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400/60"
              >
                ← Geri
              </Link>

              <span className="rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-amber-800 ring-1 ring-amber-100">
                ⚗️ MİNERAL LİSTESİ
              </span>
            </div>

            <h1 className="text-4xl font-black tracking-tight text-slate-950">
              Mineral Listesi
            </h1>

            <p className="mt-2 text-base font-medium text-slate-600">
              Kayıtlı mineralleri arayın, seçin, detaylandırın veya düzenleyin.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 lg:min-w-[480px]">
            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">{minerals.length}</div>
              <div className="text-xs font-bold text-slate-500">Kayıt</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">{selectedIds.length}</div>
              <div className="text-xs font-bold text-slate-500">Seçili</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">
                {filteredMinerals.length}
              </div>
              <div className="text-xs font-bold text-slate-500">Sonuç</div>
            </div>
          </div>
        </header>

        <section className={`${uiFilterCard} mb-5`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <select
              value={searchType}
              onChange={(event) => setSearchType(event.target.value as SearchType)}
              className={`${uiField} text-sm font-black text-slate-700 xl:w-[260px]`}
            >
              <option value="all">Tüm Alanlarda Ara</option>
              <option value="mineral_name">Mineral Adı</option>
              <option value="general_info">Genel Bilgi</option>
              <option value="organ_effects">Organ Etkileri</option>
              <option value="deficiency_symptoms">Eksiklik</option>
              <option value="overdose">Doz</option>
              <option value="physiology">Fizyoloji</option>
              <option value="related_stones">İçeren Taşlar</option>
            </select>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ara... Mineral adı, detay veya içeren taş..."
              className={`${uiField} flex-1 text-sm text-slate-700`}
            />

            <button
              type="button"
              onClick={loadMinerals}
              className={`${uiActionBtn} border-2 border-emerald-200/80 bg-white/80 text-slate-700 hover:border-emerald-400`}
            >
              Yenile
            </button>

            <button
              type="button"
              onClick={toggleSelectAll}
              className={`${uiActionBtn} border-2 border-amber-200/80 bg-white/80 text-slate-700 hover:border-amber-400`}
            >
              Tümünü Seç
            </button>

            <Link
              href="/dogaltas/mineral-bankasi"
              className={`${uiActionBtn} bg-gradient-to-r from-emerald-500 to-amber-500 text-white shadow-[0_10px_30px_rgba(16,185,129,0.25)] hover:brightness-110`}
            >
              + Yeni Mineral
            </Link>
          </div>
        </section>

        {errorMessage && (
          <div className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        )}

        <section className={`${uiTableCard} p-4`}>
          {loading ? (
            <div className="flex min-h-[520px] items-center justify-center text-base font-black text-slate-500">
              Mineraller yükleniyor...
            </div>
          ) : filteredMinerals.length === 0 ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[24px] bg-gradient-to-br from-white/70 to-emerald-50/80 text-center ring-1 ring-emerald-100/60">
              <div className="text-[54px]">⚗️</div>
              <h2 className="mt-3 text-[20px] font-black text-slate-950">
                Mineral bulunamadı
              </h2>
              <p className="mt-2 text-[13px] text-slate-500">
                Yeni mineral ekleyin veya farklı bir arama deneyin.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-hidden rounded-[24px] bg-white/85 ring-1 ring-emerald-100/70">
              <div className="grid grid-cols-[0.35fr_1fr_0.55fr_1.35fr_0.9fr_0.9fr_0.7fr_0.75fr] gap-3 border-b border-emerald-200 bg-gradient-to-r from-emerald-50 via-amber-50 to-white px-5 py-5 text-xs font-black uppercase tracking-[0.18em] text-slate-700 xl:text-sm">
                <div>Seç</div>
                <div>Mineral</div>
                <div>Taş</div>
                <div>İçeren Taşlar</div>
                <div>Fizyoloji</div>
                <div>Eksiklik</div>
                <div>Doz</div>
                <div className="text-right">İşlem</div>
              </div>

              <div className="divide-y divide-emerald-100">
                {filteredMinerals.map((mineral) => {
                  const selected = selectedIds.includes(mineral.id);
                  const relatedCount = relatedStoneCount(mineral.related_stones);

                  return (
                    <div
                      key={mineral.id}
                      className={`grid grid-cols-[0.35fr_1fr_0.55fr_1.35fr_0.9fr_0.9fr_0.7fr_0.75fr] gap-3 border-b border-emerald-100 px-5 py-5 text-sm transition-colors hover:bg-emerald-50/70 xl:text-base ${
                        selected ? "bg-emerald-100/60" : ""
                      }`}
                    >
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => toggleSelected(mineral.id)}
                          className={`flex h-6 w-6 items-center justify-center rounded-lg text-[12px] font-black ring-1 transition ${
                            selected
                              ? "bg-emerald-600 text-white ring-emerald-600"
                              : "bg-white text-slate-300 ring-emerald-200 hover:ring-emerald-400"
                          }`}
                        >
                          {selected ? "✓" : ""}
                        </button>
                      </div>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="min-w-0"
                      >
                        <div className="truncate text-base font-black text-slate-950">
                          {mineral.mineral_name}
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          {filledCount(mineral)} bölüm · {formatDate(mineral.created_at)}
                        </div>
                      </Link>

                      <div className="flex items-center">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-100">
                          {relatedCount}
                        </span>
                      </div>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="flex items-center text-sm leading-6 text-slate-600 xl:text-base"
                      >
                        {preview(mineral.related_stones, 115)}
                      </Link>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="flex items-center text-sm leading-6 text-slate-600 xl:text-base"
                      >
                        {preview(mineral.physiology)}
                      </Link>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="flex items-center text-sm leading-6 text-slate-600 xl:text-base"
                      >
                        {preview(mineral.deficiency_symptoms)}
                      </Link>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="flex items-center text-sm leading-6 text-slate-600 xl:text-base"
                      >
                        {preview(mineral.overdose, 45)}
                      </Link>

                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dogaltas/mineral-listesi/${mineral.id}`}
                          className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-md transition hover:bg-emerald-700"
                        >
                          Detay
                        </Link>

                        <button
                          type="button"
                          onClick={() => setMineralToDelete(mineral)}
                          className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-600 transition hover:bg-red-100"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {mineralToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[430px] rounded-[28px] bg-white p-6 text-center shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-white">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-[28px] ring-1 ring-rose-100">
              ⚠️
            </div>

            <h2 className="mt-4 text-[22px] font-black text-slate-950">
              Minerali Sil
            </h2>

            <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-slate-600">
              <b>{mineralToDelete.mineral_name}</b> kaydını silmek istediğinizden emin misiniz?
            </p>

            <p className="mt-2 text-[12px] font-bold text-rose-600">
              Bu işlem geri alınamaz.
            </p>

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setMineralToDelete(null)}
                disabled={deleteLoading}
                className="rounded-2xl bg-slate-100 px-5 py-3 text-[13px] font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={deleteMineral}
                disabled={deleteLoading}
                className="rounded-2xl bg-rose-600 px-5 py-3 text-[13px] font-black text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteLoading ? "Siliniyor..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
