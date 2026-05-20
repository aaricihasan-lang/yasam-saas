"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runInEffect } from "@/lib/runInEffect";
import { supabase } from "@/lib/supabase";

const modules = [
  {
    title: "Doğaltaş Kayıt",
    subtitle: "Yeni taş kaydı oluştur.",
    icon: "💎",
    href: "/dogaltas/dogaltas-kayit",
    dot: "bg-emerald-500",
    iconBg: "bg-cyan-50",
  },
  {
    title: "Mineral Bankası",
    subtitle: "Mineral veri kayıtları.",
    icon: "🧪",
    href: "/dogaltas/mineral-bankasi",
    dot: "bg-violet-500",
    iconBg: "bg-violet-50",
  },
  {
    title: "Mineral Listesi",
    subtitle: "Filtrele ve düzenle.",
    icon: "📋",
    href: "/dogaltas/mineral-listesi",
    dot: "bg-sky-500",
    iconBg: "bg-sky-50",
  },
  {
    title: "Doğaltaş Listesi",
    subtitle: "Kayıtlı taşlar.",
    icon: "🗂️",
    href: "/dogaltas/dogaltas-listesi",
    dot: "bg-blue-500",
    iconBg: "bg-blue-50",
  },
  {
    title: "Kombinasyonlar",
    subtitle: "Taş kombinasyonları.",
    icon: "🧩",
    href: "/dogaltas/kombinasyonlar",
    dot: "bg-orange-500",
    iconBg: "bg-orange-50",
  },
  {
    title: "Stok Yönetimi",
    subtitle: "Stok, adet ve fiyat.",
    icon: "📦",
    href: "/dogaltas/stok-yonetimi",
    dot: "bg-indigo-500",
    iconBg: "bg-indigo-50",
  },
  {
    title: "Taş Bilgi Kütüphanesi",
    subtitle: "Eğitim ve referans.",
    icon: "📚",
    href: "/dogaltas/tas-bilgi-kutuphanesi",
    dot: "bg-pink-500",
    iconBg: "bg-pink-50",
  },
];

type MonthTrendBucket = {
  label: string;
  count: number;
  heightPct: number;
};

const STOCK_PRICE_FIELD_CANDIDATES: [string, string][] = [
  ["stock_qty", "unit_price"],
  ["stock_quantity", "price"],
  ["quantity", "price"],
  ["adet", "fiyat"],
  ["stok", "fiyat"],
  ["stock", "price"],
  ["qty", "unit_price"],
];

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function detectStockValueFields(rows: Record<string, unknown>[]): [string, string] | null {
  if (rows.length === 0) return null;

  for (const [qtyKey, priceKey] of STOCK_PRICE_FIELD_CANDIDATES) {
    const hasPair = rows.some((row) => {
      const qty = parseNumeric(row[qtyKey]);
      const price = parseNumeric(row[priceKey]);
      return qty != null && price != null && (qty > 0 || price > 0);
    });
    if (hasPair) return [qtyKey, priceKey];
  }

  return null;
}

function computeStockValue(rows: Record<string, unknown>[], keys: [string, string]): number {
  const [qtyKey, priceKey] = keys;
  return rows.reduce((sum, row) => {
    const qty = parseNumeric(row[qtyKey]) ?? 0;
    const price = parseNumeric(row[priceKey]) ?? 0;
    return sum + qty * price;
  }, 0);
}

function buildLast6MonthTrend(createdAts: string[]): MonthTrendBucket[] {
  const now = new Date();
  const buckets: { label: string; year: number; month: number; count: number }[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      label: date.toLocaleDateString("tr-TR", { month: "short" }),
      year: date.getFullYear(),
      month: date.getMonth(),
      count: 0,
    });
  }

  for (const iso of createdAts) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const bucket = buckets.find(
      (item) => item.year === date.getFullYear() && item.month === date.getMonth(),
    );
    if (bucket) bucket.count += 1;
  }

  const maxCount = Math.max(...buckets.map((item) => item.count), 1);

  return buckets.map((item) => ({
    label: item.label,
    count: item.count,
    heightPct:
      item.count === 0 ? 0 : Math.max(8, Math.round((item.count / maxCount) * 100)),
  }));
}

