"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { supabase } from "@/lib/supabase";
import {
  ADMIN_LIBRARY_TENANT_ID,
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import {
  fetchAllStonesExtended,
  getFirstStoneImageUrl,
  type StoneListItemExtended,
} from "@/lib/dogaltas/stonesListFetch";
import { loadDogaltasInventoryForTenant } from "@/lib/urun-stok/dogaltasInventoryDb";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";
import {
  evaluateStone,
  makeStockMatcher,
  type MineralCondition,
} from "@/lib/dogaltas/mineralCombination";

// ─── Stil sabitleri (Doğaltaş modülü diliyle uyumlu) ─────────────────────────
const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#e0f2fe_0%,#eef2ff_40%,#f8fafc_100%)] text-slate-950";
const pageContent = "relative z-10 w-full space-y-4 px-4 py-4 sm:px-5 xl:px-8 2xl:px-10";
const uiHeaderCard =
  "rounded-[24px] border-[3px] border-cyan-400/45 bg-white/90 p-4 shadow-lg";
const uiFilterCard =
  "rounded-[20px] border-[3px] border-violet-300/45 bg-white/90 p-3 shadow-md sm:p-4";
const uiStatCard =
  "rounded-xl border-2 border-cyan-200 bg-white/85 px-3 py-2 text-center shadow-md";
const uiInput =
  "h-10 w-full rounded-xl border-2 border-cyan-300/50 bg-white/90 px-3 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-300/30";

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* yedek */
  }
  return `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

const emptyCondition = (): MineralCondition => ({
  id: newId(),
  mineral: "",
  minPercent: null,
});

/** Kombinasyon sepetindeki taş (yalnızca yerel state — Faz 3'te DB). */
type CartStone = {
  id: string;
  name: string;
  inStock: boolean;
};

export default function KombinasyonOlusturPage() {
  const { isDemo } = useDemoGuard();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stones, setStones] = useState<StoneListItemExtended[]>([]);
  const [inStockNames, setInStockNames] = useState<string[]>([]);
  const [mineralOptions, setMineralOptions] = useState<string[]>([]);

  const [conditions, setConditions] = useState<MineralCondition[]>([emptyCondition()]);
  const [searched, setSearched] = useState(false);

  // Kombinasyon sepeti — yalnızca yerel state (henüz DB kaydı yok).
  const [cart, setCart] = useState<CartStone[]>([]);
  const cartIds = useMemo(() => new Set(cart.map((c) => c.id)), [cart]);

  function addToCart(item: CartStone) {
    setCart((prev) => (prev.some((c) => c.id === item.id) ? prev : [...prev, item]));
  }
  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((c) => c.id !== id));
  }
  function clearCart() {
    setCart([]);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const tid = await getSyncedTenantId();
      if (!tid) {
        if (!cancelled) {
          setError(MISSING_SESSION_TENANT_MESSAGE);
          setLoading(false);
        }
        return;
      }

      const [stonesRes, inv] = await Promise.all([
        fetchAllStonesExtended(tid),
        loadDogaltasInventoryForTenant(tid),
      ]);
      if (cancelled) return;

      if (stonesRes.error) setError(stonesRes.error);
      setStones(stonesRes.rows);
      setInStockNames(
        inv.items.filter((it) => (it.adet ?? 0) > 0).map((it) => it.name),
      );

      // Mineral adı önerileri (Mineral Bankası) — başarısız olursa serbest metin yine çalışır.
      const tenantIds =
        tid === ADMIN_LIBRARY_TENANT_ID ? [tid] : [tid, ADMIN_LIBRARY_TENANT_ID];
      const { data: minRows } = await supabase
        .from("minerals")
        .select("name")
        .in("tenant_id", tenantIds);
      if (!cancelled) {
        const seen = new Set<string>();
        const names: string[] = [];
        for (const r of minRows ?? []) {
          const n = String((r as { name?: unknown }).name ?? "").trim();
          if (!n) continue;
          const key = normalizeTr(n);
          if (seen.has(key)) continue;
          seen.add(key);
          names.push(n);
        }
        names.sort((a, b) => a.localeCompare(b, "tr-TR", { sensitivity: "base" }));
        setMineralOptions(names);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeConditions = useMemo(
    () => conditions.filter((c) => c.mineral.trim()),
    [conditions],
  );

  const stockMatcher = useMemo(() => makeStockMatcher(inStockNames), [inStockNames]);

  const results = useMemo(() => {
    if (activeConditions.length === 0) return [];
    const list = stones
      .map((stone) => {
        const evaluation = evaluateStone(stone.assignments, conditions);
        return { stone, evaluation, inStock: stockMatcher(stone.stone_name) };
      })
      .filter((r) => r.evaluation.matches);

    list.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      return a.stone.stone_name.localeCompare(b.stone.stone_name, "tr-TR", {
        sensitivity: "base",
      });
    });
    return list;
  }, [stones, conditions, activeConditions.length, stockMatcher]);

  const inStockMatched = results.filter((r) => r.inStock).length;
  const anyThreshold = activeConditions.some((c) => c.minPercent != null);

  // ─── Koşul işlemleri ───────────────────────────────────────────────────────
  function addCondition() {
    setConditions((prev) => [...prev, emptyCondition()]);
  }
  function removeCondition(id: string) {
    setConditions((prev) =>
      prev.length <= 1 ? [emptyCondition()] : prev.filter((c) => c.id !== id),
    );
    setSearched(false);
  }
  function updateMineral(id: string, mineral: string) {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, mineral } : c)));
    setSearched(false);
  }
  function updatePercent(id: string, raw: string) {
    const trimmed = raw.trim();
    const num = trimmed === "" ? null : Number.parseFloat(trimmed.replace(",", "."));
    setConditions((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, minPercent: num != null && Number.isFinite(num) ? num : null }
          : c,
      ),
    );
    setSearched(false);
  }

  const showResults = searched && activeConditions.length > 0;

  return (
    <main className={pageBg}>
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute left-0 top-0 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-violet-300/15 blur-3xl" />

      <div className={pageContent}>
        {isDemo && (
          <DemoModuleBanner message="Kombinasyon Oluştur'u inceleyebilirsiniz. Sonuçlar kütüphane taşları üzerinden gösterilir." />
        )}

        {/* ── Başlık ─────────────────────────────────────────────────────── */}
        <header className={`${uiHeaderCard} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <div className="mb-1.5 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-black tracking-[0.18em] text-cyan-700">
              ⚗️ KOMBİNASYON OLUŞTUR
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">
              Mineral Kombinasyonu
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">
              Bir veya daha fazla mineral seçin; tüm koşulları sağlayan taşlar
              listelenir. Stokta olan taşlar belirgin gösterilir.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
            <div className={uiStatCard}>
              <div className="text-lg font-black text-slate-950">{stones.length}</div>
              <div className="text-xs font-bold text-slate-500">Taş</div>
            </div>
            <div className={uiStatCard}>
              <div className="text-lg font-black text-slate-950">
                {showResults ? results.length : "—"}
              </div>
              <div className="text-xs font-bold text-slate-500">Eşleşen</div>
            </div>
            <div className={uiStatCard}>
              <div className="text-lg font-black text-emerald-600">
                {showResults ? inStockMatched : "—"}
              </div>
              <div className="text-xs font-bold text-slate-500">Stokta</div>
            </div>
          </div>
        </header>

        {/* ── Koşul kurucu ───────────────────────────────────────────────── */}
        <section className={uiFilterCard}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-slate-900">Mineral Koşulları</h2>
            <span className="text-[11px] font-bold text-slate-500">
              Yüzde opsiyonel · tümü eşleşmeli (VE)
            </span>
          </div>

          <datalist id="kombinasyon-mineral-options">
            {mineralOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="space-y-2">
            {conditions.map((cond, index) => (
              <div key={cond.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <input
                    type="text"
                    list="kombinasyon-mineral-options"
                    value={cond.mineral}
                    onChange={(e) => updateMineral(cond.id, e.target.value)}
                    placeholder={`Mineral ${index + 1} (örn. Demir, Lityum, Kalsiyum)`}
                    className={uiInput}
                  />
                </div>

                <div className="flex items-center gap-2 sm:w-[190px] sm:shrink-0">
                  <span className="text-xs font-black text-slate-500">≥ %</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={cond.minPercent ?? ""}
                    onChange={(e) => updatePercent(cond.id, e.target.value)}
                    placeholder="opsiyonel"
                    className={uiInput}
                  />
                  <button
                    type="button"
                    onClick={() => removeCondition(cond.id)}
                    aria-label="Koşulu kaldır"
                    className="h-10 shrink-0 rounded-xl border-2 border-rose-200 bg-rose-50 px-3 text-sm font-black text-rose-600 shadow-sm transition hover:bg-rose-100"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={addCondition}
              className="rounded-xl border-2 border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-700 shadow-sm transition hover:bg-cyan-100"
            >
              + Mineral Ekle
            </button>

            <button
              type="button"
              onClick={() => setSearched(true)}
              disabled={loading || activeConditions.length === 0}
              className="rounded-xl border-2 border-violet-400 bg-violet-600 px-4 py-1.5 text-sm font-black text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Yükleniyor..." : "Taşları Tara"}
            </button>
          </div>

          {anyThreshold && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
              Not: Oran (yüzde) girilmemiş taşlarda eşik uygulanmaz; bu taşlar
              mineral varlığına göre eşleşir ve listeden çıkarılmaz.
            </p>
          )}
        </section>

        {/* ── Sonuçlar + Kombinasyon Sepeti ───────────────────────────── */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 space-y-4 lg:flex-1">
            {error && (
              <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {error}
              </div>
            )}

            {!error && (
          <section>
            {!showResults ? (
              <div className="rounded-[18px] border-[3px] border-dashed border-cyan-300/50 bg-white/70 p-6 text-center">
                <div className="text-base font-black text-slate-800">
                  Mineral seçip "Taşları Tara"ya basın
                </div>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Seçtiğiniz tüm minerallere uyan taşlar burada listelenir.
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-[18px] border-[3px] border-dashed border-slate-300 bg-white/70 p-6 text-center">
                <div className="text-base font-black text-slate-800">Eşleşme yok</div>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Seçilen koşulların tümünü sağlayan taş bulunamadı. Koşulları
                  azaltmayı veya eşiği kaldırmayı deneyin.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {results.map(({ stone, evaluation, inStock }) => {
                  const cover = getFirstStoneImageUrl(stone.images);
                  const matched = Array.from(
                    new Set(evaluation.perCondition.flatMap((p) => p.matchedNames)),
                  ).slice(0, 4);

                  return (
                    <div
                      key={stone.id}
                      className={`overflow-hidden rounded-[18px] border-[3px] p-4 shadow-sm transition-all duration-300 ${
                        inStock
                          ? "border-emerald-400/70 bg-emerald-50/60 shadow-[0_0_24px_rgba(16,185,129,0.18)]"
                          : "border-slate-200 bg-white/70 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <Link
                        href={`/dogaltas/dogaltas-listesi/${stone.id}`}
                        className="group block transition hover:-translate-y-0.5"
                      >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-12 w-12 shrink-0 overflow-hidden rounded-2xl ring-1 ${
                            inStock ? "bg-emerald-100 ring-emerald-200" : "bg-slate-100 ring-slate-200"
                          }`}
                        >
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
                              alt={stone.stone_name}
                              className={`h-full w-full object-cover ${inStock ? "" : "grayscale"}`}
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-lg">
                              💎
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-sm font-black text-slate-950">
                              {stone.stone_name || "İsimsiz taş"}
                            </h3>
                            {inStock ? (
                              <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                                Stokta
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                                Stok yok
                              </span>
                            )}
                          </div>

                          {stone.short_description && (
                            <p className="mt-0.5 line-clamp-1 text-xs font-medium text-slate-500">
                              {stone.short_description}
                            </p>
                          )}

                          <div className="mt-2 flex flex-wrap gap-1">
                            {matched.map((m, i) => (
                              <span
                                key={`${stone.id}-m-${i}`}
                                className="max-w-full truncate rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700"
                                title={m}
                              >
                                🧪 {m}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      </Link>

                      <button
                        type="button"
                        onClick={() =>
                          cartIds.has(stone.id)
                            ? removeFromCart(stone.id)
                            : addToCart({
                                id: stone.id,
                                name: stone.stone_name || "İsimsiz taş",
                                inStock,
                              })
                        }
                        className={`mt-3 w-full rounded-xl border-2 px-3 py-1.5 text-xs font-black shadow-sm transition ${
                          cartIds.has(stone.id)
                            ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                            : "border-violet-300 bg-violet-600 text-white hover:bg-violet-700"
                        }`}
                      >
                        {cartIds.has(stone.id) ? "Sepetten Çıkar" : "+ Kombinasyona Ekle"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
            )}
          </div>

          {/* ── Kombinasyon Sepeti ──────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-4 lg:w-80 lg:shrink-0">
            <div className="rounded-[20px] border-[3px] border-violet-300/50 bg-white/90 p-3 shadow-md sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-black text-slate-900">🧺 Kombinasyon Sepeti</h2>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-700">
                  {cart.length}
                </span>
              </div>

              {cart.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-500">
                  Sepet boş. Sonuç listesinden "Kombinasyona Ekle" ile taş ekleyin.
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {cart.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              item.inStock ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                            title={item.inStock ? "Stokta" : "Stok yok"}
                          />
                          <span className="truncate text-xs font-bold text-slate-800">
                            {item.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          aria-label={`${item.name} sepetten çıkar`}
                          className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-600 transition hover:bg-rose-100"
                        >
                          Çıkar
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">
                      {cart.filter((c) => c.inStock).length} stokta
                    </span>
                    <button
                      type="button"
                      onClick={clearCart}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-black text-slate-600 transition hover:bg-slate-100"
                    >
                      Temizle
                    </button>
                  </div>

                  <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    Henüz kaydedilmiyor — kayıt sonraki fazda eklenecek.
                  </p>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
