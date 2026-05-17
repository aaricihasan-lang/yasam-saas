"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { filesToDataUrls } from "@/lib/urun-stok/accessoryStockLogic";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(245,208,254,0.28),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(244,114,182,0.12),transparent_30%),linear-gradient(160deg,#fdf4ff_0%,#fff1f2_40%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-6 py-8 lg:px-10 xl:px-14";

const panelClass =
  "w-full rounded-[28px] border-2 border-fuchsia-200/80 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const inputClass =
  "h-14 w-full rounded-2xl border-2 border-fuchsia-200 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-200/50";

const btnPrimary =
  "inline-flex h-14 items-center justify-center rounded-2xl border-2 border-fuchsia-400 bg-gradient-to-r from-fuchsia-100 to-pink-100 px-8 text-base font-black text-fuchsia-950 shadow-md transition hover:scale-[1.02]";

const btnSecondary =
  "inline-flex h-12 items-center justify-center rounded-2xl border-2 border-fuchsia-200 bg-fuchsia-50 px-6 text-sm font-black text-slate-800 transition hover:bg-fuchsia-100";

function productKey(p: UnifiedProduct): string {
  return `${p.category}:${p.productId}`;
}

export default function MerkeziSatisFiyatlandirmaPage() {
  const [hydrated, setHydrated] = useState(false);
  const [products, setProducts] = useState<UnifiedProduct[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

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
  const [profitPct, setProfitPct] = useState("");
  const [saleLabel, setSaleLabel] = useState("");
  const [salePhotos, setSalePhotos] = useState<string[]>([]);
  const [basket, setBasket] = useState<GeneralSaleRecord[]>([]);

  const filtered = useMemo(
    () => filterUnifiedProducts(products, categoryFilter, search),
    [products, categoryFilter, search],
  );

  const picked = useMemo(
    () => products.find((p) => productKey(p) === pickKey),
    [products, pickKey],
  );

  useEffect(() => {
    if (!picked) return;
    if (picked.saleMode === "measure" && picked.saleUnits?.length) {
      if (!picked.saleUnits.includes(saleUnit as never)) setSaleUnit(picked.saleUnits[0]);
    } else {
      setSaleUnit("adet");
    }
    if (!saleLabel) setSaleLabel(`${picked.name} — ${CATEGORY_LABELS[picked.category]}`);
    if (!profitPct) setProfitPct(String(picked.profitPct));
  }, [picked, saleUnit, saleLabel, profitPct]);

  const preview = useMemo(() => {
    if (!picked) return null;
    return calcUnifiedSale(
      picked,
      toFloat(saleQty, 0),
      saleUnit,
      toFloat(profitPct, picked.profitPct),
      toFloat(usdRate, 0),
    );
  }, [picked, saleQty, saleUnit, profitPct, usdRate]);

  function addToBasket() {
    if (!picked) {
      setMsg("Ürün seçin.");
      return;
    }
    const line = calcUnifiedSale(
      picked,
      toFloat(saleQty, 0),
      saleUnit,
      toFloat(profitPct, picked.profitPct),
      toFloat(usdRate, 0),
    );
    if ("error" in line) {
      setMsg(line.error);
      return;
    }
    const rec: GeneralSaleRecord = {
      name: turkishUpper(saleLabel.trim() || picked.name),
      lines: [line],
      total_cost: line.lineCost,
      sale_price: line.lineSale,
      profit_pct: toFloat(profitPct, picked.profitPct),
      photos: [...salePhotos],
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    setBasket((b) => [...b, rec]);
    setSaleQty("1");
    setSalePhotos([]);
    setMsg("Sepete eklendi.");
  }

  function commitSale() {
    const result = commitCentralSales(basket, toFloat(usdRate, 0));
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    setBasket([]);
    reloadProducts();
    setPickKey("");
    setMsg("Satış kaydedildi; stoklar, satış geçmişleri ve stok hareketleri güncellendi.");
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
          <Link href="/urun-stok" className={`${btnSecondary} no-underline`}>
            ← Ürün & Stok Merkezi
          </Link>
          <Link href="/" className={`${btnSecondary} no-underline`}>
            Ana Panele Dön
          </Link>
        </div>

        <header className={`${panelClass} mb-8`}>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-fuchsia-700">Merkezi Satış</p>
          <h1 className="mt-3 text-4xl font-black xl:text-5xl">Satış & Fiyatlandırma</h1>
          <p className="mt-4 text-lg text-slate-600">
            Bu ekranda ürün eklenmez — tüm modül stok panellerinden canlı okunur. Satışta stok ilgili modülde düşer;
            kayıt merkezi satış geçmişine, kategori satış geçmişine ve stok hareketlerine yazılır.
          </p>
        </header>

        <section className={`${panelClass} mb-6 !p-5`}>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-fuchsia-800">Canlı ürün kaynakları</h2>
          <p className="mt-1 text-sm text-slate-600">Satışa hazır stoklu ürün sayıları (anlık)</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
              <div key={c} className="rounded-2xl border-2 border-fuchsia-100 bg-fuchsia-50/70 px-4 py-3 text-center">
                <p className="text-xs font-black uppercase text-slate-500">{CATEGORY_LABELS[c]}</p>
                <p className="mt-1 text-2xl font-black text-fuchsia-900">{liveCounts[c]}</p>
              </div>
            ))}
          </div>
        </section>

        {products.length === 0 ? (
          <section className={`${panelClass} mb-6 py-12 text-center`}>
            <p className="text-5xl" aria-hidden>
              🛒
            </p>
            <p className="mx-auto mt-4 max-w-lg text-lg font-semibold text-slate-600">
              Henüz satışa hazır ürün bulunamadı. Önce ilgili ürün/stok modülünden ürün ekleyin.
            </p>
          </section>
        ) : null}

        {msg ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900">
            {msg}
          </p>
        ) : null}

        {products.length > 0 ? (
        <div className="grid w-full gap-6 xl:grid-cols-[1.6fr_1fr]">
          <section className={`${panelClass} space-y-6`}>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="mb-2 block text-sm font-black">Kategori</span>
                <select
                  className={inputClass}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as ProductCategory | "all")}
                >
                  <option value="all">Tümü</option>
                  {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block lg:col-span-2">
                <span className="mb-2 block text-sm font-black">Ürün ara</span>
                <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad, tür, grup, model…" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-black">Dolar kuru (Doğaltaş $)</span>
                <input className={inputClass} type="number" step="0.01" value={usdRate} onChange={(e) => setUsdRate(e.target.value)} placeholder="Opsiyonel" />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-black">Ürün seç</span>
              <select className={inputClass} value={pickKey} onChange={(e) => setPickKey(e.target.value)}>
                <option value="">— Stoktan ürün seç —</option>
                {filtered.map((p) => (
                  <option key={productKey(p)} value={productKey(p)}>
                    [{CATEGORY_LABELS[p.category]}] {p.name} — {p.subtitle} ({p.stockDisplay})
                  </option>
                ))}
              </select>
            </label>

            {picked ? (
              <div className="rounded-2xl border-2 border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-pink-50 px-5 py-5">
                <p className="text-xs font-black uppercase tracking-wider text-fuchsia-700">Seçili ürün</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{picked.name}</p>
                <p className="text-base font-semibold text-slate-600">{picked.subtitle}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-fuchsia-100 bg-white/90 px-4 py-3">
                    <p className="text-xs font-black text-slate-500">Kategori</p>
                    <p className="text-base font-black">{CATEGORY_LABELS[picked.category]}</p>
                  </div>
                  <div className="rounded-xl border border-fuchsia-100 bg-white/90 px-4 py-3">
                    <p className="text-xs font-black text-slate-500">Mevcut stok</p>
                    <p className="text-base font-black">{picked.stockDisplay}</p>
                  </div>
                  <div className="rounded-xl border border-fuchsia-100 bg-white/90 px-4 py-3">
                    <p className="text-xs font-black text-slate-500">Birim</p>
                    <p className="text-base font-black">{picked.unitLabel}</p>
                  </div>
                  <div className="rounded-xl border border-fuchsia-100 bg-white/90 px-4 py-3">
                    <p className="text-xs font-black text-slate-500">Birim maliyet</p>
                    <p className="text-base font-black">{fmtUnifiedUnitCost(picked)}</p>
                  </div>
                  <div className="rounded-xl border border-fuchsia-100 bg-white/90 px-4 py-3">
                    <p className="text-xs font-black text-slate-500">Satış fiyatı (birim)</p>
                    <p className="text-base font-black">
                      {fmtUnifiedUnitCost({ ...picked, costPerUnit: picked.salePerUnit })}
                    </p>
                  </div>
                  <div className="rounded-xl border border-fuchsia-100 bg-white/90 px-4 py-3">
                    <p className="text-xs font-black text-slate-500">Fotoğraf</p>
                    <p className="text-base font-black">{picked.photoCount} adet</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-black">Satış etiketi</span>
                <input className={inputClass} value={saleLabel} onChange={(e) => setSaleLabel(turkishUpper(e.target.value))} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-black">
                  {picked?.saleMode === "measure" ? "Satılacak miktar" : "Satılacak adet"}
                </span>
                <input className={inputClass} type="number" step="any" min="0" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
              </label>
              {picked?.saleMode === "measure" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Birim</span>
                  <select className={inputClass} value={saleUnit} onChange={(e) => setSaleUnit(e.target.value)}>
                    {picked.saleUnits?.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Kâr oranı %</span>
                  <input className={inputClass} value={profitPct} onChange={(e) => setProfitPct(e.target.value)} placeholder={String(picked?.profitPct ?? 100)} />
                </label>
              )}
            </div>

            {picked?.saleMode === "measure" ? (
              <label className="block max-w-xs">
                <span className="mb-2 block text-sm font-black">Kâr oranı %</span>
                <input className={inputClass} value={profitPct} onChange={(e) => setProfitPct(e.target.value)} placeholder={String(picked.profitPct)} />
              </label>
            ) : null}

            {preview && !("error" in preview) ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-center text-base font-black">
                  Maliyet: {fmtMoney(preview.lineCost)}
                </div>
                <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4 text-center text-base font-black">
                  Satış: {fmtMoney(preview.lineSale)}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold">
                  Stok düşümü: {preview.saleBaseQty} {picked?.unitLabel ?? "adet"}
                  {preview.saleUnit !== picked?.unitLabel ? ` (${preview.saleQty} ${preview.saleUnit})` : ""}
                </div>
              </div>
            ) : preview && "error" in preview ? (
              <p className="font-semibold text-red-700">{preview.error}</p>
            ) : null}

            <label className="inline-block cursor-pointer">
              <span className={btnSecondary}>({salePhotos.length}) Fotoğraf</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files;
                  if (f?.length) setSalePhotos(await filesToDataUrls(f));
                }}
              />
            </label>

            <button type="button" className={`${btnPrimary} w-full`} onClick={addToBasket} disabled={!picked}>
              Sepete Ekle
            </button>
          </section>

          <section className={panelClass}>
            <h2 className="mb-4 text-xl font-black">Sepet</h2>
            <div className="max-h-[520px] space-y-3 overflow-y-auto">
              {basket.length === 0 ? (
                <p className="py-8 text-center text-slate-500">Sepet boş</p>
              ) : (
                basket.map((rec, i) => (
                  <div key={i} className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/60 p-4">
                    <p className="font-black">{rec.name}</p>
                    {rec.lines.map((ln, j) => (
                      <p key={j} className="mt-1 text-sm text-slate-700">
                        <span className="font-semibold text-fuchsia-800">[{CATEGORY_LABELS[ln.category]}]</span>{" "}
                        {ln.productName} · {ln.saleQty} {ln.saleUnit}
                      </p>
                    ))}
                    <p className="mt-2 text-sm font-bold">
                      {fmtMoney(rec.total_cost)} → {fmtMoney(rec.sale_price)}
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-sm font-black text-red-600"
                      onClick={() => setBasket((b) => b.filter((_, j) => j !== i))}
                    >
                      Sepetten Sil
                    </button>
                  </div>
                ))
              )}
            </div>
            <p className="mt-4 text-base font-black">
              Toplam: {fmtMoney(basket.reduce((s, r) => s + r.total_cost, 0))} →{" "}
              {fmtMoney(basket.reduce((s, r) => s + r.sale_price, 0))}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              Kâr: {fmtMoney(basket.reduce((s, r) => s + r.sale_price - r.total_cost, 0))}
            </p>
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
        ) : null}
      </div>
    </main>
  );
}
