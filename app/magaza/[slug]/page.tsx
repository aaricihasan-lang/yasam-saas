import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getStorefrontData,
  getStorefrontProductBySlug,
  getStoreSettings,
} from "@/lib/store/storefront";
import { STORE_BRAND_NAME, STORE_BRAND_TAGLINE } from "@/lib/store/types";
import { buildWhatsappLink, buildWhatsappProductMessage } from "@/lib/store/whatsapp";
import ProductDetail from "./ProductDetail";

export const dynamic = "force-dynamic";

type PageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) return { title: `Ürün bulunamadı — ${STORE_BRAND_NAME}` };
  return {
    title: `${product.name} — ${STORE_BRAND_NAME}`,
    description: product.short_description || STORE_BRAND_TAGLINE,
  };
}

export default async function ProductPage({ params }: PageParams) {
  const { slug } = await params;
  const product = await getStorefrontProductBySlug(slug);
  if (!product) notFound();

  const [settings, { products, categories }] = await Promise.all([getStoreSettings(), getStorefrontData()]);
  const number = settings.whatsapp_enabled ? settings.whatsapp_number : null;

  const whatsappLink = buildWhatsappLink(
    number,
    buildWhatsappProductMessage({ name: product.name, sku: product.sku, price: product.price, currency: product.currency }),
  );
  const headerWhatsappHref = buildWhatsappLink(number, `Merhaba, ${STORE_BRAND_NAME} hakkında bilgi almak istiyorum.`);

  const related = products.filter((p) => p.slug !== product.slug).slice(0, 4);

  return (
    <ProductDetail
      product={product}
      whatsappLink={whatsappLink}
      categories={categories}
      headerWhatsappHref={headerWhatsappHref}
      related={related}
    />
  );
}
