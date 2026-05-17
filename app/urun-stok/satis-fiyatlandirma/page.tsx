"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAccessoryInventory } from "@/lib/urun-stok/accessoryStockLogic";
import {
  itemKey,
  loadInventory as loadDogaltasInventory,
} from "@/lib/urun-stok/dogaltasStockLogic";
import {
  CATEGORY_LABELS,
  type GeneralSaleRecord,
  type ProductCategory,
  type UnifiedProduct,
  calcUnifiedSale,
  commitCentralSales,
  countLiveInventoryByCategory,
  filterUnifiedProducts,
  fmtMoney,
  fmtUnifiedUnitCost,
  loadUnifiedProducts,
  toFloat,
  turkishUpper,
} from "@/lib/urun-stok/generalSalesLogic";
import { loadOilInventory } from "@/lib/urun-stok/oilStockLogic";
import { loadOtherInventory } from "@/lib/urun-stok/otherStockLogic";
import { loadSoapCreamInventory } from "@/lib/urun-stok/soapCreamStockLogic";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(245,208,254,0.28),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(244,114,182,0.12),transparent_30%),linear-gradient(160deg,#fdf4ff_0%,#fff1f2_40%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-6 py-8 lg:px-10 xl:px-14";

const panelClass =
  "w-full rounded-[28px] border-2 border-fuchsia-200/80 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const inputClass =
  "h-14 w-full rounded-2xl border-2 border-fuchsia-200 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-200/50";

const btnPrimary =
  "inline-flex h-14 items-center justify-center rounded-2xl border-2 border-fuchsia-400 bg-gradient-to-r from-fuchsia-100 to-pink-100 px-8 text-base font-black text-fuchsia-950 shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50";

const btnSecondary =
  "inline-flex h-12 items-center justify-center rounded-2xl border-2 border-fuchsia-200 bg-fuchsia-50 px-6 text-sm font-black text-slate-800 transition hover:bg-fuchsia-100 no-underline disabled:cursor-not-allowed disabled:opacity-50";

function productKey(p: UnifiedProduct): string {
  return `${p.category}:${p.productId}`;
}

function optionLabel(p: UnifiedProduct): string {
  return `${p.name} | ${CATEGORY_LABELS[p.category]} | Stok: ${p.stockDisplay}`;
}

function getProductPhotos(p: UnifiedProduct): string[] {
  switch (p.category) {
    case "dogaltas": {
      const it = loadDogaltasInventory().find((i) => itemKey(i.name, i.type) === p.productId);
      return it?.photos ?? [];
    }
    case "oil": {
      const it = loadOilInventory().find((i) => i.id === p.productId);
      return it?.photos ?? [];
    }
    case "soap_cream": {
      const it = loadSoapCreamInventory().find((i) => i.id === p.productId);
      return it?.photos ?? [];
    }
    case "accessory": {
      const it = loadAccessoryInventory().find((i) => i.id === p.productId);
      return it?.photos ?? [];
    }
    case "other": {
      const it = loadOtherInventory().find((i) => i.id === p.productId);
      return it?.photos ?? [];
    }
    default:
      return [];
  }
}

export default function MerkeziSatisFiyatlandirmaPage() {
  const [hydrated, setHydrated] = useState(false);
  const [products, setProducts] = useState<UnifiedProduct[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  const [usdRate, setUsdRate] = useState("");

  const reloadProducts = useCallback(() => {
    setProducts(loadUnifiedProducts(toFloat(usdRate, 0)));
  }, [usdRate]);

  const liveCounts = useMemo(() => countLiveInventoryByCategory(), [products]);

  useEffect(() => {
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

  const filtered = useMemo(
    () => filterUnifiedProducts(products, categoryFilter, search),
    [products, categoryFilter, search],
  );

  const picked = useMemo(
    () => products.find((p) => productKey(p) === pickKey),
    [products, pickKey],
  );

  const pickedPhotos = useMemo(() => (picked ? getProductPhotos(picked) : []), [picked]);

  useEffect(() => {
    if (!picked) return;
    if (picked.saleMode === "measure" && picked.saleUnits?.length) {
      if (!picked.saleUnits.includes(saleUnit as never)) setSaleUnit(picked.saleUnits[0]);
    } else {
      setSaleUnit("adet");
    }
    setSaleLabel(`${picked.name} — ${CATEGORY_LABELS[picked.category]}`);
    setProfitPct(String(picked.profitPct > 0 ? picked.profitPct : 100));
  }, [picked]);

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
      setMsg("Ürün seçin.");
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
      name: turkishUpper(saleLabel.trim() || picked.name),
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
    setMsg("Satış başarıyla kaydedildi. Stoklar ve geçmişler güncellendi.");
  }

  if (!hydrated) {
    return (
      <main className={pageBg}>
        <div className="flex min-h-screen items-center justify-center text-lg font-semibold text-slate-600">
          Yükleniyor…
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-fuchsia-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-pink-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        <div className="mb-8 flex flex-wrap justify-between gap-4">
          <Link href="/urun-stok" className={btnSecondary}>
            ← Ürün & Stok Merkezi
          </Link>
          <Link href="/urun-stok" className={btnSecondary}>
            Ana Panele Dön
          </Link>
        </div>

        <header className={`${panelClass} mb-6`}>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-fuchsia-700">Merkezi Satış</p>
          <h1 className="mt-3 text-4xl font-black xl:text-5xl">Satış & Fiyatlandırma</h1>
          <p className="mt-4 text-lg text-slate-600">
            Ürün ekleme yapılmaz — modül stoklarından canlı seçim. Satış ilgili envanterden düşer; merkezi ve kategori
            geçmişine + stok hareketlerine yazılır.
          </p>
        </header>

        <section className={`${panelClass} mb-6 !p-5`}>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-fuchsia-800">Canlı ürün kaynakları</h2>
          <p className="mt-1 text-sm text-slate-600">Stoklu ürün sayıları (anlık)</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
              <div key={c} className="rounded-2xl border-2 border-fuchsia-100 bg-fuchsia-50/70 px-4 py-3 text-center">
                <p className="text-xs font-black uppercase text-slate-500">{CATEGORY_LABELS[c]}</p>
                <p className="mt-1 text-2xl font-black text-fuchsia-900">{liveCounts[c]}</p>
              </div>
            ))}
          </div>
        </section>

        {msg ? (
          <p
            className={`mb-4 rounded-xl border px-4 py-3 text-base font-semibold ${
              msgOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {msg}
          </p>
        ) : null}

        <section className={`${panelClass} mb-2`}>
          <h2 className="text-xl font-black text-fuchsia-900">Satış paneli</h2>
          <p className="mt-1 text-sm text-slate-600">
            Kategori filtreleyin, ürün seçin, miktar ve kâr oranı ile sepete ekleyin.
          </p>
        </section>

        <div className="grid w-full gap-6 xl:grid-cols-[1.65fr_1fr]">
          <section className={`${panelClass} space-y-6`}>
            {products.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-fuchsia-200 bg-fuchsia-50/50 px-4 py-8 text-center text-base font-semibold text-slate-600">
                Henüz satışa hazır ürün bulunamadı. Önce ilgili ürün/stok modülünden ürün ekleyin.
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-black">Kategori</span>
                <select
                  className={inputClass}
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value as ProductCategory | "all");
                    setPickKey("");
                  }}
                  disabled={!products.length}
                >
                  <option value="all">Tümü</option>
                  {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-black">Dolar kuru (Doğaltaş $)</span>
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
              <span className="mb-2 block text-sm font-black">Ürün ara</span>
              <input
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün adı, tür, grup, model…"
                disabled={!products.length}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-black">Ürün seç</span>
              <select
                className={inputClass}
                value={pickKey}
                onChange={(e) => setPickKey(e.target.value)}
                disabled={!products.length}
              >
                <option value="">— Ürün seçin —</option>
                {filtered.map((p) => (
                  <option key={productKey(p)} value={productKey(p)}>
                    {optionLabel(p)}
                  </option>
                ))}
              </select>
              {products.length > 0 && filtered.length === 0 ? (
                <p className="mt-2 text-sm font-semibold text-slate-500">Filtreye uygun ürün yok.</p>
              ) : null}
            </label>

            {picked ? (
              <div className="rounded-2xl border-2 border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-pink-50 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {pickedPhotos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pickedPhotos[0]}
                      alt=""
                      className="h-24 w-24 shrink-0 rounded-2xl border-2 border-white object-cover shadow-md"
                    />
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-2 border-fuchsia-100 bg-white text-3xl font-black text-fuchsia-300">
                      {(picked.name[0] || "?").toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase text-fuchsia-700">Seçili ürün</p>
                    <p className="mt-1 text-2xl font-black text-slate-900">{picked.name}</p>
                    <p className="text-sm font-semibold text-slate-600">
                      {CATEGORY_LABELS[picked.category]} · {picked.subtitle}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-white bg-white/90 px-3 py-2">
                    <p className="text-xs font-black text-slate-500">Mevcut stok</p>
                    <p className="font-black">{picked.stockDisplay}</p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/90 px-3 py-2">
                    <p className="text-xs font-black text-slate-500">Birim</p>
                    <p className="font-black">{picked.unitLabel}</p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/90 px-3 py-2">
                    <p className="text-xs font-black text-slate-500">Maliyet (birim)</p>
                    <p className="font-black">{fmtUnifiedUnitCost(picked)}</p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/90 px-3 py-2">
                    <p className="text-xs font-black text-slate-500">Satış fiyatı (birim)</p>
                    <p className="font-black">
                      {preview && !("error" in preview)
                        ? fmtMoney(preview.lineSale / (preview.saleQty || 1))
                        : fmtUnifiedUnitCost({ ...picked, costPerUnit: picked.salePerUnit })}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/90 px-3 py-2 sm:col-span-2">
                    <p className="text-xs font-black text-slate-500">Fotoğraf</p>
                    <p className="font-black">{picked.photoCount} adet</p>
                  </div>
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-black">Satış etiketi</span>
              <input
                className={inputClass}
                value={saleLabel}
                onChange={(e) => setSaleLabel(turkishUpper(e.target.value))}
                disabled={!picked}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-sm font-black">
                  {picked?.saleMode === "measure" ? "Satış miktarı" : "Satış adedi"}
                </span>
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  min="0"
                  value={saleQty}
                  onChange={(e) => setSaleQty(e.target.value)}
                  disabled={!picked}
                />
              </label>
              {picked?.saleMode === "measure" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Birim</span>
                  <select
                    className={inputClass}
                    value={saleUnit}
                    onChange={(e) => setSaleUnit(e.target.value)}
                    disabled={!picked}
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
                <span className="mb-2 block text-sm font-black">Kâr oranı %</span>
                <input
                  className={inputClass}
                  value={profitPct}
                  onChange={(e) => setProfitPct(e.target.value)}
                  placeholder="100"
                  disabled={!picked}
                />
              </label>
            </div>

            {preview && !("error" in preview) ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-center font-black">
                  Maliyet: {fmtMoney(preview.lineCost)}
                </div>
                <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4 text-center font-black">
                  Satış: {fmtMoney(preview.lineSale)}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold">
                  Kâr: {fmtMoney(preview.lineSale - preview.lineCost)} · Stok −{preview.saleBaseQty}{" "}
                  {picked?.unitLabel}
                </div>
              </div>
            ) : preview && "error" in preview ? (
              <p className="font-semibold text-red-700">{preview.error}</p>
            ) : null}

            <button
              type="button"
              className={`${btnPrimary} w-full`}
              onClick={addToBasket}
              disabled={!picked || !products.length}
            >
              Sepete Ekle
            </button>
          </section>

          <section className={`${panelClass} flex flex-col`}>
            <h2 className="mb-4 text-xl font-black">Sepet</h2>
            <div className="min-h-[200px] flex-1 space-y-3 overflow-y-auto">
              {basket.length === 0 ? (
                <p className="py-12 text-center text-slate-500">Sepet boş</p>
              ) : (
                basket.map((rec, i) => {
                  const ln = rec.lines[0];
                  const profit = rec.sale_price - rec.total_cost;
                  return (
                    <div key={i} className="rounded-2xl border-2 border-fuchsia-100 bg-fuchsia-50/70 p-4">
                      <p className="font-black text-slate-900">{ln?.productName || rec.name}</p>
                      {ln ? (
                        <p className="mt-1 text-xs font-bold text-fuchsia-800">
                          {CATEGORY_LABELS[ln.category]} · {ln.saleQty} {ln.saleUnit}
                        </p>
                      ) : null}
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                        <div>
                          <p className="text-xs text-slate-500">Maliyet</p>
                          <p className="font-black">{fmtMoney(rec.total_cost)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Satış</p>
                          <p className="font-black">{fmtMoney(rec.sale_price)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Kâr</p>
                          <p className={`font-black ${profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                            {fmtMoney(profit)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="mt-3 text-sm font-black text-red-600"
                        onClick={() => setBasket((b) => b.filter((_, j) => j !== i))}
                      >
                        Sepetten kaldır
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-4 space-y-2 border-t-2 border-fuchsia-100 pt-4">
              <p className="flex justify-between text-sm font-semibold text-slate-600">
                <span>Toplam maliyet</span>
                <span className="font-black text-slate-900">{fmtMoney(basketTotals.totalCost)}</span>
              </p>
              <p className="flex justify-between text-sm font-semibold text-slate-600">
                <span>Toplam satış</span>
                <span className="font-black text-slate-900">{fmtMoney(basketTotals.totalSale)}</span>
              </p>
              <p className="flex justify-between text-base font-black">
                <span>Toplam kâr</span>
                <span className={basketTotals.totalProfit < 0 ? "text-rose-700" : "text-emerald-700"}>
                  {fmtMoney(basketTotals.totalProfit)}
                </span>
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <button type="button" className={btnSecondary} onClick={() => setBasket([])} disabled={!basket.length}>
                Sepeti Temizle
              </button>
              <button type="button" className={btnPrimary} onClick={commitSale} disabled={!basket.length}>
                Satışı Kaydet
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
