import { KayitliProtokolDetayLayout } from "../components/KayitliProtokolDetayLayout";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function KayitliProtokolDetayPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <BfcacheRefreshHandler />
      <KayitliProtokolDetayLayout protocolId={decodeURIComponent(id)} />
    </>
  );
}
