"use client";

/** Owner · özel eğitim kaydının eğitim alanlarını düzenleme (eğitmen G ekranıyla aynı bileşen). */
import { useParams } from "next/navigation";
import { EditView } from "@/app/human-design/egitim-merkezi/_ui/EditView";

export default function OwnerEditPage() {
  const p = useParams<{ id: string }>();
  const id = String(p?.id ?? "");
  return <EditView side="owner" id={id} backHref={`/admin/hd-ozel-egitim/${id}`} />;
}
