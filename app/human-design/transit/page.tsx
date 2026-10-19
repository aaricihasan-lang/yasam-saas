import { Suspense } from "react";
import { HdTransitContent } from "./components/HdTransitContent";

export default function HdTransitPage() {
  return (
    <Suspense fallback={null}>
      <HdTransitContent />
    </Suspense>
  );
}
