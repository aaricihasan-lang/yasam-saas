import { KayitliProtokolDetayLayout } from "../components/KayitliProtokolDetayLayout";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function KayitliProtokolDetayPage({ params }: PageProps) {
  const { id } = await params;
  return <KayitliProtokolDetayLayout protocolId={decodeURIComponent(id)} />;
}
