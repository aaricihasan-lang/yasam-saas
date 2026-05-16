import { NotDetayLayout } from "../components/NotDetayLayout";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function NotDetayPage({ params }: PageProps) {
  const { id } = await params;
  return <NotDetayLayout noteId={decodeURIComponent(id)} />;
}
