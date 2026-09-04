"use client";

/**
 * /admin/magaza/onizleme — SAHİP ÖNİZLEMESİ.
 *
 * Public /magaza kilitliyken (private launch), mağaza sahibi gerçek storefront'un
 * AYNISINI burada önizler. Ayrı bir UI kopyası YOK: production MagazaStorefront
 * component'i owner-gate'li veriyle render edilir (hrefBase önizleme köküne yönelir).
 * Güvenlik: veri owner-only /api/admin/magaza/storefront ucundan gelir (401/403 → gizli).
 */
import { useEffect, useState } from "react";
import MagazaStorefront from "@/app/magaza/MagazaStorefront";
import { previewApi, type StorefrontPreview } from "../magazaAdminApi";
import { buildWhatsappLink } from "@/lib/store/whatsapp";
import { STORE_BRAND_NAME } from "@/lib/store/types";
import { HREF_BASE } from "./hrefBase";

function PreviewNotice({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-serif text-xl font-semibold text-stone-800">{title}</h1>
      {desc ? <p className="mt-2 text-sm text-stone-500">{desc}</p> : null}
    </div>
  );
}

function PreviewBanner() {
  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-3 border-b border-emerald-200 bg-emerald-50/95 px-4 py-2 text-[12px] text-emerald-900 backdrop-blur">
      <span className="font-bold uppercase tracking-wide">Sahip önizlemesi · yalnız siz görüyorsunuz</span>
      <span className="text-emerald-700">Public açılış kilitli</span>
      <a href="/admin/magaza" className="rounded-full bg-emerald-700 px-3 py-0.5 font-semibold text-white hover:bg-emerald-800">
        ← Yönetime dön
      </a>
    </div>
  );
}

export default function MagazaOnizlemePage() {
  const [state, setState] = useState<"loading" | "denied" | "error" | "ready">("loading");
  const [data, setData] = useState<StorefrontPreview | null>(null);

  useEffect(() => {
    let alive = true;
    void previewApi.storefront().then((r) => {
      if (!alive) return;
      if (r.ok) {
        setData(r.data);
        setState("ready");
      } else {
        setState(r.status === 401 || r.status === 403 ? "denied" : "error");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") return <PreviewNotice title="Önizleme yükleniyor…" />;
  if (state === "denied")
    return <PreviewNotice title="Erişim yok" desc="Bu önizlemeyi yalnızca mağaza sahibi görüntüleyebilir." />;
  if (state === "error" || !data) return <PreviewNotice title="Önizleme yüklenemedi." />;

  const whatsappHref = buildWhatsappLink(
    data.whatsapp_enabled ? data.whatsapp_number : null,
    `Merhaba, ${STORE_BRAND_NAME} hakkında bilgi almak istiyorum.`,
  );

  return (
    <>
      <PreviewBanner />
      <MagazaStorefront
        products={data.products}
        categories={data.categories}
        whatsappHref={whatsappHref}
        hrefBase={HREF_BASE}
      />
    </>
  );
}
