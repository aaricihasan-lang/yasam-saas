import { Suspense } from "react";
import { HdRelationsContent } from "./components/HdRelationsContent";

export default function HdRelationsPage() {
  return (
    <Suspense fallback={null}>
      <HdRelationsContent />
    </Suspense>
  );
}
