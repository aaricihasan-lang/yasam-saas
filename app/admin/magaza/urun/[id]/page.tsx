import ProductForm from "../../components/ProductForm";

type PageParams = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: PageParams) {
  const { id } = await params;
  return <ProductForm productId={id} />;
}
