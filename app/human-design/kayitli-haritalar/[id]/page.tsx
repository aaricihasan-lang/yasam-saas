import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { HdHaritaDetayContent } from "./HdHaritaDetayContent";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <BfcacheRefreshHandler />
      <HdHaritaDetayContent chartId={id} />
    </>
  );
}
