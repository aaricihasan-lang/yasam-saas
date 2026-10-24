"use client";

/** G · Eğitim notları düzenleme — eğitmen yüzü (bileşen: _ui/EditView). */
import { useParams } from "next/navigation";
import { EditView } from "../../../_ui/EditView";

export default function TrainerEditPage() {
  const p = useParams<{ id: string }>();
  const id = String(p?.id ?? "");
  return <EditView side="trainer" id={id} backHref={`/human-design/egitim-merkezi/ozel/${id}`} />;
}
