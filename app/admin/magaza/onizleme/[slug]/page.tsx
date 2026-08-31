"use client";

/**
 * /admin/magaza/onizleme/[slug] — SAHİP ÜRÜN DETAYI ÖNİZLEMESİ.
 * Production ProductDetail component'i owner-gate'li veriyle render edilir.
 */
import { use, useEffect, useState } from "react";
import ProductDetail from "@/app/magaza/[slug]/ProductDetail";
import { previewApi, type StorefrontDetailPreview } from "../../magazaAdminApi";
import { buildWhatsappLink, buildWhatsappProductMessage } from "@/lib/store/whatsapp";
import { STORE_BRAND_NAME } from "@/lib/store/types";
import { HREF_BASE } from "../hrefBase";

function Notice({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-serif text-xl font-semibold text-stone-800">{title}</h1>
      {desc ? <p className="mt-2 text-sm text-stone-500">{desc}</p> : null}
      <a href={HREF_BASE} className="mt-4 rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800">
        ← Önizlemeye dön
      </a>
    </div>
  );
}

export default function MagazaOnizlemeDetayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [state, setState] = useState<"loading" | "denied" | "notfound" | "error" | "ready">("loading");
  const [data, setData] = useState<StorefrontDetailPreview | null>(null);

  useEffect(() => {
    let alive = true;
    void previewApi.product(slug).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setData(r.data);
        setState("ready");
      } else if (r.status === 401 || r.status === 403) setState("denied");
      else if (r.status === 404) setState("notfound");
      else setState("error");
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (state === "loading") return <Notice title="Ürün önizlemesi yükleniyor…" />;
  if (state === "denied") return <Notice title="Erişim yok" desc="Bu önizlemeyi yalnızca mağaza sahibi görüntüleyebilir." />;
  if (state === "notfound") return <Notice title="Ürün bulunamadı" desc="Bu ürün yayında (aktif) değil ya da mevcut değil." />;
  if (state === "error" || !data) return <Notice title="Önizleme yüklenemedi." />;

  const number = data.whatsapp_enabled ? data.whatsapp_number : null;
  const whatsappLink = buildWhatsappLink(
    number,
    buildWhatsappProductMessage({
      name: data.product.name,
      sku: data.product.sku,
      price: data.product.price,
      currency: data.product.currency,
    }),
  );
  const headerWhatsappHref = buildWhatsappLink(number, `Merhaba, ${STORE_BRAND_NAME} hakkında bilgi almak istiyorum.`);

  return (
    <ProductDetail
      product={data.product}
      whatsappLink={whatsappLink}
      categories={data.categories}
      headerWhatsappHref={headerWhatsappHref}
      related={data.related}
      hrefBase={HREF_BASE}
    />
  );
}
