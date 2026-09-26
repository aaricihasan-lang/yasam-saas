"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import {
  CATEGORY_LABELS,
  type ProductCategory,
  type UnifiedProduct,
  fmtMoney,
  loadUnifiedProducts,
  toFloat,
  turkishUpper,
  unitsForMeasureType,
} from "@/lib/urun-stok/generalSalesLogic";
import {
  type CatalogProduct,
  type SaleLineInput,
  createSale,
  fetchSalesCatalog,
  newIdempotencyKey,
} from "@/lib/urun-stok/salesApi";
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

// ─── Birleşik UI ürün modeli (DB katalog + demo localStorage tek şekle indirger)
type UiProduct = {
  category: ProductCategory;
  productId: string;      // seçim anahtarı (real: inventory_id uuid)
  inventoryId: string;    // DB satış için uuid (demo'da kullanılmaz)
  name: string;
  productGroup: string;
  subtitle: string;
  stockAmount: number;
  stockDisplay: string;
  saleMode: "adet" | "measure";
  measureType: string;
  saleUnits: string[];
  baseUnit: string;
  unitLabel: string;
  costPerUnit: number;
  salePerUnit: number;
  profitPct: number;
  photoCount: number;
  photos: string[];
};

type UiBasketLine = {
  inventoryType: ProductCategory;
  inventoryId: string;
  productId: string;
  name: string;
  subtitle: string;
  saleQty: number;
  saleUnit: string;
  saleBaseQty: number;
  markupPct: number;
  lineCost: number;
  lineSale: number;
};

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function toBaseQty(measureType: string, unit: string, qty: number): number {
  if (measureType === "ML / Litre") return unit === "litre" ? qty * 1000 : qty;
  if (measureType === "Gram / KG") return unit === "kg" ? qty * 1000 : qty;
  return Math.floor(qty);
}

function catalogToUi(p: CatalogProduct): UiProduct {
  const saleMode = p.measure_type === "ML / Litre" || p.measure_type === "Gram / KG" ? "measure" : "adet";
  return {
    category: p.inventory_type as ProductCategory,
    productId: p.inventory_id,
    inventoryId: p.inventory_id,
    name: p.name,
    productGroup: p.subtitle,
    subtitle: p.subtitle,
    stockAmount: p.stock,
    stockDisplay: `${fmtQty(p.stock)} ${p.unit}`,
    saleMode,
    measureType: p.measure_type,
    saleUnits: saleMode === "measure" ? unitsForMeasureType(p.measure_type) : ["adet"],
    baseUnit: p.unit,
    unitLabel: p.unit,
    costPerUnit: p.cost_per_unit,
    salePerUnit: p.sale_per_unit,
    profitPct: p.profit_pct,
    photoCount: p.photo_count,
    photos: [],
  };
}

function unifiedToUi(p: UnifiedProduct): UiProduct {
  return {
    category: p.category,
    productId: p.productId,
    inventoryId: p.productId,
    name: p.name,
    productGroup: p.productGroup,
    subtitle: p.subtitle,
    stockAmount: p.stockAmount,
    stockDisplay: p.stockDisplay,
    saleMode: p.saleMode,
    measureType: p.measureType ?? "",
    saleUnits: (p.saleUnits as string[] | undefined) ?? [p.baseUnit ?? "adet"],
    baseUnit: p.baseUnit ?? "adet",
    unitLabel: p.unitLabel,
    costPerUnit: p.costPerUnit,
    salePerUnit: p.salePerUnit,
    profitPct: p.profitPct,
    photoCount: p.photoCount,
    photos: p.photos ?? [],
  };
}

type PreviewOk = { saleQty: number; saleBaseQty: number; lineCost: number; lineSale: number; markup: number };
function calcPreview(p: UiProduct, qtyRaw: number, unit: string, markupRaw: number): PreviewOk | { error: string } {
  const markup = markupRaw > 0 ? markupRaw : p.profitPct;
  let baseQty: number;
  let saleQty = qtyRaw;
  if (p.saleMode === "adet") {
    saleQty = Math.floor(qtyRaw);
    baseQty = saleQty;
  } else {
    baseQty = toBaseQty(p.measureType, unit, qtyRaw);
  }
  if (!(baseQty > 0)) return { error: "Satış miktarı 0'dan büyük olmalı." };
  if (baseQty > p.stockAmount) return { error: `Yetersiz stok. Mevcut: ${p.stockDisplay}` };
  const lineCost = p.costPerUnit * baseQty;
  const lineSale = markup > 0 ? lineCost * (1 + markup / 100) : (p.salePerUnit > 0 ? p.salePerUnit * baseQty : lineCost);
  return { saleQty, saleBaseQty: baseQty, lineCost, lineSale, markup };
}

