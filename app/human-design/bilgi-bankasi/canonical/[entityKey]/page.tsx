import { CanonicalEntityView } from "./CanonicalEntityView";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

/**
 * Canonical kimlik detay route'u. Legacy detay (`../[recordId]`) ile ÇAKIŞMAZ:
 * `canonical` statik segment, `[recordId]` dinamik segmentten önce çözülür.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ entityKey: string }>;
}) {
  const { entityKey } = await params;
  return (
    <>
      <BfcacheRefreshHandler />
      <CanonicalEntityView entityKey={decodeURIComponent(entityKey)} />
    </>
  );
}
