import { KayitliAtlasLayout } from "./components/KayitliAtlasLayout";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function KayitliAtlasPage() {
  return (
    <>
      <BfcacheRefreshHandler />
      <KayitliAtlasLayout />
    </>
  );
}
