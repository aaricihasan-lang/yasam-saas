"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const MINERALS_LIST_SELECT =
  "id,source_id,name,aciklama,kategori,fiziksel,zihinsel,fizyoloji,eksiklik_belirtileri,fazlalik_belirtileri,doz_asimi,iceren_taslar,created_at";

const UNCATEGORIZED_LABEL = "Kategorisiz";

type MineralRecord = {
  id: string;
  source_id: string;
  name: string;
  aciklama: string | null;
  kategori: string | null;
  fiziksel: string[] | null;
  zihinsel: string[] | null;
  fizyoloji: string[] | null;
  eksiklik_belirtileri: string[] | null;
  fazlalik_belirtileri: string[] | null;
  doz_asimi: string[] | null;
  iceren_taslar: string[] | null;
  created_at: string;
};

function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeMineral(row: MineralRecord): MineralRecord {
  return {
    ...row,
    fiziksel: ensureStringArray(row.fiziksel),
    zihinsel: ensureStringArray(row.zihinsel),
    fizyoloji: ensureStringArray(row.fizyoloji),
    eksiklik_belirtileri: ensureStringArray(row.eksiklik_belirtileri),
    fazlalik_belirtileri: ensureStringArray(row.fazlalik_belirtileri),
    doz_asimi: ensureStringArray(row.doz_asimi),
    iceren_taslar: ensureStringArray(row.iceren_taslar),
  };
}

function getCategoryLabel(kategori: string | null | undefined) {
  const trimmed = kategori?.trim();
  return trimmed || UNCATEGORIZED_LABEL;
}

