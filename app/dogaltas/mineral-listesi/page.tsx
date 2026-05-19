"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

const MINERALS_SELECT =
  "id,tenant_id,source_id,name,aciklama,organ_etkileri,fiziksel,zihinsel,cakralar,fizyoloji,eksiklik_belirtileri,fazlalik_belirtileri,doz_asimi,iceren_taslar,kategori,created_at";

type MineralRecord = {
  id: string;
  tenant_id: string;
  source_id: string;
  name: string;
  aciklama: string | null;
  organ_etkileri: string[] | null;
  fiziksel: string[] | null;
  zihinsel: string[] | null;
  cakralar: string[] | null;
  fizyoloji: string[] | null;
  eksiklik_belirtileri: string[] | null;
  fazlalik_belirtileri: string[] | null;
  doz_asimi: string[] | null;
  iceren_taslar: string[] | null;
  kategori: string | null;
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
    organ_etkileri: ensureStringArray(row.organ_etkileri),
    fiziksel: ensureStringArray(row.fiziksel),
    zihinsel: ensureStringArray(row.zihinsel),
    cakralar: ensureStringArray(row.cakralar),
    fizyoloji: ensureStringArray(row.fizyoloji),
    eksiklik_belirtileri: ensureStringArray(row.eksiklik_belirtileri),
    fazlalik_belirtileri: ensureStringArray(row.fazlalik_belirtileri),
    doz_asimi: ensureStringArray(row.doz_asimi),
    iceren_taslar: ensureStringArray(row.iceren_taslar),
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function previewText(value: string | null | undefined, limit = 100) {
  if (!value || !value.trim()) return "—";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

function mineralSearchBlob(mineral: MineralRecord) {
  return [
    mineral.name,
    mineral.aciklama,
    mineral.kategori,
    ...ensureStringArray(mineral.organ_etkileri),
    ...ensureStringArray(mineral.fiziksel),
    ...ensureStringArray(mineral.zihinsel),
    ...ensureStringArray(mineral.fizyoloji),
    ...ensureStringArray(mineral.eksiklik_belirtileri),
    ...ensureStringArray(mineral.doz_asimi),
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
const uiTableCard =
  "w-full min-h-[520px] overflow-hidden rounded-[32px] border-[3px] border-emerald-400/40 bg-white/75 shadow-[0_0_45px_rgba(16,185,129,0.16)] backdrop-blur-xl";
const uiField =
  "h-14 rounded-2xl border-2 border-emerald-200 bg-white/90 px-5 font-semibold shadow-inner outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30";
const uiActionBtn =
  "rounded-2xl px-6 py-4 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5";
const uiStatCard =
  "rounded-2xl border-2 border-amber-300/40 bg-white/80 px-8 py-4 text-center shadow-md";
const uiCategoryPill =
  "inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-900";

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
      .select(MINERALS_SELECT)
      .eq("tenant_id", TENANT_ID)
      .order("name", { ascending: true });

    setLoading(false);

    if (error) {
      setErrorMessage(`Mineraller alınamadı: ${error.message}`);
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
      const cat = mineral.kategori?.trim();
      if (cat) set.add(cat);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr-TR"));
  }, [minerals]);

  const filteredMinerals = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("tr-TR");
    const category = categoryFilter.trim();

    return minerals.filter((mineral) => {
      if (category && (mineral.kategori?.trim() || "") !== category) return false;
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
              Supabase mineral bankasından kayıtları arayın ve detaylandırın.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">{minerals.length}</div>
              <div className="text-xs font-bold text-slate-500">Toplam</div>
            </div>

            <div className={uiStatCard}>
              <div className="text-2xl font-black text-slate-950">{filteredMinerals.length}</div>
              <div className="text-xs font-bold text-slate-500">Sonuç</div>
            </div>
          </div>
        </header>

        <section className={`${uiFilterCard} mb-5`}>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Mineral adı, açıklama veya içerikte ara..."
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
          <div className="mb-4 rounded-2xl bg-rose-50 px-5 py-3 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <section className={`${uiTableCard} p-4`}>
          {loading ? (
            <div className="flex min-h-[520px] items-center justify-center text-base font-black text-slate-500">
              Mineraller yükleniyor...
            </div>
          ) : isEmptyDatabase ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[24px] bg-gradient-to-br from-white/70 to-emerald-50/80 text-center ring-1 ring-emerald-100/60">
              <div className="text-[54px]">⚗️</div>
              <h2 className="mt-3 text-[20px] font-black text-slate-950">
                Henüz mineral kaydı yok
              </h2>
              <p className="mt-2 max-w-[400px] text-[13px] leading-6 text-slate-500">
                Admin panelinden JSON aktarımı yapıldığında veya yeni mineral eklendiğinde kayıtlar
                burada listelenir.
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
            <div className="w-full overflow-hidden rounded-[24px] bg-white/85 ring-1 ring-emerald-100/70">
              <div className="grid grid-cols-[1.1fr_0.9fr_1.4fr_0.55fr_0.7fr] gap-3 border-b border-emerald-200 bg-gradient-to-r from-emerald-50 via-amber-50 to-white px-5 py-5 text-xs font-black uppercase tracking-[0.18em] text-slate-700 xl:text-sm">
                <div>Mineral</div>
                <div>Kategori</div>
                <div>Açıklama özeti</div>
                <div>Taş</div>
                <div className="text-right">İşlem</div>
              </div>

              <div className="divide-y divide-emerald-100">
                {filteredMinerals.map((mineral) => {
                  const stoneCount = ensureStringArray(mineral.iceren_taslar).length;

                  return (
                    <div
                      key={mineral.id}
                      className="grid grid-cols-[1.1fr_0.9fr_1.4fr_0.55fr_0.7fr] gap-3 px-5 py-5 text-sm transition-colors hover:bg-emerald-50/70 xl:text-base"
                    >
                      <Link href={`/dogaltas/mineral-listesi/${mineral.id}`} className="min-w-0">
                        <div className="truncate text-base font-black text-slate-950">
                          {mineral.name}
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          {formatDate(mineral.created_at)}
                        </div>
                      </Link>

                      <div className="flex min-w-0 items-center">
                        {mineral.kategori?.trim() ? (
                          <span className={uiCategoryPill}>{mineral.kategori}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>

                      <Link
                        href={`/dogaltas/mineral-listesi/${mineral.id}`}
                        className="flex items-center text-sm leading-6 text-slate-600 xl:text-base"
                      >
                        {previewText(mineral.aciklama, 120)}
                      </Link>

                      <div className="flex items-center">
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-100">
                          {stoneCount}
                        </span>
                      </div>

                      <div className="flex items-center justify-end">
                        <Link
                          href={`/dogaltas/mineral-listesi/${mineral.id}`}
                          className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-md transition hover:bg-emerald-700"
                        >
                          Detay
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
