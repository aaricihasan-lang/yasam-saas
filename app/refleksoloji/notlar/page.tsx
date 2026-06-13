import { KlinikNotlarLayout } from "./components/KlinikNotlarLayout";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";

export default function RefleksolojiNotlarPage() {
  return (
    <>
      <BfcacheRefreshHandler />
      <KlinikNotlarLayout />
    </>
  );
}
