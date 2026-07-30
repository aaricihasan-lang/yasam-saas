import { HdKayitEditor } from "./HdKayitEditor";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default async function Page({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  return (
    <>
      <BfcacheRefreshHandler />
      <HdKayitEditor recordId={recordId} />
    </>
  );
}
