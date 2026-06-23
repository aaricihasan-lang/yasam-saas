"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import {
  CATEGORY_LABELS,
  type GeneralSaleRecord,
  type ProductCategory,
  type UnifiedProduct,
  calcUnifiedSale,
  commitCentralSales,
  countLiveInventoryByCategory,
  fmtMoney,
  fmtUnifiedUnitCost,
  loadUnifiedProducts,
  toFloat,
  turkishUpper,
} from "@/lib/urun-stok/generalSalesLogic";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { seedDemoUrunStok } from "@/lib/demo/demoUrunStok";
import { DemoUrunStokBanner } from "@/components/demo/DemoUrunStokBanner";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(245,208,254,0.28),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(244,114,182,0.12),transparent_30%),linear-gradient(160deg,#fdf4ff_0%,#fff1f2_40%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-4 py-4 lg:px-8 xl:px-12 pointer-events-auto";

const panelClass =
  "w-full rounded-2xl border-2 border-fuchsia-200/80 bg-white/85 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-5";

const inputClass =
  "h-9 w-full rounded-xl border-2 border-fuchsia-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-200/50";

const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-xl border-2 border-fuchsia-400 bg-gradient-to-r from-fuchsia-100 to-pink-100 px-5 text-sm font-black text-fuchsia-950 shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50";

const btnSecondary =
  "inline-flex h-8 items-center justify-center rounded-xl border-2 border-fuchsia-200 bg-fuchsia-50 px-4 text-xs font-black text-slate-800 transition hover:bg-fuchsia-100 no-underline disabled:cursor-not-allowed disabled:opacity-50";

function productOptionLabel(p: UnifiedProduct): string {
  const unit = p.baseUnit ?? p.unitLabel ?? "adet";
  return `${p.name} | ${p.productGroup || "—"} | Stok: ${p.stockAmount} ${unit}`;
}

export default function MerkeziSatisFiyatlandirmaPage() {
  const committingRef = useRef(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [products, setProducts] = useState<UnifiedProduct[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  const [usdRate, setUsdRate] = useState("");

  const reloadProducts = useCallback(() => {
    setProducts(loadUnifiedProducts(toFloat(usdRate, 0)));
  }, [usdRate]);

  const liveCounts = useMemo(() => countLiveInventoryByCategory(), [products]);

  useEffect(() => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) seedDemoUrunStok();
    setIsDemo(demo);
    reloadProducts();
    setHydrated(true);
  }, [reloadProducts]);

  useEffect(() => {
    const onRefresh = () => reloadProducts();
    window.addEventListener("focus", onRefresh);
    window.addEventListener("storage", onRefresh);
    const onVisible = () => {
      if (document.visibilityState === "visible") onRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("storage", onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadProducts]);

  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [pickKey, setPickKey] = useState("");
  const [saleQty, setSaleQty] = useState("1");
  const [saleUnit, setSaleUnit] = useState("adet");
  const [profitPct, setProfitPct] = useState("100");
  const [saleLabel, setSaleLabel] = useState("");
  const [basket, setBasket] = useState<GeneralSaleRecord[]>([]);

  const catalogProducts = useMemo(() => {
    if (!hydrated) return [];
    return products.length > 0 ? products : loadUnifiedProducts(toFloat(usdRate, 0));
  }, [hydrated, products, usdRate]);

  const filtered = useMemo(() => {
    let list =
      categoryFilter === "all"
        ? catalogProducts
        : catalogProducts.filter((p) => p.category === categoryFilter);
    const ql = search.trim().toLocaleLowerCase("tr-TR");
    if (!ql) return list;
    return list.filter(
      (p) =>
        p.name.toLocaleLowerCase("tr-TR").includes(ql) ||
        (p.productGroup ?? "").toLocaleLowerCase("tr-TR").includes(ql) ||
        p.subtitle.toLocaleLowerCase("tr-TR").includes(ql),
    );
  }, [catalogProducts, categoryFilter, search]);

  const picked = useMemo(() => {
    if (!pickKey) return undefined;
    return (
      filtered.find((p) => p.productId === pickKey) ??
      catalogProducts.find((p) => p.productId === pickKey)
    );
  }, [filtered, catalogProducts, pickKey]);

  const pickedPhotos = useMemo(() => picked?.photos ?? [], [picked]);

  useEffect(() => {
    if (!pickKey) return;
    const p =
      filtered.find((x) => x.productId === pickKey) ??
      catalogProducts.find((x) => x.productId === pickKey);
    if (!p) return;
    if (p.saleMode === "measure" && p.saleUnits?.length) {
      if (!p.saleUnits.includes(saleUnit as never)) setSaleUnit(p.saleUnits[0]);
    } else {
      setSaleUnit("adet");
    }
    setSaleLabel(`${p.name} — ${CATEGORY_LABELS[p.category]}`);
    setProfitPct(String(p.profitPct > 0 ? p.profitPct : 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnizca urun degisince varsayilanlari yukle
  }, [pickKey, filtered, catalogProducts]);

  const preview = useMemo(() => {
    if (!picked) return null;
    return calcUnifiedSale(
      picked,
      toFloat(saleQty, 0),
      saleUnit,
      toFloat(profitPct, 100),
      toFloat(usdRate, 0),
    );
  }, [picked, saleQty, saleUnit, profitPct, usdRate]);

  const basketTotals = useMemo(() => {
    const totalCost = basket.reduce((s, r) => s + r.total_cost, 0);
    const totalSale = basket.reduce((s, r) => s + r.sale_price, 0);
    return { totalCost, totalSale, totalProfit: totalSale - totalCost };
  }, [basket]);

  function addToBasket() {
    if (!picked) {
      setMsgOk(false);
      setMsg("Urun secin.");
      return;
    }
    const line = calcUnifiedSale(
      picked,
      toFloat(saleQty, 0),
      saleUnit,
      toFloat(profitPct, 100),
      toFloat(usdRate, 0),
    );
    if ("error" in line) {
      setMsgOk(false);
      setMsg(line.error);
      return;
    }
    const rec: GeneralSaleRecord = {
      name: turkishUpper((saleLabel.trim() || picked.name)),
      lines: [line],
      total_cost: line.lineCost,
      sale_price: line.lineSale,
      profit_pct: toFloat(profitPct, 100),
      photos: [],
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    setBasket((b) => [...b, rec]);
    setSaleQty("1");
    setMsgOk(false);
    setMsg("Sepete eklendi.");
  }

  function commitSale() {
    if (committingRef.current) return;
    committingRef.current = true;
    setIsCommitting(true);
    try {
      const result = commitCentralSales(basket, toFloat(usdRate, 0));
      if (!result.ok) {
        setMsgOk(false);
        setMsg(result.error);
        return;
      }
      setBasket([]);
      reloadProducts();
      setPickKey("");
      setSaleQty("1");
      setProfitPct("100");
      setSaleLabel("");
      setMsgOk(true);
      setMsg("Satis basariyla kaydedildi. Stoklar ve gecmisler guncellendi.");
    } finally {
      committingRef.current = false;
      setIsCommitting(false);
    }
  }

  if (!hydrated) {
    return (
      <main className={pageBg}>
        <div className="flex min-h-screen items-center justify-center font-semibold text-slate-600">
          Yukleniyor&hellip;
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-fuchsia-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-pink-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        {isDemo && <DemoUrunStokBanner />}
        <header className={`${panelClass} mb-3`}>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-fuchsia-700">Merkezi Satis</p>
          <h1 className="mt-1 text-2xl font-black xl:text-3xl">Satis &amp; Fiyatlandirma</h1>
          <p className="mt-1 text-sm text-slate-600">
            Urun ekleme yapilmaz &mdash; modul stoklarindan canli secim. Satis ilgili envanterden duser; merkezi ve kategori gecmisine + stok hareketlerine yazilir.
          </p>
        </header>

        <section className={`${panelClass} mb-3`}>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-800">Canli urun kaynaklari</h2>
          <p className="mt-0.5 text-xs text-slate-600">Stoklu urun sayilari (anlik)</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
              <div key={c} className="rounded-xl border-2 border-fuchsia-100 bg-fuchsia-50/70 px-3 py-2 text-center">
                <p className="text-xs font-black uppercase text-slate-500">{CATEGORY_LABELS[c]}</p>
                <p className="mt-0.5 text-xl font-black text-fuchsia-900">{liveCounts[c]}</p>
              </div>
            ))}
          </div>
        </section>

        {msg ? (
          <p
            className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
              msgOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {msg}
          </p>
        ) : null}

        <section className={`${panelClass} relative z-20 mb-2`}>
          <h2 className="text-base font-black text-fuchsia-900">Satis paneli</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Kategori filtreleyin, urun secin, miktar ve kar orani ile sepete ekleyin.
          </p>
        </section>

        <div className="relative z-20 grid w-full gap-4 xl:grid-cols-[1.65fr_1fr]">
          <section className={`${panelClass} relative z-20 space-y-4 pointer-events-auto`}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-black">Kategori</span>
                <select
                  className={inputClass}
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value as ProductCategory | "all");
                    setPickKey("");
                  }}
                >
                  <option value="all">Tumu</option>
                  {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black">Dolar kuru (Dogaltas $)</span>
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  value={usdRate}
                  onChange={(e) => setUsdRate(e.target.value)}
                  placeholder="Opsiyonel"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-black">Urun ara</span>
              <input
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Urun adi, tur, grup, model..."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black">Urun sec</span>
              <select
                key={`product-pick-${categoryFilter}-${filtered.length}`}
                className={inputClass}
                value={pickKey}
                onChange={(e) => setPickKey(e.target.value)}
              >
                <option value="">— Urun secin —</option>
                {filtered.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {productOptionLabel(p)}
                  </option>
                ))}
              </select>
              {categoryFilter !== "all" && filtered.length === 0 ? (
                <p className="relative z-0 mt-2 rounded-xl border border-dashed border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-xs font-semibold text-slate-600">
                  Henuz satisa hazir urun bulunamadi. Once ilgili urun/stok modulunden urun ekleyin.
                </p>
              ) : catalogProducts.length === 0 ? (
                <p className="relative z-0 mt-2 rounded-xl border border-dashed border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-xs font-semibold text-slate-600">
                  Henuz satisa hazir urun bulunamadi. Once ilgili urun/stok modulunden urun ekleyin.
                </p>
              ) : categoryFilter === "all" && filtered.length === 0 && catalogProducts.length > 0 ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">Filtreye uygun urun yok.</p>
              ) : null}
            </label>

            {picked ? (
              <div className="rounded-xl border-2 border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-pink-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  {pickedPhotos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pickedPhotos[0]}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-xl border-2 border-white object-cover shadow-md"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-fuchsia-100 bg-white text-2xl font-black text-fuchsia-300">
                      {(picked.name[0] || "?").toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase text-fuchsia-700">Secili urun</p>
                    <p className="mt-0.5 text-lg font-black text-slate-900">{picked.name}</p>
                    <p className="text-xs font-semibold text-slate-600">
                      {CATEGORY_LABELS[picked.category]} &middot; {picked.subtitle}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-white bg-white/90 px-3 py-2">
                    <p className="text-xs font-black text-slate-500">Mevcut stok</p>
                    <p className="text-sm font-black">{picked.stockDisplay}</p>
                  </div>
                  <div className="rounded-lg border border-white bg-white/90 px-3 py-2">
                    <p className="text-xs font-black text-slate-500">Birim</p>
                    <p className="text-sm font-black">{picked.unitLabel}</p>
                  </div>
                  <div className="rounded-lg border border-white bg-white/90 px-3 py-2">
                    <p className="text-xs font-black text-slate-500">Maliyet (birim)</p>
                    <p className="text-sm font-black">{fmtUnifiedUnitCost(picked)}</p>
                  </div>
                  <div className="rounded-lg border border-white bg-white/90 px-3 py-2">
                    <p className="text-xs font-black text-slate-500">Satis fiyati (birim)</p>
                    <p className="text-sm font-black">
                      {preview && !("error" in preview)
                        ? fmtMoney(preview.lineSale / (preview.saleQty || 1))
                        : fmtUnifiedUnitCost({ ...picked, costPerUnit: picked.salePerUnit })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white bg-white/90 px-3 py-2 sm:col-span-2">
                    <p className="text-xs font-black text-slate-500">Fotograf</p>
                    <p className="text-sm font-black">{picked.photoCount} adet</p>
                  </div>
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-xs font-black">Satis etiketi</span>
              <input
                className={inputClass}
                value={saleLabel}
                onChange={(e) => setSaleLabel(e.target.value)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-black">
                  {picked?.saleMode === "measure" ? "Satis miktari" : "Satis adedi"}
                </span>
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  min="0"
                  value={saleQty}
                  onChange={(e) => setSaleQty(e.target.value)}
                />
              </label>
              {picked?.saleMode === "measure" ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Birim</span>
                  <select
                    className={inputClass}
                    value={saleUnit}
                    onChange={(e) => setSaleUnit(e.target.value)}
                  >
                    {picked.saleUnits?.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-xs font-black">Kar orani %</span>
                <input
                  className={inputClass}
                  value={profitPct}
                  onChange={(e) => setProfitPct(e.target.value)}
                  placeholder="100"
                />
              </label>
            </div>

            {preview && !("error" in preview) ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-center text-sm font-black">
                  Maliyet: {fmtMoney(preview.lineCost)}
                </div>
                <div className="rounded-xl border border-pink-200 bg-pink-50 p-3 text-center text-sm font-black">
                  Satis: {fmtMoney(preview.lineSale)}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold">
                  Kar: {fmtMoney(preview.lineSale - preview.lineCost)} &middot; Stok &minus;{preview.saleBaseQty}{" "}
                  {picked?.unitLabel}
                </div>
              </div>
            ) : preview && "error" in preview ? (
              <p className="text-sm font-semibold text-red-700">{preview.error}</p>
            ) : null}

            <button
              type="button"
              className={`${btnPrimary} w-full`}
              onClick={addToBasket}
              disabled={!picked}
            >
              Sepete Ekle
            </button>
          </section>

          <section className={`${panelClass} relative z-20 flex flex-col`}>
            <h2 className="mb-3 text-base font-black">Sepet</h2>
            <div className="min-h-[160px] flex-1 space-y-2 overflow-y-auto">
              {basket.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">Sepet bos</p>
              ) : (
                basket.map((rec, i) => {
                  const ln = rec.lines[0];
                  const profit = rec.sale_price - rec.total_cost;
                  return (
                    <div key={i} className="rounded-xl border-2 border-fuchsia-100 bg-fuchsia-50/70 p-3">
                      <p className="text-sm font-black text-slate-900">{ln?.productName || rec.name}</p>
                      {ln ? (
                        <p className="mt-0.5 text-xs font-bold text-fuchsia-800">
                          {CATEGORY_LABELS[ln.category]} &middot; {ln.saleQty} {ln.saleUnit}
                        </p>
                      ) : null}
                      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                        <div>
                          <p className="text-slate-500">Maliyet</p>
                          <p className="font-black">{fmtMoney(rec.total_cost)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Satis</p>
                          <p className="font-black">{fmtMoney(rec.sale_price)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Kar</p>
                          <p className={`font-black ${profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                            {fmtMoney(profit)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="mt-2 text-xs font-black text-red-600"
                        onClick={() => setBasket((b) => b.filter((_, j) => j !== i))}
                      >
                        Sepetten kaldir
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-3 space-y-1.5 border-t-2 border-fuchsia-100 pt-3">
              <p className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Toplam maliyet</span>
                <span className="font-black text-slate-900">{fmtMoney(basketTotals.totalCost)}</span>
              </p>
              <p className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Toplam satis</span>
                <span className="font-black text-slate-900">{fmtMoney(basketTotals.totalSale)}</span>
              </p>
              <p className="flex justify-between text-sm font-black">
                <span>Toplam kar</span>
                <span className={basketTotals.totalProfit < 0 ? "text-rose-700" : "text-emerald-700"}>
                  {fmtMoney(basketTotals.totalProfit)}
                </span>
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={btnSecondary} onClick={() => setBasket([])} disabled={!basket.length}>
                Sepeti Temizle
              </button>
              <button type="button" className={btnPrimary} onClick={commitSale} disabled={!basket.length || isCommitting}>
                {isCommitting ? "Kaydediliyor..." : "Satisi Kaydet"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
