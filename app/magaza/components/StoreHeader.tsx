"use client";

import Link from "next/link";

type Category = { slug: string; name: string };

/** Storefront'ta filtreyi süren kontrollü durum; PDP'de verilmez (link davranışı). */
type Controlled = {
  query: string;
  setQuery: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
};

function WaGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden>
      <path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3Zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-4.9 1 .9-4.8-.2-.4A9.7 9.7 0 0 1 6.3 15c0-5.4 4.4-9.8 9.8-9.8s9.8 4.4 9.8 9.8-4.5 9.8-9.9 9.8Z" />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" strokeLinecap="round" />
    </svg>
  );
}

export default function StoreHeader({
  categories,
  whatsappHref,
  controlled,
  hrefBase = "/magaza",
}: {
  categories: Category[];
  whatsappHref: string | null;
  controlled?: Controlled;
  hrefBase?: string;
}) {
  const cat = (c: Category, extra = "") => {
    const active = controlled?.category === c.slug;
    // max-w + truncate: aşırı uzun kategori adı bile header'ı taşırmaz (WhatsApp/arama korunur).
    const cls =
      "inline-block max-w-[11rem] truncate rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors " +
      (active ? "bg-[#b0674d] text-white" : "text-[#4a443b] hover:text-[#96543d]") + " " + extra;
    if (controlled) {
      return (
        <button key={c.slug} type="button" title={c.name} onClick={() => controlled.setCategory(c.slug)} className={cls}>
          {c.name}
        </button>
      );
    }
    return (
      <Link key={c.slug} href={hrefBase} title={c.name} className={cls}>
        {c.name}
      </Link>
    );
  };

  // "Tüm Kategoriler" → filtreyi temizle + ana sayfadaki kategori indeksine yumuşak kaydır.
  // Filtre aktifken kategori bölümü gizli olduğundan, temizlemeden sonra mount'u bekleyip kaydır.
  const goToCategories = () => {
    controlled?.setQuery("");
    controlled?.setCategory("all");
    if (typeof document === "undefined") return;
    const scroll = () => document.getElementById("kategoriler")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (document.getElementById("kategoriler")) scroll();
    else requestAnimationFrame(() => requestAnimationFrame(scroll));
  };

  return (
    <header className="sticky top-0 z-30">
      {/* util strip */}
      <div className="bg-[#2f2a24] py-1.5 text-center text-[11.5px] tracking-[0.02em] text-[#efe7d8]">
        Doğal ve bütüncül yaşam ürünleri · Sorularınız için WhatsApp’tan yazın
      </div>

      <div className="border-b border-[#e7dfd0] bg-[#fbf8f2]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-5 px-4 py-3.5 sm:px-6 lg:px-8">
          {/* brand — daralmaz (shrink-0): kategori sayısı artsa da sabit ve rahat kalır */}
          <Link href={hrefBase} className="flex shrink-0 flex-col leading-none">
            <span className="whitespace-nowrap font-serif text-[19px] font-semibold tracking-tight text-[#2a2620]">Yaşam Sistemi</span>
            <span className="mt-1 whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.28em] text-[#a67c53]">Doğal Pazar</span>
          </Link>

          {/* desktop category nav — SABİT sayıda (Tümü + sınırlı kategori + Tüm Kategoriler).
              Kategori sayısı ne olursa olsun header genişlemez; gerisi ana sayfa indeksinden. */}
          <nav className="hidden min-w-0 items-center gap-1 lg:flex">
            {controlled ? (
              <button
                type="button"
                onClick={() => controlled.setCategory("all")}
                className={
                  "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors " +
                  (controlled.category === "all" ? "bg-[#b0674d] text-white" : "text-[#4a443b] hover:text-[#96543d]")
                }
              >
                Tümü
              </button>
            ) : null}
            {categories.slice(0, 4).map((c, i) =>
              cat(c, i < 3 ? "" : "hidden xl:inline-block"),
            )}
            {categories.length > 0 ? (
              controlled ? (
                <button type="button" onClick={goToCategories} className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#96543d] transition-colors hover:text-[#7c4230]">
                  Tüm Kategoriler
                </button>
              ) : (
                <Link href={`${hrefBase}#kategoriler`} className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#96543d] transition-colors hover:text-[#7c4230]">
                  Tüm Kategoriler
                </Link>
              )
            ) : null}
          </nav>

          {/* right tools — daralmaz (shrink-0): arama + WhatsApp her zaman korunur */}
          <div className="flex shrink-0 items-center gap-2.5">
            {controlled ? (
              <label className="hidden items-center gap-2 rounded-full border border-[#e2d8c6] bg-white px-3.5 py-2 text-[#8b8175] sm:flex">
                <SearchIcon className="h-3.5 w-3.5" />
                <input
                  type="search"
                  value={controlled.query}
                  onChange={(e) => controlled.setQuery(e.target.value)}
                  placeholder="Ürün ara…"
                  aria-label="Ürün ara"
                  className="w-28 bg-transparent text-[13px] text-[#2a2620] outline-none placeholder:text-[#a99f90] lg:w-40"
                />
              </label>
            ) : (
              <Link href={hrefBase} aria-label="Ürün ara" className="hidden items-center gap-2 rounded-full border border-[#e2d8c6] bg-white px-3.5 py-2 text-[13px] text-[#8b8175] sm:flex">
                <SearchIcon className="h-3.5 w-3.5" /> Ara
              </Link>
            )}

            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#1fa855] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#178a45]"
              >
                <WaGlyph className="h-4 w-4" /> <span className="hidden sm:inline">WhatsApp</span>
              </a>
            ) : null}
          </div>
        </div>

        {/* mobile: search + category chips */}
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-2.5 px-4 pb-3 lg:hidden">
          {controlled ? (
            <label className="flex items-center gap-2 rounded-full border border-[#e2d8c6] bg-white px-3.5 py-2 text-[#8b8175] sm:hidden">
              <SearchIcon className="h-3.5 w-3.5" />
              <input
                type="search"
                value={controlled.query}
                onChange={(e) => controlled.setQuery(e.target.value)}
                placeholder="Ürün ara…"
                aria-label="Ürün ara"
                className="w-full bg-transparent text-[13px] text-[#2a2620] outline-none placeholder:text-[#a99f90]"
              />
            </label>
          ) : null}
          {categories.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {controlled ? (
                <button
                  type="button"
                  onClick={() => controlled.setCategory("all")}
                  className={
                    "whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-medium " +
                    (controlled.category === "all" ? "border-[#b0674d] bg-[#b0674d] text-white" : "border-[#e2d8c6] bg-white text-[#4a443b]")
                  }
                >
                  Tümü
                </button>
              ) : null}
              {categories.map((c) =>
                controlled ? (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => controlled.setCategory(c.slug)}
                    className={
                      "whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-medium " +
                      (controlled.category === c.slug ? "border-[#b0674d] bg-[#b0674d] text-white" : "border-[#e2d8c6] bg-white text-[#4a443b]")
                    }
                  >
                    {c.name}
                  </button>
                ) : (
                  <Link key={c.slug} href={hrefBase} className="whitespace-nowrap rounded-full border border-[#e2d8c6] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#4a443b]">
                    {c.name}
                  </Link>
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
