import { Suspense } from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { RefleksolojiHubLoading } from "../components/RefleksolojiSkeleton";
import { DanisanHaritasiLayout } from "./components/DanisanHaritasiLayout";

export default function RefleksolojiDanisanHaritasiPage() {
  return (
    <>
      <BfcacheRefreshHandler />
      <Suspense fallback={<RefleksolojiHubLoading />}>
        <DanisanHaritasiLayout />
      </Suspense>
    </>
  );
}
