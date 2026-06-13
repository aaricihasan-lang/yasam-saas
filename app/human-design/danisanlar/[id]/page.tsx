import { HdDanisanDetayContent } from "./HdDanisanDetayContent";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <BfcacheRefreshHandler />
      <HdDanisanDetayContent clientId={id} />
    </>
  );
}
