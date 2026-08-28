"use client";

import { useState } from "react";
import Link from "next/link";
import {
  STORE_PRODUCT_TYPE_LABELS,
  type StorefrontProductCard,
  type StorefrontProductDetail,
} from "@/lib/store/types";
import StoreHeader from "@/app/magaza/components/StoreHeader";
import { PriceTag, StoreBadge, ProductImageFallback, StoreFooter, ProductCard } from "@/app/magaza/components/storefrontUi";

type Category = { slug: string; name: string };

function WaGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden>
      <path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3Zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-4.9 1 .9-4.8-.2-.4A9.7 9.7 0 0 1 6.3 15c0-5.4 4.4-9.8 9.8-9.8s9.8 4.4 9.8 9.8-4.5 9.8-9.9 9.8Zm5.4-7.3c-.3-.1-1.8-.9-2-1s-.5-.1-.7.2-.8 1-.9 1.1-.3.2-.6.1a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.6-2c-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5s0-.4 0-.5-.7-1.7-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.3Z" />
    </svg>
  );
}

export default function ProductDetail({
  product,
  whatsappLink,
  categories,
  headerWhatsappHref,
  related = [],
}: {
  product: StorefrontProductDetail;
  whatsappLink: string | null;
  categories: Category[];
  headerWhatsappHref: string | null;
  related?: StorefrontProductCard[];
}) {
  const [active, setActive] = useState(0);
  const images = product.images;
  const activeImage = images[active] ?? images[0] ?? null;
  const showStock = product.track_inventory;

  return (
    <div className="min-h-screen bg-[#f5f0e6] text-[#2a2620] antialiased">
      <StoreHeader categories={categories} whatsappHref={headerWhatsappHref} />

      <main className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        <Link href="/magaza" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#8b8175] transition-colors hover:text-[#96543d]">
          <span aria-hidden>←</span> Mağazaya dön
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[55%_45%] lg:gap-12">
          {/* Galeri */}
          <div>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-[#e7dfd0] bg-[#efe9dc]">
              {activeImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeImage.url} alt={activeImage.alt_text || product.name} className="h-full w-full object-cover" />
              ) : (
                <ProductImageFallback className="h-full w-full" />
              )}
              <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5">
                {product.is_featured ? <StoreBadge tone="featured">Öne Çıkan</StoreBadge> : null}
                {product.is_new ? <StoreBadge tone="new">Yeni</StoreBadge> : null}
              </div>
            </div>
            {images.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {images.map((img, i) => (
                  <button
                    key={img.url + i}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Görsel ${i + 1}`}
                    className={"h-[76px] w-[76px] overflow-hidden rounded-xl border-2 bg-[#efe9dc] transition-all " + (i === active ? "border-[#b0674d]" : "border-[#e7dfd0] hover:border-[#d9c6a9]")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Bilgi */}
          <div className="flex flex-col lg:py-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#a67c53]">{product.category_name ?? "Doğal Pazar"}</span>
              <span className="rounded-full border border-[#e7dfd0] bg-[#fbf8f2] px-2.5 py-0.5 text-[11px] tracking-[0.04em] text-[#6a5f52]">{STORE_PRODUCT_TYPE_LABELS[product.product_type]}</span>
            </div>

            <h1 className="mt-3.5 font-serif text-[30px] font-semibold leading-[1.14] tracking-tight text-[#2a2620] sm:text-[36px]">{product.name}</h1>

            <div className="mt-5"><PriceTag price={product.price} compareAt={product.compare_at_price} currency={product.currency} size="lg" /></div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-[13.5px]">
              {showStock ? (
                product.in_stock ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#6e7c6a]"><span className="h-2 w-2 rounded-full bg-[#6e7c6a]" aria-hidden /> Stokta</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#a99f90]"><span className="h-2 w-2 rounded-full bg-[#cbbfa8]" aria-hidden /> Tükendi</span>
                )
              ) : null}
              {product.sku ? <span className="text-[#a99f90]">Ürün Kodu: {product.sku}</span> : null}
            </div>

            {product.short_description ? <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-[#5f574c]">{product.short_description}</p> : null}

            {/* WhatsApp conversion panel — birincil CTA */}
            {whatsappLink ? (
              <div className="mt-8 rounded-2xl border border-[#e6cabf] bg-[linear-gradient(180deg,#f7ece7,#fbf8f2)] p-6">
                <h2 className="font-serif text-[16px] font-semibold text-[#7a4636]">Ürün hakkında bilgi alın</h2>
                <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#6a5f52]">Ürün, kullanım ve teslimat bilgileri için bizimle WhatsApp üzerinden iletişime geçebilirsiniz.</p>
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#1fa855] px-8 py-4 text-[16px] font-bold text-white shadow-[0_16px_36px_-16px_rgba(31,168,85,.9)] transition-all hover:-translate-y-0.5 hover:bg-[#178a45] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1fa855] sm:w-auto"
                >
                  <WaGlyph className="h-6 w-6" />
                  {"WhatsApp'tan Bilgi Al"}
                </a>
              </div>
            ) : null}

            {product.description ? (
              <section className="mt-10 border-t border-[#e3dac9] pt-7">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#8b8175]">Ürün Hakkında</h2>
                <div className="mt-4 max-w-2xl whitespace-pre-wrap text-[15px] leading-[1.75] text-[#4a443b]">{product.description}</div>
              </section>
            ) : null}
          </div>
        </div>

        {related.length > 0 ? (
          <section className="mt-16">
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 className="font-serif text-[22px] font-semibold tracking-tight text-[#2a2620]">Benzer Ürünler</h2>
              <span className="mb-1.5 h-px flex-1 bg-[linear-gradient(90deg,#e3dac9,transparent)]" aria-hidden />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {related.slice(0, 4).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ) : null}

        <StoreFooter />
      </main>
    </div>
  );
}
