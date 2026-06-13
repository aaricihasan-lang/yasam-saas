import { KayitliProtokollerLayout } from "./components/KayitliProtokollerLayout";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function KayitliProtokollerPage() {
  return (
    <>
      <BfcacheRefreshHandler />
      <KayitliProtokollerLayout />
    </>
  );
}
