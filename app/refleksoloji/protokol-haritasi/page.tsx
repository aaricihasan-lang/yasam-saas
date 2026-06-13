import { ProtokolHaritasiLayout } from "./components/ProtokolHaritasiLayout";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function ProtokolHaritasiPage() {
  return (
    <>
      <BfcacheRefreshHandler />
      <ProtokolHaritasiLayout />
    </>
  );
}
