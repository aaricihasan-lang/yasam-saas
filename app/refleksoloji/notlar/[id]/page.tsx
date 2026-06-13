import { NotDetayLayout } from "../components/NotDetayLayout";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function NotDetayPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <BfcacheRefreshHandler />
      <NotDetayLayout noteId={decodeURIComponent(id)} />
    </>
  );
}
