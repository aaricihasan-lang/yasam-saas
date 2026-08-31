import type { Metadata } from "next";
import ProductForm from "../../components/ProductForm";

export const metadata: Metadata = { title: "Yeni Ürün — Doğal Pazar" };

export default function NewProductPage() {
  return <ProductForm productId={null} />;
}
