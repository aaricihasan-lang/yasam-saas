"use client";

import { useMemo, useState } from "react";
import { STORE_BRAND_TAGLINE, type StorefrontProductCard } from "@/lib/store/types";
import { STORE_HERO_IMAGE, categoryImageFor, categoryImageForStrict } from "@/lib/store/categoryVisuals";
import StoreHeader from "@/app/magaza/components/StoreHeader";
import { ProductCard, CategoryTile, CategoryChip, StoreFooter } from "@/app/magaza/components/storefrontUi";

type Category = { slug: string; name: string };

export default function MagazaStorefront({
  products,
  categories,
  whatsappHref,
}: {
  products: StorefrontProductCard[];
  categories: Category[];
  whatsappHref: string | null;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const q = query.trim().toLocaleLowerCase("tr");
  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (category !== "all" && p.category_slug !== category) return false;
        if (!q) return true;
        return `${p.name} ${p.short_description} ${p.category_name ?? ""}`.toLocaleLowerCase("tr").includes(q);
      }),
    [products, category, q],
  );

  const featured = useMemo(() => products.filter((p) => p.is_featured), [products]);
  const hasFilter = category !== "all" || q.length > 0;
  const total = products.length;
  const catalogEmpty = total === 0;

  function selectCategory(slug: string) {
    setCategory(slug);
    if (typeof document !== "undefined") {
      document.getElementById("urunler")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f0e6] text-[#2a2620] antialiased">
      <StoreHeader categories={categories} whatsappHref={whatsappHref} controlled={{ query, setQuery, category, setCategory }} />

      {/* HERO — Image A */}
      <section className="mx-auto w-full max-w-[1280px] px-4 pt-5 sm:px-6 lg:px-8">
        <div className="relative h-[320px] w-full overflow-hidden rounded-2xl sm:h-[400px] lg:h-[440px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={STORE_HERO_IMAGE} alt="Yaşam Sistemi Doğal Pazar" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(40,30,18,.28)_0%,transparent_34%,rgba(247,242,233,.55)_72%,rgba(247,242,233,.9)_100%)]" aria-hidden />
          <div className="absolute inset-0 flex items-center justify-end">
            <div className="mr-5 max-w-[360px] text-right sm:mr-10 lg:mr-14">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8a5a2b]">Doğal Pazar</span>
              <h1 className="mt-3 font-serif text-[28px] font-semibold leading-[1.12] tracking-tight text-[#2a2620] sm:text-[36px]">
                Doğanın sakin gücü, özenle seçildi
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-[#5f574c]">
                Doğal taşlar, uçucu yağlar ve bütüncül yaşam ürünleri.
              </p>
              <a href="#urunler" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#b0674d] px-6 py-3 text-[13.5px] font-semibold text-white shadow-sm transition-colors hover:bg-[#96543d]">
                Ürünleri Keşfet <span aria-hidden>→</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-4 sm:px-6 lg:px-8">
        {/* değerler — sahte vaat yok; ürün olmasa da mağaza premium kalır */}
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ["Özgün & Doğal", "Bütüncül yaşam ekosistemine uygun ürünler."],
            ["WhatsApp İletişim", "Ürün ve teslimat için birebir yanıt."],
            ["Özenle Seçildi", "Az ama nitelikli, güvenilir seçki."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-[#e7dfd0] bg-[#fbf8f2] px-4 py-3.5">
              <div className="text-[13px] font-semibold text-[#2a2620]">{t}</div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-[#8b8175]">{d}</div>
            </div>
          ))}
        </div>

        {/* Kategori vitrini — dinamik: aktif kategoriler değiştikçe otomatik güncellenir */}
        {!hasFilter && categories.length > 0 ? (
          <section id="kategoriler" className="mt-11 scroll-mt-28">
            <SectionHead title="Kategoriler" />
            {/* Öne çıkan 3 büyük fotoğraflı tile (beğenilen tasarım — korunur) */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {categories.slice(0, 3).map((c, i) => (
                <CategoryTile key={c.slug} name={c.name} imageUrl={categoryImageFor(c.slug, i)} onClick={() => selectCategory(c.slug)} />
              ))}
            </div>

            {/* Tüm Kategoriler — 3'ten fazla varsa tam, ölçeklenebilir indeks (10+ kategori güvenli) */}
            {categories.length > 3 ? (
              <div className="mt-9">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#a67c53]">Tüm Kategoriler</span>
                  <span className="h-px flex-1 bg-[linear-gradient(90deg,#e3dac9,transparent)]" aria-hidden />
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {categories.map((c) => (
                    <CategoryChip
                      key={c.slug}
                      name={c.name}
                      imageUrl={categoryImageForStrict(c.slug)}
                      active={category === c.slug}
                      onClick={() => selectCategory(c.slug)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Ürünler — 0 ürün olduğunda boş grid yerine zarif empty-state */}
        <section id="urunler" className="mt-12 scroll-mt-28">
          {catalogEmpty ? (
            <CatalogEmpty />
          ) : hasFilter ? (
            filtered.length > 0 ? (
              <>
                <SectionHead title="Sonuçlar" subtitle={`${filtered.length} ürün`} />
                <ProductGrid products={filtered} />
              </>
            ) : (
              <NoResults onClear={() => { setQuery(""); setCategory("all"); }} />
            )
          ) : total >= 6 && featured.length > 0 ? (
            <div className="space-y-12">
              <div>
                <SectionHead title="Öne Çıkan Ürünler" subtitle="Seçkimizden öne çıkanlar" />
                <ProductGrid products={featured} />
              </div>
              <div>
                <SectionHead title="Tüm Ürünler" subtitle={`${total} ürün`} />
                <ProductGrid products={products} />
              </div>
            </div>
          ) : (
            <>
              <SectionHead title="Ürünler" subtitle={`${total} ürün`} />
              <ProductGrid products={products} />
            </>
          )}
        </section>

        <StoreFooter />
      </main>
    </div>
  );
}

function ProductGrid({ products }: { products: StorefrontProductCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-serif text-[22px] font-semibold tracking-tight text-[#2a2620] sm:text-[25px]">{title}</h2>
        {subtitle ? <p className="mt-1 text-[12.5px] text-[#8b8175]">{subtitle}</p> : null}
      </div>
      <span className="mb-1.5 h-px flex-1 bg-[linear-gradient(90deg,#e3dac9,transparent)]" aria-hidden />
    </div>
  );
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-[#d9cfbc] bg-[#fbf8f2]/70 px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-[#2a2620]">Aradığınız kritere uygun ürün bulunamadı.</p>
      <p className="mt-1 text-[13px] text-[#8b8175]">Farklı bir arama ya da kategori deneyebilirsiniz.</p>
      <button type="button" onClick={onClear} className="mt-5 rounded-full border border-[#e2c6b8] bg-[#f7ece7] px-5 py-2 text-[13px] font-semibold text-[#96543d] transition-colors hover:bg-[#b0674d] hover:text-white">
        Filtreleri Temizle
      </button>
    </div>
  );
}

function CatalogEmpty() {
  return (
    <div className="mx-auto mt-14 max-w-lg rounded-2xl border border-[#e7dfd0] bg-[#fbf8f2] px-8 py-16 text-center">
      <h2 className="font-serif text-xl font-semibold text-[#2a2620]">Vitrin hazırlanıyor</h2>
      <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-[#8b8175]">
        Doğal ve bütüncül yaşam ürünlerimiz çok yakında burada olacak. {STORE_BRAND_TAGLINE}.
      </p>
    </div>
  );
}