function previewText(value: string | null | undefined, limit = 120) {
  if (!value || !value.trim()) return "Açıklama henüz girilmedi.";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

function mineralSearchBlob(mineral: MineralRecord) {
  return [
    mineral.name,
    mineral.aciklama,
    ...ensureStringArray(mineral.fiziksel),
    ...ensureStringArray(mineral.zihinsel),
    ...ensureStringArray(mineral.fizyoloji),
    ...ensureStringArray(mineral.iceren_taslar),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
}

const uiHeaderCard =
  "rounded-[32px] border-[3px] border-emerald-400/40 bg-white/70 px-6 py-10 shadow-[0_0_40px_rgba(16,185,129,0.14)] backdrop-blur-xl";
const uiFilterCard =
  "rounded-[28px] border-[3px] border-amber-300/40 bg-white/70 p-5 shadow-[0_0_35px_rgba(245,158,11,0.14)] backdrop-blur-xl";
const uiContentCard =
  "w-full min-h-[520px] rounded-[32px] border-[3px] border-emerald-400/40 bg-white/75 p-4 shadow-[0_0_45px_rgba(16,185,129,0.16)] backdrop-blur-xl";
const uiField =
  "h-14 rounded-2xl border-2 border-emerald-200 bg-white/90 px-5 font-semibold shadow-inner outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30";
const uiActionBtn =
  "rounded-2xl px-6 py-4 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5";
const uiStatCard =
  "rounded-2xl border-2 border-amber-300/40 bg-white/80 px-8 py-4 text-center shadow-md";
const uiMineralCard =
  "flex h-full flex-col rounded-[32px] border-[3px] border-emerald-300/45 bg-white/80 p-6 shadow-[0_0_40px_rgba(34,211,238,0.12)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-2 hover:border-amber-400 hover:shadow-[0_0_55px_rgba(245,158,11,0.18)]";
const uiCategoryPill =
  "inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-900";
const uiComboBtn =
  "mt-4 inline-flex w-fit items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 font-black text-white shadow-lg transition hover:bg-emerald-700";

export default function MineralListesiPage() {
  const [minerals, setMinerals] = useState<MineralRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  async function loadMinerals() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("minerals")
      .select(MINERALS_LIST_SELECT)
      .order("name", { ascending: true });

    setLoading(false);

    if (error) {
      setErrorMessage(`Mineral kayıtları okunamadı: ${error.message}`);
      setMinerals([]);
      return;
    }

    setMinerals(((data || []) as MineralRecord[]).map(normalizeMineral));
  }

  useEffect(() => {
    runInEffect(() => {
      loadMinerals();
    });
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const mineral of minerals) {
      set.add(getCategoryLabel(mineral.kategori));
    }
    return Array.from(set).sort((a, b) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b, "tr-TR");
    });
  }, [minerals]);

  const filteredMinerals = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("tr-TR");
    const category = categoryFilter.trim();

    return minerals.filter((mineral) => {
      if (category && getCategoryLabel(mineral.kategori) !== category) return false;
      if (!keyword) return true;
      return mineralSearchBlob(mineral).includes(keyword);
    });
  }, [minerals, search, categoryFilter]);

  const isEmptyDatabase = !loading && !errorMessage && minerals.length === 0;
  const isEmptyFiltered =
    !loading && !errorMessage && minerals.length > 0 && filteredMinerals.length === 0;

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
                className="inline-flex h-14 items-center rounded-2xl border border-white/40 bg-white/60 px-7 text-base font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400/60"
              >
                ← Geri
              </Link>
              <span className="rounded-full border border-amber-200/80 bg-amber-50/90 px-5 py-2 text-sm font-black tracking-[0.12em] text-amber-800 ring-1 ring-amber-100">
                ⚗️ MİNERAL LİSTESİ
              </span>
            </div>
            <h1 className="text-6xl font-black tracking-tight text-slate-950 xl:text-7xl">
              Mineral Listesi
            </h1>
            <p className="mt-3 text-xl font-medium text-slate-600">
              public.minerals tablosundan mineral kayıtları.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">{minerals.length}</div>
              <div className="text-xs font-bold text-slate-500">Toplam kayıt</div>
            </div>
            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">{filteredMinerals.length}</div>
              <div className="text-xs font-bold text-slate-500">Görünen sonuç</div>
            </div>
          </div>
        </header>

        <section className={`${uiFilterCard} mb-5`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="İsim, açıklama, fiziksel, zihinsel, fizyoloji veya taşlarda ara..."
              className={`${uiField} flex-1 text-sm text-slate-700`}
            />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={`${uiField} text-sm font-black text-slate-700 xl:w-[260px]`}
              aria-label="Kategori filtresi"
            >
              <option value="">Tüm kategoriler</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadMinerals}
              className={`${uiActionBtn} border-2 border-emerald-200/80 bg-white/80 text-slate-700 hover:border-emerald-400`}
            >
              Yenile
            </button>
            <Link
              href="/dogaltas/mineral-bankasi"
              className={`${uiActionBtn} bg-gradient-to-r from-emerald-500 to-amber-500 text-white shadow-[0_10px_30px_rgba(16,185,129,0.25)] hover:brightness-110`}
            >
              + Yeni Mineral
            </Link>
          </div>
        </section>

        {errorMessage ? (
          <div
            className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        <section className={uiContentCard}>
          {loading ? (
            <div className="flex min-h-[520px] items-center justify-center text-base font-black text-slate-500">
              Mineraller yükleniyor...
            </div>
          ) : isEmptyDatabase ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[24px] bg-gradient-to-br from-white/70 to-emerald-50/80 text-center ring-1 ring-emerald-100/60">
              <div className="text-[54px]">⚗️</div>
              <h2 className="mt-3 text-[20px] font-black text-slate-950">Henüz mineral kaydı yok</h2>
              <p className="mt-2 max-w-[400px] text-[13px] leading-6 text-slate-500">
                Supabase minerals tablosunda henüz kayıt bulunmuyor.
              </p>
            </div>
          ) : isEmptyFiltered ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[24px] bg-gradient-to-br from-white/70 to-emerald-50/80 text-center ring-1 ring-emerald-100/60">
              <div className="text-[54px]">⚗️</div>
              <h2 className="mt-3 text-[20px] font-black text-slate-950">Sonuç bulunamadı</h2>
              <p className="mt-2 text-[13px] text-slate-500">
                Arama veya kategori filtresini değiştirin.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredMinerals.map((mineral) => {
                const categoryLabel = getCategoryLabel(mineral.kategori);
                const showCategoryPill = categoryLabel !== UNCATEGORIZED_LABEL;

                return (
                  <article key={mineral.id} className={uiMineralCard}>
                    <div className="flex gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#d1fae5_0%,#fef3c7_48%,#fde68a_100%)] text-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_8px_20px_rgba(16,185,129,0.12)] ring-1 ring-white/90"
                        aria-hidden
                      >
                        ⚗️
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        {showCategoryPill ? (
                          <span className={`${uiCategoryPill} mb-2 w-fit`}>{categoryLabel}</span>
                        ) : (
                          <span className="mb-2 text-xs font-bold text-slate-400">{categoryLabel}</span>
                        )}
                        <h2 className="text-2xl font-black text-slate-950">{mineral.name}</h2>
                        <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">
                          {previewText(mineral.aciklama)}
                        </p>
                        <Link
                          href={`/dogaltas/mineral-listesi/${mineral.id}`}
                          className={uiComboBtn}
                        >
                          Detayı Gör →
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