function formatCount(value: number | null, loading: boolean): string {
  if (loading) return "Yükleniyor...";
  if (value === null) return "—";
  return value.toLocaleString("tr-TR");
}

function formatTry(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(amount);
}

async function fetchTableCount(table: string): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) return null;
  return count ?? 0;
}

export default function DogaltasPage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stonesCount, setStonesCount] = useState<number | null>(null);
  const [mineralsCount, setMineralsCount] = useState<number | null>(null);
  const [combinationsCount, setCombinationsCount] = useState<number | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthTrendBucket[]>([]);
  const [stockValue, setStockValue] = useState<number | null>(null);
  const [stockValueMessage, setStockValueMessage] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const [stonesCountRes, stonesRowsRes, mineralsCount, combinationsCount] =
      await Promise.all([
        supabase.from("stones").select("*", { count: "exact", head: true }),
        supabase.from("stones").select("*"),
        fetchTableCount("minerals"),
        fetchTableCount("combinations"),
      ]);

    setLoading(false);

    if (stonesCountRes.error) {
      setErrorMessage(`Analiz verileri okunamadı: ${stonesCountRes.error.message}`);
      setStonesCount(null);
      setMineralsCount(null);
      setCombinationsCount(null);
      setMonthlyTrend([]);
      setStockValue(null);
      setStockValueMessage(null);
      return;
    }

    const rows = (stonesRowsRes.data ?? []) as Record<string, unknown>[];
    if (stonesRowsRes.error) {
      setErrorMessage(`Taş kayıtları okunamadı: ${stonesRowsRes.error.message}`);
    }

    setStonesCount(stonesCountRes.count ?? 0);
    setMineralsCount(mineralsCount);
    setCombinationsCount(combinationsCount);

    const createdAts = rows
      .map((row) => (row.created_at != null ? String(row.created_at) : ""))
      .filter(Boolean);
    setMonthlyTrend(buildLast6MonthTrend(createdAts));

    const stockFields = detectStockValueFields(rows);
    if (stockFields) {
      const total = computeStockValue(rows, stockFields);
      setStockValue(total);
      setStockValueMessage(null);
    } else {
      setStockValue(null);
      setStockValueMessage("Stok değeri için fiyat/stok verisi bekleniyor");
    }
  }, []);

  useEffect(() => {
    runInEffect(() => {
      void loadAnalytics();
    });
  }, [loadAnalytics]);

  const stockValueDisplay = useMemo(() => {
    if (loading) return "Yükleniyor...";
    if (stockValueMessage) return stockValueMessage;
    if (stockValue != null && stockValue > 0) return formatTry(stockValue);
    if (stockValue === 0) return formatTry(0);
    return "Stok değeri için fiyat/stok verisi bekleniyor";
  }, [loading, stockValue, stockValueMessage]);

  const stockValueIsMessage = !loading && Boolean(stockValueMessage || stockValue == null);

  return (
    <main className="h-screen w-full overflow-hidden overflow-x-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(56,189,248,0.16),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.14),transparent_30%),radial-gradient(circle_at_60%_90%,rgba(45,212,191,0.12),transparent_35%),linear-gradient(135deg,#eef7ff_0%,#f7f2ff_45%,#f2fffb_100%)] text-slate-950">
      <div className="grid h-full w-full grid-cols-[430px_1fr] overflow-x-hidden">
        <aside className="flex h-screen w-[430px] min-w-[430px] max-w-[430px] shrink-0 flex-col overflow-hidden border-r border-white/80 bg-white/88 px-6 py-6 shadow-[14px_0_35px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <div className="mb-4 flex h-16 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-md ring-1 ring-slate-100">
              💎
            </div>
            <div>
              <h2 className="text-[13px] font-black tracking-[0.22em] text-slate-950">
                YAŞAM SİSTEMİ
              </h2>
              <p className="mt-0.5 text-[13px] font-bold text-emerald-700">Doğaltaş Modülü</p>
            </div>
          </div>

          <div className="mb-4 shrink-0 text-[15px] font-black tracking-[0.24em] text-slate-400">
            MODÜLLER
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {modules.map((item, index) => {
              const isFeatured = index === 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex h-[92px] w-full shrink-0 cursor-pointer items-center gap-5 rounded-[28px] border px-5 py-4 shadow-[0_12px_34px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.045] hover:border-cyan-300 hover:bg-white hover:shadow-[0_22px_60px_rgba(79,70,229,0.18)] ${
                    isFeatured
                      ? "border-cyan-300 bg-gradient-to-r from-cyan-50 via-white to-blue-50 shadow-[0_18px_55px_rgba(14,165,233,0.18)]"
                      : "border-white/80 bg-white/70"
                  }`}
                >
                  <span
                    className={`flex h-16 w-16 min-w-16 shrink-0 items-center justify-center rounded-[24px] shadow-lg ring-1 ring-white/80 ${item.iconBg}`}
                  >
                    <span className="flex h-8 w-8 items-center justify-center text-2xl leading-none">
                      {item.icon}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-normal text-[20px] font-black leading-tight text-slate-950">
                      {item.title}
                    </span>
                    <span className="mt-1 block whitespace-normal text-[14px] font-semibold leading-snug text-slate-600">
                      {item.subtitle}
                    </span>
                  </span>

                  <span className="ml-auto shrink-0 text-2xl font-black opacity-80 transition-transform duration-300 group-hover:translate-x-1">
                    ›
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 shrink-0 rounded-[28px] border border-white/80 bg-white/80 p-6 text-[16px] font-black leading-relaxed text-slate-700 shadow-lg">
            ✨ Bilgiyi yönetin, değere dönüştürün.
          </div>
        </aside>

        <section className="relative h-screen min-w-0 overflow-hidden px-6 py-5">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-200/30 blur-3xl" />
            <div className="absolute left-[8%] -top-16 h-56 w-56 rounded-full bg-violet-200/25 blur-3xl" />
            <div className="absolute bottom-0 left-[28%] h-48 w-48 rounded-full bg-emerald-200/20 blur-3xl" />
          </div>

          <div className="relative flex h-full w-full max-w-none flex-col gap-3 overflow-hidden">
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-[30px] border border-white/80 bg-white/65 px-8 py-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center text-3xl leading-none">
                  💎
                </div>
                <div className="min-w-0">
                  <h1 className="text-4xl font-black tracking-tight text-slate-950">
                    <span className="bg-[linear-gradient(90deg,#a855f7_0%,#38bdf8_45%,#34d399_100%)] bg-clip-text text-transparent">
                      Doğaltaş
                    </span>{" "}
                    Yönetimi
                  </h1>
                  <p className="mt-0.5 text-base text-slate-600">
                    Doğaltaş, mineral, kombinasyon ve stok süreçlerini tek merkezden
                    yönetin.
                  </p>
                </div>
              </div>
              <Link
                href="/"
                className="shrink-0 rounded-2xl border border-white/80 bg-white/90 px-5 py-2.5 text-sm font-black text-slate-700 shadow-md transition hover:bg-white"
              >
                ⌂ Ana Sayfaya Dön
              </Link>
            </header>

            <div className="w-full shrink-0 rounded-[26px] border border-white/80 bg-white/75 p-3 shadow-[0_14px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex gap-3">
                <div className="relative min-w-0 flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base text-slate-400">
                    ⌕
                  </span>
                  <input
                    type="text"
                    placeholder="Taş, mineral veya anahtar kelime ara..."
                    className="h-14 w-full rounded-2xl border border-slate-200/70 bg-white/90 pl-11 pr-4 text-base font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                  />
                </div>
                <button
                  type="button"
                  className="h-14 shrink-0 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 px-7 text-sm font-black text-white shadow-lg transition-all hover:scale-[1.02]"
                >
                  Ara
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/70 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
              <div className="mb-4 flex shrink-0 items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-base">
                  📊
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-950">Hesaplanmış Analizler</h2>
                  <p className="text-xs text-slate-600">Supabase stones, minerals ve combinations verilerine göre</p>
                </div>
              </div>

              {errorMessage ? (
                <p
                  className="mb-3 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}

              <div className="grid shrink-0 grid-cols-3 gap-3">
                <div className="flex h-[210px] max-h-[230px] flex-col rounded-[24px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-5 shadow-md">
                  <p className="text-base font-black text-slate-800">Stok Değeri</p>
                  <p className="text-xs text-slate-500">Stones tablosu fiyat × stok</p>
                  <h3
                    className={`mt-auto pt-2 font-black text-slate-950 ${
                      stockValueIsMessage ? "text-sm leading-snug" : "text-3xl"
                    }`}
                  >
                    {stockValueDisplay}
                  </h3>
                </div>

                <div className="flex h-[210px] max-h-[230px] flex-col rounded-[24px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-5 shadow-md">
                  <p className="text-base font-black text-slate-800">Aylık Kayıt Trendi</p>
                  <p className="text-xs text-slate-500">Son 6 ay · stones.created_at</p>
                  {loading ? (
                    <p className="mt-auto text-sm font-semibold text-slate-600">Yükleniyor...</p>
                  ) : (
                    <>
                      <div className="mt-2 flex h-[88px] items-end gap-1.5">
                        {monthlyTrend.map((bucket) => (
                          <div
                            key={bucket.label}
                            className="flex h-full flex-1 flex-col justify-end"
                            title={`${bucket.label}: ${bucket.count} kayıt`}
                          >
                            <div
                              className="w-full rounded-t-lg bg-gradient-to-t from-indigo-500 via-violet-400 to-sky-300"
                              style={{
                                height: bucket.heightPct > 0 ? `${bucket.heightPct}%` : "4px",
                                minHeight: "4px",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-1.5 grid grid-cols-6 text-center text-[10px] font-medium text-slate-500">
                        {monthlyTrend.map((bucket) => (
                          <span key={`${bucket.label}-lbl`}>{bucket.label}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex h-[210px] max-h-[230px] flex-col rounded-[24px] border border-white/80 bg-gradient-to-br from-white via-slate-50 to-violet-50 p-5 shadow-md">
                  <p className="text-base font-black text-slate-800">En Çok Satılan Taşlar</p>
                  <p className="text-xs text-slate-500">Satış hareket tablosu</p>
                  <p className="mt-auto text-sm font-semibold leading-relaxed text-slate-600">
                    {loading ? "Yükleniyor..." : "Henüz satış verisi yok"}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid shrink-0 grid-cols-3 gap-3">
                <div className="flex min-h-[95px] flex-col justify-center rounded-[24px] border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-5 shadow-md">
                  <p className="text-sm font-black text-teal-700">Toplam Taş Kaydı</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">
                    {formatCount(stonesCount, loading)}
                  </p>
                </div>
                <div className="flex min-h-[95px] flex-col justify-center rounded-[24px] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-5 shadow-md">
                  <p className="text-sm font-black text-violet-700">Mineral Bankası</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">
                    {formatCount(mineralsCount, loading)}
                  </p>
                </div>
                <div className="flex min-h-[95px] flex-col justify-center rounded-[24px] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-md">
                  <p className="text-sm font-black text-amber-700">Aktif Kombinasyonlar</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">
                    {formatCount(combinationsCount, loading)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
