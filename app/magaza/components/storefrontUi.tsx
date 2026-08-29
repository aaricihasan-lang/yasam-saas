/**
 * app/magaza/components/storefrontUi.tsx — Doğal Pazar (YÖN B) sunum bileşenleri.
 *
 * Warm Botanical Boutique: warm cream/ivory zemin, gerçek fotoğraf-öncelikli, ölçülü
 * radius, hafif gölge, serif+sans hiyerarşisi. "Retail product card" — app-card değil.
 * Saf sunum (hook yok).
 */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  formatStorePrice,
  STORE_PRODUCT_TYPE_LABELS,
  type StorefrontProductCard,
} from "@/lib/store/types";

/** Görselsiz ürün için zarif, doğal yer tutucu (amatör "resim yok" hissi vermez). */
export function ProductImageFallback({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,#efe9dc_0%,#e6ddcb_100%)] ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 48 48" className="h-10 w-10 text-[#a8977c]" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M24 40c0-9 5-16 14-18-2 10-7 15-14 18Z" strokeLinejoin="round" />
        <path d="M24 40c0-7-4-12-11-13 1.5 8 5 11 11 13Z" strokeLinejoin="round" />
        <path d="M24 40V22" strokeLinecap="round" />
      </svg>
      <span className="text-[10.5px] font-medium tracking-wide text-[#a8977c]">Görsel hazırlanıyor</span>
    </div>
  );
}

export function ProductImage({
  url,
  alt,
  className = "",
}: {
  url: string | null;
  alt: string;
  className?: string;
}) {
  if (!url) return <ProductImageFallback className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className={`h-full w-full object-cover ${className}`} />;
}

