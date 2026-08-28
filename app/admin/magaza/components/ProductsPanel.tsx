"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { categoriesApi, productsApi, storePhotoPublicUrl } from "@/app/admin/magaza/magazaAdminApi";
import {
  formatStorePrice,
  STORE_PRODUCT_STATUS_LABELS,
  type StoreCategory,
  type StoreProductAdminRow,
  type StoreProductStatus,
} from "@/lib/store/types";

const STATUS_STYLE: Record<StoreProductStatus, string> = {
  draft: "bg-stone-100 text-stone-600 ring-stone-200/70",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  archived: "bg-amber-50 text-amber-700 ring-amber-200/70",
};

export default function ProductsPanel() {
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();
  const [rows, setRows] = useState<StoreProductAdminRow[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await productsApi.list({ q: q || undefined, category: category || undefined, status: status || undefined });
    if (res.ok) setRows(res.data);
    else showToast({ type: "error", message: res.error });
    setLoading(false);
  }, [q, category, status, showToast]);

  useEffect(() => {
    (async () => {
      const c = await categoriesApi.list();
      if (c.ok) setCategories(c.data);
    })();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  async function archive(p: StoreProductAdminRow) {
    const ok = await deleteConfirm({
      title: "Ürünü arşivle",
      message: `"${p.name}" arşivlensin mi? Arşivlenen ürün mağazada görünmez.`,
      confirmText: "Arşivle",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    const res = await productsApi.update(p.id, { status: "archived" });
    if (res.ok) {
      showToast({ type: "success", message: "Ürün arşivlendi." });
      void load();
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  return (
    <div className="space-y-5">
      {/* Araç çubuğu */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap gap-2">
          <input
            className="store-input sm:max-w-xs"
            placeholder="Ürün ara (ad / SKU)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="store-input sm:w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Tüm kategoriler</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="store-input sm:w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tüm durumlar</option>
            <option value="draft">Taslak</option>
            <option value="active">Aktif</option>
            <option value="archived">Arşiv</option>
          </select>
        </div>
        <Link href="/admin/magaza/urun/yeni" className="btn-primary shrink-0">
          + Yeni Ürün
        </Link>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-stone-400">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300/80 bg-white/60 px-6 py-14 text-center">
          <p className="text-sm font-semibold text-stone-700">
            {q || category || status ? "Bu filtreye uygun ürün yok" : "Henüz ürün yok"}
          </p>
          <p className="mt-1 text-[13px] text-stone-500">
            {q || category || status
              ? "Filtreleri değiştirmeyi deneyin."
              : "İlk doğal ürününüzü ekleyerek vitrini oluşturun."}
          </p>
          {!(q || category || status) ? (
            <Link href="/admin/magaza/urun/yeni" className="btn-primary mt-5 inline-flex">
              + Yeni Ürün
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200/70 bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-stone-200/70 bg-stone-50/70 text-[12px] uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Ürün</th>
                <th className="px-4 py-3 font-semibold">Kategori</th>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Fiyat</th>
                <th className="px-4 py-3 font-semibold">Stok</th>
                <th className="px-4 py-3 font-semibold">Durum</th>
                <th className="px-4 py-3 text-right font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((p) => {
                const img = storePhotoPublicUrl(p.primary_image_path);
                return (
                  <tr key={p.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200/70">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-stone-300">
                              <span className="text-lg">🌿</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-stone-800">{p.name}</span>
                            {p.is_featured ? <span title="Öne çıkan">⭐</span> : null}
                          </div>
                          <span className="text-[12px] text-stone-400">{p.image_count} görsel</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{p.category_name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-stone-500">{p.sku ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-stone-800">
                      {formatStorePrice(Number(p.price), p.currency)}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {p.track_inventory ? p.stock_quantity : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ${STATUS_STYLE[p.status]}`}>
                        {STORE_PRODUCT_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/magaza/urun/${p.id}`}
                          className="rounded-lg border border-stone-200 px-3 py-1.5 text-[13px] font-semibold text-stone-600 hover:bg-stone-50"
                        >
                          Düzenle
                        </Link>
                        {p.status !== "archived" ? (
                          <button
                            type="button"
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-[13px] font-semibold text-amber-700 hover:bg-amber-50"
                            onClick={() => archive(p)}
                          >
                            Arşivle
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
