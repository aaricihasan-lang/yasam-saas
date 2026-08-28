import type { Metadata } from "next";
import { getStorefrontData, getStoreSettings } from "@/lib/store/storefront";
import { STORE_BRAND_NAME, STORE_BRAND_TAGLINE } from "@/lib/store/types";
import { buildWhatsappLink } from "@/lib/store/whatsapp";
import MagazaStorefront from "./MagazaStorefront";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: STORE_BRAND_NAME,
  description: `${STORE_BRAND_TAGLINE}. Doğal taşlar, uçucu yağlar ve bütüncül yaşam ürünleri.`,
};

export default async function MagazaPage() {
  const [{ products, categories }, settings] = await Promise.all([getStorefrontData(), getStoreSettings()]);
  const headerWhatsappHref = buildWhatsappLink(
    settings.whatsapp_enabled ? settings.whatsapp_number : null,
    `Merhaba, ${STORE_BRAND_NAME} hakkında bilgi almak istiyorum.`,
  );
  return <MagazaStorefront products={products} categories={categories} whatsappHref={headerWhatsappHref} />;
}