export function StoreBadge({ children, tone = "muted" }: { children: ReactNode; tone?: "featured" | "new" | "muted" }) {
  const tones: Record<string, string> = {
    featured: "bg-white/90 text-[#8a5a2b] ring-[#e6d3b6]",
    new: "bg-white/90 text-[#5d6b56] ring-[#d3ddca]",
    muted: "bg-[#efe7d8]/95 text-[#8b8175] ring-[#e0d6c4]",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold tracking-wide ring-1 backdrop-blur-sm ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function PriceTag({
  price,
  compareAt,
  currency,
  size = "md",
}: {
  price: number;
  compareAt: number | null;
  currency: string;
  size?: "md" | "lg";
}) {
  const hasCompare = compareAt !== null && compareAt > price;
  const main = size === "lg" ? "text-[26px] sm:text-[30px]" : "text-lg";
  const old = size === "lg" ? "text-base" : "text-[13px]";
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className={`${main} font-serif font-semibold tracking-tight text-[#2a2620]`}>{formatStorePrice(price, currency)}</span>
      {hasCompare ? <span className={`${old} text-[#a99f90] line-through`}>{formatStorePrice(compareAt as number, currency)}</span> : null}
    </div>
  );
}

function StockDot({ product }: { product: StorefrontProductCard }) {
  if (!product.track_inventory) return null;
  return product.in_stock ? (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#6e7c6a]"><span className="h-1.5 w-1.5 rounded-full bg-[#6e7c6a]" aria-hidden /> Stokta</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#a99f90]"><span className="h-1.5 w-1.5 rounded-full bg-[#cbbfa8]" aria-hidden /> Tükendi</span>
  );
}

/** Retail ürün kartı — gerçek 3:4 fotoğraf, ölçülü kart, net fiyat/CTA.
 *  hrefBase: kart hedef kökü (public "/magaza" default; sahip önizlemesinde "/admin/magaza/onizleme"). */
export function ProductCard({ product, hrefBase = "/magaza" }: { product: StorefrontProductCard; hrefBase?: string }) {
  const soldOut = !product.in_stock;
  return (
    <Link
      href={`${hrefBase}/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[#e7dfd0] bg-[#fbf8f2] transition-all duration-300 hover:-translate-y-1 hover:border-[#d9c6a9] hover:shadow-[0_18px_40px_-24px_rgba(60,45,25,.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b0674d]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#efe9dc]">
        <ProductImage url={product.primary_image_url} alt={product.name} className="transition-transform duration-[600ms] ease-out group-hover:scale-[1.04]" />
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {product.is_featured ? <StoreBadge tone="featured">Öne Çıkan</StoreBadge> : null}
          {product.is_new ? <StoreBadge tone="new">Yeni</StoreBadge> : null}
        </div>
        {soldOut ? <div className="absolute right-3 top-3"><StoreBadge tone="muted">Tükendi</StoreBadge></div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.15em] text-[#a67c53]">
            {product.category_name ?? STORE_PRODUCT_TYPE_LABELS[product.product_type]}
          </span>
          <StockDot product={product} />
        </div>
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-[#2a2620]">{product.name}</h3>
        {product.short_description ? (
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-[#8b8175]">{product.short_description}</p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 pt-2.5">
          <PriceTag price={product.price} compareAt={product.compare_at_price} currency={product.currency} />
          <span className="shrink-0 text-[12px] font-semibold text-[#96543d] transition-colors group-hover:text-[#7c4230]">Ürünü İncele →</span>
        </div>
      </div>
    </Link>
  );
}

/** Fotoğraflı kategori vitrin kartı (3:2). Storefront'ta filtreyi kurar (button). */
export function CategoryTile({ name, imageUrl, onClick }: { name: string; imageUrl: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block overflow-hidden rounded-2xl border border-[#e7dfd0] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b0674d]"
    >
      <div className="aspect-[3/2] w-full overflow-hidden bg-[#efe9dc]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover transition-transform duration-[700ms] ease-out group-hover:scale-[1.05]" />
      </div>
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(38,28,16,.5),transparent_55%)]" aria-hidden />
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">Koleksiyon</span>
          <span className="block font-serif text-[19px] font-semibold text-white drop-shadow-[0_2px_10px_rgba(30,20,10,.5)]">{name}</span>
        </span>
        <span className="shrink-0 rounded-full bg-white/90 px-3 py-1 text-[11.5px] font-semibold text-[#7c4230] transition-colors group-hover:bg-white">Keşfet →</span>
      </span>
    </button>
  );
}

/** Görseli olmayan kategori için dürüst tipografik yedek — yanlış foto atanmaz. */
function CategoryLeaf({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M24 40c0-9 5-16 14-18-2 10-7 15-14 18Z" strokeLinejoin="round" />
      <path d="M24 40c0-7-4-12-11-13 1.5 8 5 11 11 13Z" strokeLinejoin="round" />
      <path d="M24 40V22" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Kompakt kategori kartı — "Tüm Kategoriler" indeksinde tüm aktif kategorileri ölçeklenebilir
 * biçimde gösterir. Güvenilir foto varsa küçük thumbnail; yoksa dürüst tipografik yedek.
 */
export function CategoryChip({
  name,
  imageUrl,
  active = false,
  onClick,
}: {
  name: string;
  imageUrl: string | null;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b0674d] " +
        (active
          ? "border-[#d9c6a9] bg-[#f7ece7]"
          : "border-[#e7dfd0] bg-[#fbf8f2] hover:border-[#d9c6a9] hover:bg-[#f7f1e7]")
      }
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[linear-gradient(135deg,#efe9dc,#e6ddcb)]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <CategoryLeaf className="h-5 w-5 text-[#a8977c]" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold text-[#2a2620]">{name}</span>
        <span className="block text-[11px] font-medium text-[#a67c53] transition-colors group-hover:text-[#96543d]">
          Keşfet →
        </span>
      </span>
    </button>
  );
}

export function StoreFooter() {
  return (
    <footer className="mt-16 border-t border-[#e3dac9] pt-10 sm:mt-20">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="font-serif text-lg font-semibold tracking-tight text-[#2a2620]">Yaşam Sistemi Doğal Pazar</span>
        <span className="text-[13px] text-[#8b8175]">Doğal ve bütüncül yaşam ürünleri</span>
        <Link href="/" className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#96543d] transition-colors hover:text-[#7c4230]">
          {"Yaşam Sistemi'ne dön"} <span aria-hidden>→</span>
        </Link>
        <span className="mt-3 text-[11px] text-[#a99f90]">© Yaşam Sistemi</span>
      </div>
    </footer>
  );
}
