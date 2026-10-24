"use client";

/** Owner · özel eğitim kaydı ayrıntısı (eğitmen F ekranıyla aynı görünüm; harita yalnız erişim açıkken). */
import { useParams } from "next/navigation";
import { PrivateDetailView } from "@/app/human-design/egitim-merkezi/_ui/DetailView";

export default function OwnerDetailPage() {
  const p = useParams<{ id: string }>();
  const id = String(p?.id ?? "");
  return <PrivateDetailView side="owner" id={id} listHref="/admin/hd-ozel-egitim" editHref={`/admin/hd-ozel-egitim/${id}/duzenle`} />;
}
