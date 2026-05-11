"use client";

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
    loadMinerals();
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
    <main className="min-h-screen bg-[linear-gradient(135deg,#eef8ff_0%,#f8f4ff_45%,#f6fffb_100%)] text-slate-950">
      <div className="mx-auto max-w-[1420px] px-5 py-4">
        <header className="mb-4 flex flex-col gap-3 rounded-[24px] bg-white/76 p-4 shadow-[0_14px_42px_rgba(15,23,42,0.04)] ring-1 ring-white/80 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link
                href="/dogaltas"
                className="rounded-2xl bg-white px-4 py-2 text-[12px] font-black text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50"
              >
                ← Geri
              </Link>

              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
                ⚗️ MİNERAL LİSTESİ
              </span>
            </div>

            <h1 className="text-[26px] font-black tracking-tight">
              Mineral Listesi
            </h1>

            <p className="mt-1 text-[12px] font-medium text-slate-500">
              Kayıtlı mineralleri arayın, seçin, detaylandırın veya düzenleyin.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:w-[430px]">
            <div className="rounded-2xl bg-white/80 px-3 py-2 text-center ring-1 ring-slate-100">
              <div className="text-[18px] font-black">{minerals.length}</div>
              <div className="text-[10px] font-bold text-slate-400">Kayıt</div>
            </div>

            <div className="rounded-2xl bg-white/80 px-3 py-2 text-center ring-1 ring-slate-100">
              <div className="text-[18px] font-black">{selectedIds.length}</div>
              <div className="text-[10px] font-bold text-slate-400">Seçili</div>
            </div>

            <div className="rounded-2xl bg-white/80 px-3 py-2 text-center ring-1 ring-slate-100">
              <div className="text-[18px] font-black">
                {filteredMinerals.length}
              </div>
              <div className="text-[10px] font-bold text-slate-400">Sonuç</div>
            </div>
          </div>
        </header>

        <section className="mb-4 rounded-[24px] bg-white/76 p-4 shadow-[0_14px_42px_rgba(15,23,42,0.035)] ring-1 ring-white/80">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <select
              value={searchType}
              onChange={(event) => setSearchType(event.target.value as SearchType)}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-700 outline-none transition focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70 xl:w-[245px]"
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
              className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-200 focus:ring-4 focus:ring-cyan-100/70"
            />

            <button
              type="button"
              onClick={loadMinerals}
              className="rounded-2xl bg-white px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50"
            >
              Yenile
            </button>

            <button
              type="button"
              onClick={toggleSelectAll}
              className="rounded-2xl bg-white px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50"
            >
              Tümünü Seç
            </button>

            <Link
              href="/dogaltas/mineral-bankasi"
              className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-[12px] font-black text-white shadow-[0_12px_24px_rgba(16,185,129,0.18)] transition hover:bg-emerald-700"
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

        <section className="rounded-[26px] bg-white/78 p-4 shadow-[0_16px_46px_rgba(15,23,42,0.04)] ring-1 ring-white/80">
          {loading ? (
            <div className="flex h-[340px] items-center justify-center text-[14px] font-black text-slate-400">
              Mineraller yükleniyor...
            </div>
          ) : filteredMinerals.length === 0 ? (
            <div className="flex h-[340px] flex-col items-center justify-center rounded-[24px] bg-white/70 text-center ring-1 ring-white">
              <div className="text-[54px]">⚗️</div>
              <h2 className="mt-3 text-[20px] font-black text-slate-950">
                Mineral bulunamadı
              </h2>
              <p className="mt-2 text-[13px] text-slate-500">
                Yeni mineral ekleyin veya farklı bir arama deneyin.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[22px] bg-white ring-1 ring-slate-100">
              <div className="grid grid-cols-[0.35fr_1fr_0.55fr_1.35fr_0.9fr_0.9fr_0.7fr_0.75fr] gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                <div>Seç</div>
                <div>Mineral</div>
                <div>Taş</div>
                <div>İçeren Taşlar</div>
                <div>Fizyoloji</div>
                <div>Eksiklik</div>
                <div>Doz</div>
                <div className="text-right">İşlem</div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredMinerals.map((mineral) => {
                  const selected = selectedIds.includes(mineral.id);
                  const relatedCount = relatedStoneCount(mineral.related_stones);

                  return (
                    <div
                      key={mineral.id}
                      className={`grid grid-cols-[0.35fr_1fr_0.55fr_1.35fr_0.9fr_0.9fr_0.7fr_0.75fr] gap-3 px-4 py-3 transition ${
                        selected ? "bg-cyan-50/70" : "hover:bg-cyan-50/35"
                      }`}
                    >
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => toggleSelected(mineral.id)}
                          className={`flex h-6 w-6 items-center justify-center rounded-lg text-[12px] font-black ring-1 transition ${
                            selected
                              ? "bg-cyan-600 text-white ring-cyan-600"
                              : "bg-white text-slate-300 ring-slate-200 hover:ring-cyan-200"
                          }`}
                        >
                          {selected ? "✓" : ""}
                        </button>
                      </div>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="min-w-0"
                      >
                        <div className="truncate text-[14px] font-black text-slate-950">
                          {mineral.mineral_name}
                        </div>
                        <div className="mt-0.5 text-[10px] font-bold text-slate-400">
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
                        className="flex items-center text-[12px] leading-5 text-slate-500"
                      >
                        {preview(mineral.related_stones, 115)}
                      </Link>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="flex items-center text-[12px] leading-5 text-slate-500"
                      >
                        {preview(mineral.physiology)}
                      </Link>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="flex items-center text-[12px] leading-5 text-slate-500"
                      >
                        {preview(mineral.deficiency_symptoms)}
                      </Link>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="flex items-center text-[12px] leading-5 text-slate-500"
                      >
                        {preview(mineral.overdose, 45)}
                      </Link>

                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dogaltas/mineral-listesi/${mineral.id}`}
                          className="rounded-xl bg-slate-950 px-3 py-2 text-[11px] font-black text-white transition hover:bg-slate-800"
                        >
                          Detay
                        </Link>

                        <button
                          type="button"
                          onClick={() => setMineralToDelete(mineral)}
                          className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100"
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