function productOptionLabel(p: UiProduct): string {
  const unit = p.baseUnit || p.unitLabel || "adet";
  return `${p.name} | ${p.productGroup || "—"} | Stok: ${fmtQty(p.stockAmount)} ${unit}`;
}

export default function MerkeziSatisFiyatlandirmaPage() {
  const committingRef = useRef(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<UiProduct[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);

  const [usdRate, setUsdRate] = useState("");

  // Real hesap: DB CANONICAL katalog. Demo: localStorage (seeded) katalog.
  const loadCatalog = useCallback(async (demo: boolean) => {
    if (demo) {
      setProducts(loadUnifiedProducts(toFloat(usdRate, 0)).map(unifiedToUi));
      return;
    }
    setLoading(true);
    try {
      const res = await fetchSalesCatalog();
      if (!res.ok) {
        setMsgOk(false);
        setMsg(res.error ?? "Ürün kataloğu okunamadı.");
        setProducts([]);
        return;
      }
      setProducts(res.products.map(catalogToUi));
    } finally {
      setLoading(false);
    }
  }, [usdRate]);

  const liveCounts = useMemo(() => {
    const counts = { dogaltas: 0, oil: 0, soap_cream: 0, accessory: 0, other: 0 } as Record<ProductCategory, number>;
    for (const p of products) counts[p.category] += 1;
    return counts;
  }, [products]);

  useEffect(() => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) seedDemoUrunStok();
    setIsDemo(demo);
    void loadCatalog(demo).finally(() => setHydrated(true));
  }, [loadCatalog]);

  useEffect(() => {
    const onRefresh = () => { void loadCatalog(isDemo); };
    window.addEventListener("focus", onRefresh);
    const onVisible = () => { if (document.visibilityState === "visible") onRefresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadCatalog, isDemo]);

  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [pickKey, setPickKey] = useState("");
  const [saleQty, setSaleQty] = useState("1");
  const [saleUnit, setSaleUnit] = useState("adet");
  const [profitPct, setProfitPct] = useState("100");
  const [saleLabel, setSaleLabel] = useState("");
  const [basket, setBasket] = useState<UiBasketLine[]>([]);

  const filtered = useMemo(() => {
    const list = categoryFilter === "all" ? products : products.filter((p) => p.category === categoryFilter);
    const ql = search.trim().toLocaleLowerCase("tr-TR");
    if (!ql) return list;
    return list.filter(
      (p) =>
        p.name.toLocaleLowerCase("tr-TR").includes(ql) ||
        (p.productGroup ?? "").toLocaleLowerCase("tr-TR").includes(ql) ||
        p.subtitle.toLocaleLowerCase("tr-TR").includes(ql),
    );
  }, [products, categoryFilter, search]);

  const picked = useMemo(() => {
    if (!pickKey) return undefined;
    return filtered.find((p) => p.productId === pickKey) ?? products.find((p) => p.productId === pickKey);
  }, [filtered, products, pickKey]);

  const pickedPhotos = useMemo(() => picked?.photos ?? [], [picked]);

  useEffect(() => {
    if (!pickKey) return;
    const p = filtered.find((x) => x.productId === pickKey) ?? products.find((x) => x.productId === pickKey);
    if (!p) return;
    if (p.saleMode === "measure" && p.saleUnits.length) {
      if (!p.saleUnits.includes(saleUnit)) setSaleUnit(p.saleUnits[0]);
    } else {
      setSaleUnit("adet");
    }
    setSaleLabel(`${p.name} — ${CATEGORY_LABELS[p.category]}`);
    setProfitPct(String(p.profitPct > 0 ? p.profitPct : 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnizca urun degisince varsayilanlari yukle
  }, [pickKey, filtered, products]);

  const preview = useMemo(() => {
    if (!picked) return null;
    return calcPreview(picked, toFloat(saleQty, 0), saleUnit, toFloat(profitPct, 100));
  }, [picked, saleQty, saleUnit, profitPct]);

  const basketTotals = useMemo(() => {
    const totalCost = basket.reduce((s, r) => s + r.lineCost, 0);
    const totalSale = basket.reduce((s, r) => s + r.lineSale, 0);
    return { totalCost, totalSale, totalProfit: totalSale - totalCost };
  }, [basket]);

  function addToBasket() {
    if (!picked) {
      setMsgOk(false);
      setMsg("Ürün seçin.");
      return;
    }
    const line = calcPreview(picked, toFloat(saleQty, 0), saleUnit, toFloat(profitPct, 100));
    if ("error" in line) {
      setMsgOk(false);
      setMsg(line.error);
      return;
    }
    const rec: UiBasketLine = {
      inventoryType: picked.category,
      inventoryId: picked.inventoryId,
      productId: picked.productId,
      name: turkishUpper(saleLabel.trim() || picked.name),
      subtitle: picked.subtitle,
      saleQty: line.saleQty,
      saleUnit: picked.saleMode === "measure" ? saleUnit : "adet",
      saleBaseQty: line.saleBaseQty,
      markupPct: line.markup,
      lineCost: line.lineCost,
      lineSale: line.lineSale,
    };
    setBasket((b) => [...b, rec]);
    setSaleQty("1");
    setMsgOk(false);
    setMsg("Sepete eklendi.");
  }

  async function commitSale() {
    if (committingRef.current) return;
    if (!basket.length) return;
    committingRef.current = true;
    setIsCommitting(true);
    try {
      if (isDemo) {
        // Demo: server no-op — yalnız in-memory stok düşümü + başarı mesajı (showcase).
        setProducts((prev) =>
          prev.map((p) => {
            const sold = basket.filter((b) => b.productId === p.productId).reduce((s, b) => s + b.saleBaseQty, 0);
            return sold > 0 ? { ...p, stockAmount: p.stockAmount - sold, stockDisplay: `${fmtQty(p.stockAmount - sold)} ${p.baseUnit}` } : p;
          }),
        );
        setBasket([]);
        setPickKey("");
        setMsgOk(true);
        setMsg("Demo: satış önizlendi (kalıcı kayıt yapılmaz).");
        return;
      }

      const lines: SaleLineInput[] = basket.map((b) => ({
        inventory_type: b.inventoryType,
        inventory_id: b.inventoryId,
        quantity: b.saleBaseQty,
        markup_pct: b.markupPct,
      }));
      const res = await createSale({ idempotencyKey: newIdempotencyKey(), source: "central", lines });

      if (!res.ok) {
        setMsgOk(false);
        setMsg(res.error ?? "Satış kaydedilemedi.");
        await loadCatalog(false); // gerçek stok yenilensin (yetersiz stok vs.)
        return;
      }

      setBasket([]);
      setPickKey("");
      setSaleQty("1");
      setProfitPct("100");
      setSaleLabel("");
      await loadCatalog(false); // stok DB'den yeniden yüklenir (canonical)
      setMsgOk(true);
      setMsg("Satış kaydedildi. Stok düşüldü ve satış geçmişine yazıldı.");
    } catch {
      setMsgOk(false);
      setMsg("Satış sırasında ağ hatası. Lütfen tekrar deneyin.");
      await loadCatalog(false);
    } finally {
      committingRef.current = false;
      setIsCommitting(false);
    }
  }

  if (!hydrated) {
    return (
      <main className={pageBg}>
        <div className="flex min-h-screen items-center justify-center font-semibold text-slate-600">
          Yükleniyor&hellip;
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
          <p className="text-xs font-black uppercase tracking-[0.3em] text-fuchsia-700">Merkezi Satış</p>
          <h1 className="mt-1 text-2xl font-black xl:text-3xl">Satış &amp; Fiyatlandırma</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ürün ekleme yapılmaz &mdash; modül stoklarından canlı seçim. Satış sunucuda doğrulanır; stok atomik olarak düşer ve satış geçmişi kalıcıdır.
          </p>
        </header>

        <section className={`${panelClass} mb-3`}>
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-800">Canlı ürün kaynakları</h2>
          <p className="mt-0.5 text-xs text-slate-600">Stoklu ürün sayıları (anlık)</p>
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
          <h2 className="text-base font-black text-fuchsia-900">Satış paneli</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Kategori filtreleyin, ürün seçin, miktar ve kâr oranı ile sepete ekleyin.
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
                  <option value="all">Tümü</option>
                  {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-black">Dolar kuru (Doğaltaş $)</span>
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
              <span className="mb-1 block text-xs font-black">Ürün ara</span>
              <input
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün adı, tür, grup, model..."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black">Ürün seç</span>
              <select
                key={`product-pick-${categoryFilter}-${filtered.length}`}
                className={inputClass}
                value={pickKey}
                onChange={(e) => setPickKey(e.target.value)}
              >
                <option value="">— Ürün seçin —</option>
                {filtered.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {productOptionLabel(p)}
                  </option>
                ))}
              </select>
              {loading ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">Katalog yükleniyor…</p>
              ) : products.length === 0 ? (
                <p className="relative z-0 mt-2 rounded-xl border border-dashed border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-xs font-semibold text-slate-600">
                  Henüz satışa hazır ürün bulunamadı. Önce ilgili ürün/stok modülünden ürün ekleyin.
                </p>
              ) : categoryFilter !== "all" && filtered.length === 0 ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">Filtreye uygun ürün yok.</p>
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
                    <p className="text-xs font-black uppercase text-fuchsia-700">Seçili ürün</p>
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
                    <p className="text-sm font-black">{fmtMoney(picked.costPerUnit)} / {picked.unitLabel}</p>
                  </div>
                  <div className="rounded-lg border border-white bg-white/90 px-3 py-2">
                    <p className="text-xs font-black text-slate-500">Satış fiyatı (birim)</p>
                    <p className="text-sm font-black">
                      {preview && !("error" in preview)
                        ? fmtMoney(preview.lineSale / (preview.saleBaseQty || 1))
                        : fmtMoney(picked.salePerUnit)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white bg-white/90 px-3 py-2 sm:col-span-2">
                    <p className="text-xs font-black text-slate-500">Fotoğraf</p>
                    <p className="text-sm font-black">{picked.photoCount} adet</p>
                  </div>
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-xs font-black">Satış etiketi</span>
              <input
                className={inputClass}
                value={saleLabel}
                onChange={(e) => setSaleLabel(e.target.value)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-black">
                  {picked?.saleMode === "measure" ? "Satış miktarı" : "Satış adedi"}
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
                    {picked.saleUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-xs font-black">Maliyet üzerinden kâr %</span>
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
                  Satış: {fmtMoney(preview.lineSale)}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold">
                  Kâr: {fmtMoney(preview.lineSale - preview.lineCost)} &middot; Stok &minus;{fmtQty(preview.saleBaseQty)}{" "}
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
                <p className="py-10 text-center text-sm text-slate-500">Sepet boş</p>
              ) : (
                basket.map((ln, i) => {
                  const profit = ln.lineSale - ln.lineCost;
                  return (
                    <div key={i} className="rounded-xl border-2 border-fuchsia-100 bg-fuchsia-50/70 p-3">
                      <p className="text-sm font-black text-slate-900">{ln.name}</p>
                      <p className="mt-0.5 text-xs font-bold text-fuchsia-800">
                        {CATEGORY_LABELS[ln.inventoryType]} &middot; {fmtQty(ln.saleQty)} {ln.saleUnit}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                        <div>
                          <p className="text-slate-500">Maliyet</p>
                          <p className="font-black">{fmtMoney(ln.lineCost)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Satış</p>
                          <p className="font-black">{fmtMoney(ln.lineSale)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Kâr</p>
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
                        Sepetten kaldır
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
                <span>Toplam satış</span>
                <span className="font-black text-slate-900">{fmtMoney(basketTotals.totalSale)}</span>
              </p>
              <p className="flex justify-between text-sm font-black">
                <span>Toplam kâr</span>
                <span className={basketTotals.totalProfit < 0 ? "text-rose-700" : "text-emerald-700"}>
                  {fmtMoney(basketTotals.totalProfit)}
                </span>
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={btnSecondary} onClick={() => setBasket([])} disabled={!basket.length}>
                Sepeti Temizle
              </button>
              <button type="button" className={btnPrimary} onClick={() => void commitSale()} disabled={!basket.length || isCommitting}>
                {isCommitting ? "Kaydediliyor..." : "Satışı Kaydet"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
