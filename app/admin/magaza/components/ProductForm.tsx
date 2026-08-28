"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { categoriesApi, productsApi } from "@/app/admin/magaza/magazaAdminApi";
import { slugifyStore } from "@/lib/store/slug";
import {
  STORE_CURRENCIES,
  STORE_PRODUCT_TYPES,
  STORE_PRODUCT_TYPE_LABELS,
  STORE_PRODUCT_STATUSES,
  STORE_PRODUCT_STATUS_LABELS,
  type StoreCategory,
  type StoreProductImage,
} from "@/lib/store/types";
import ImageManager from "./ImageManager";

type FormState = {
  name: string;
  slug: string;
  category_id: string;
  short_description: string;
  description: string;
  product_type: string;
  sku: string;
  price: string;
  compare_at_price: string;
  currency: string;
  vat_rate: string;
  track_inventory: boolean;
  stock_quantity: string;
  low_stock_threshold: string;
  status: string;
  is_featured: boolean;
  is_new: boolean;
  sort_order: string;
};

const EMPTY: FormState = {
  name: "", slug: "", category_id: "", short_description: "", description: "",
  product_type: "physical", sku: "", price: "", compare_at_price: "", currency: "TRY",
  vat_rate: "0", track_inventory: false, stock_quantity: "0", low_stock_threshold: "0",
  status: "draft", is_featured: false, is_new: false, sort_order: "0",
};

export default function ProductForm({ productId }: { productId: string | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const isEdit = productId !== null;

  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [images, setImages] = useState<StoreProductImage[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await categoriesApi.list();
      if (c.ok) setCategories(c.data);
    })();
  }, []);

  useEffect(() => {
    if (!productId) return;
    (async () => {
      const res = await productsApi.detail(productId);
      if (res.ok) {
        const p = res.data;
        setForm({
          name: p.name,
          slug: p.slug,
          category_id: p.category_id ?? "",
          short_description: p.short_description,
          description: p.description,
          product_type: p.product_type,
          sku: p.sku ?? "",
          price: String(p.price),
          compare_at_price: p.compare_at_price === null ? "" : String(p.compare_at_price),
          currency: p.currency,
          vat_rate: String(p.vat_rate),
          track_inventory: p.track_inventory,
          stock_quantity: String(p.stock_quantity),
          low_stock_threshold: String(p.low_stock_threshold),
          status: p.status,
          is_featured: p.is_featured,
          is_new: p.is_new,
          sort_order: String(p.sort_order),
        });
        setImages(p.images ?? []);
      } else {
        setNotFound(true);
        showToast({ type: "error", message: res.error });
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isPhysical = form.product_type === "physical";
  const slugPreview = useMemo(
    () => (form.slug.trim() ? form.slug.trim() : form.name ? slugifyStore(form.name) : ""),
    [form.slug, form.name],
  );

  function buildBody(): Record<string, unknown> | null {
    const name = form.name.trim();
    if (!name) {
      showToast({ type: "warning", message: "Ürün adı gerekli." });
      return null;
    }
    if (!form.category_id) {
      showToast({ type: "warning", message: "Kategori seçin." });
      return null;
    }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) {
      showToast({ type: "warning", message: "Geçerli bir fiyat girin." });
      return null;
    }
    const vat = Number(form.vat_rate);
    if (!Number.isFinite(vat) || vat < 0 || vat > 100) {
      showToast({ type: "warning", message: "KDV oranı 0-100 arası olmalı." });
      return null;
    }

    const body: Record<string, unknown> = {
      name,
      category_id: form.category_id,
      short_description: form.short_description,
      description: form.description,
      product_type: form.product_type,
      price,
      currency: form.currency,
      vat_rate: vat,
      status: form.status,
      is_featured: form.is_featured,
      is_new: form.is_new,
      sort_order: Number(form.sort_order) || 0,
    };
    if (form.slug.trim()) body.slug = form.slug.trim();
    body.sku = form.sku.trim() === "" ? null : form.sku.trim();
    body.compare_at_price = form.compare_at_price.trim() === "" ? null : Number(form.compare_at_price);

    if (isPhysical) {
      body.track_inventory = form.track_inventory;
      body.stock_quantity = Number(form.stock_quantity) || 0;
      body.low_stock_threshold = Number(form.low_stock_threshold) || 0;
    } else {
      body.track_inventory = false;
      body.stock_quantity = 0;
      body.low_stock_threshold = 0;
    }
    return body;
  }

  async function save() {
    const body = buildBody();
    if (!body) return;
    setSaving(true);
    const res = isEdit ? await productsApi.update(productId as string, body) : await productsApi.create(body);
    setSaving(false);
    if (res.ok) {
      if (isEdit) {
        showToast({ type: "success", message: "Ürün kaydedildi." });
      } else {
        showToast({ type: "success", message: "Ürün oluşturuldu. Şimdi görsel ekleyebilirsiniz." });
        router.push(`/admin/magaza/urun/${res.data.id}`);
      }
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px] px-4 py-10 text-center text-sm text-stone-400">Yükleniyor…</div>
    );
  }
  if (notFound) {
    return (
      <div className="mx-auto max-w-[1000px] px-4 py-16 text-center">
        <p className="text-sm font-semibold text-stone-700">Ürün bulunamadı.</p>
        <Link href="/admin/magaza" className="btn-soft mt-4 inline-flex">
          Yönetime dön
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7f5ef_0%,#f4f6f1_100%)] text-stone-900">
      <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/admin/magaza" className="text-[13px] font-semibold text-stone-500 hover:text-emerald-800">
            ← Doğal Pazar Yönetimi
          </Link>
          <div className="flex gap-2">
            <Link href="/admin/magaza" className="btn-soft">İptal</Link>
            <button type="button" className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Kaydediliyor…" : isEdit ? "Kaydet" : "Ürünü Oluştur"}
            </button>
          </div>
        </div>

        <h1 className="mt-4 text-2xl font-black tracking-tight text-stone-900">
          {isEdit ? form.name || "Ürünü Düzenle" : "Yeni Ürün"}
        </h1>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* Sol: temel + satış + stok */}
          <div className="space-y-6">
            <Card title="Temel Bilgiler">
              <Grid>
                <Field label="Ürün Adı *" full>
                  <input className="store-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ametist Doğal Taş Kolye" />
                </Field>
                <Field label="Slug" full>
                  <input className="store-input" value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder={slugPreview || "otomatik üretilir"} />
                  {slugPreview ? <span className="text-[11px] text-stone-400">/magaza/{slugPreview}</span> : null}
                </Field>
                <Field label="Kategori *">
                  <select className="store-input" value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                    <option value="">Seçin…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (pasif)"}</option>
                    ))}
                  </select>
                  {categories.length === 0 ? (
                    <span className="text-[11px] text-amber-700">Önce Kategoriler sekmesinden kategori oluşturun.</span>
                  ) : null}
                </Field>
                <Field label="Ürün Tipi *">
                  <select className="store-input" value={form.product_type} onChange={(e) => set("product_type", e.target.value)}>
                    {STORE_PRODUCT_TYPES.map((t) => (
                      <option key={t} value={t}>{STORE_PRODUCT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Kısa Açıklama" full>
                  <textarea className="store-input min-h-[60px]" value={form.short_description} onChange={(e) => set("short_description", e.target.value)} placeholder="Kartlarda görünen kısa tanıtım." />
                </Field>
                <Field label="Detaylı Açıklama" full>
                  <textarea className="store-input min-h-[140px]" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Ürün detay sayfasında görünen açıklama." />
                </Field>
              </Grid>
            </Card>

            <Card title="Satış">
              <Grid>
                <Field label="Normal Fiyat *">
                  <input type="number" min="0" step="0.01" className="store-input" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Karşılaştırma / Eski Fiyat">
                  <input type="number" min="0" step="0.01" className="store-input" value={form.compare_at_price} onChange={(e) => set("compare_at_price", e.target.value)} placeholder="opsiyonel" />
                </Field>
                <Field label="Para Birimi">
                  <select className="store-input" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                    {STORE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="KDV Oranı (%)">
                  <input type="number" min="0" max="100" step="0.01" className="store-input" value={form.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} />
                </Field>
                <Field label="Durum">
                  <select className="store-input" value={form.status} onChange={(e) => set("status", e.target.value)}>
                    {STORE_PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{STORE_PRODUCT_STATUS_LABELS[s]}</option>)}
                  </select>
                </Field>
                <Field label="Sıralama">
                  <input type="number" className="store-input" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
                </Field>
                <Field label="Etiketler" full>
                  <div className="flex flex-wrap gap-5 pt-1">
                    <Check label="Öne çıkan ürün" checked={form.is_featured} onChange={(v) => set("is_featured", v)} />
                    <Check label="Yeni ürün etiketi" checked={form.is_new} onChange={(v) => set("is_new", v)} />
                  </div>
                </Field>
              </Grid>
            </Card>

            {isPhysical ? (
              <Card title="Stok">
                <Grid>
                  <Field label="Stok Takibi" full>
                    <Check label="Bu ürünün stoğunu takip et" checked={form.track_inventory} onChange={(v) => set("track_inventory", v)} />
                  </Field>
                  {form.track_inventory ? (
                    <>
                      <Field label="Mevcut Stok">
                        <input type="number" min="0" step="1" className="store-input" value={form.stock_quantity} onChange={(e) => set("stock_quantity", e.target.value)} />
                      </Field>
                      <Field label="Kritik Stok Seviyesi">
                        <input type="number" min="0" step="1" className="store-input" value={form.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} />
                      </Field>
                      <Field label="SKU (Ürün Kodu)">
                        <input className="store-input" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="opsiyonel" />
                      </Field>
                    </>
                  ) : (
                    <Field label="SKU (Ürün Kodu)">
                      <input className="store-input" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="opsiyonel" />
                    </Field>
                  )}
                </Grid>
              </Card>
            ) : (
              <Card title="Ürün Kodu">
                <Field label="SKU (opsiyonel)">
                  <input className="store-input" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="opsiyonel" />
                </Field>
              </Card>
            )}
          </div>

          {/* Sağ: görseller */}
          <div>
            <Card title="Görseller">
              {isEdit ? (
                <ImageManager productId={productId as string} initialImages={images} />
              ) : (
                <p className="rounded-xl border border-dashed border-stone-300/70 bg-stone-50/60 px-4 py-8 text-center text-[13px] text-stone-500">
                  Görselleri, ürünü kaydettikten sonra ekleyebilirsiniz.
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200/70 bg-white p-5 sm:p-6">
      <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-stone-700">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[12px] font-semibold text-stone-600">{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
      {label}
    </label>
  );
}
