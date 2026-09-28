"use client";

import { useParams } from "next/navigation";
import { AnamnezEditor } from "@/components/danisan/anamnez/AnamnezEditor";

/**
 * Danışan Yolculuğu › Danışan Detayı › Anamnez editörü (odaklı tam sayfa).
 * Rota /dashboard/clients altında → ModuleRouteGuard ("clients") mevcut kuralla korunur;
 * gerçek yetki sunucuda requireModuleAccess + tenant/danışan/anamnez sahipliğidir.
 */
export default function AnamnezEditorPage() {
  const params = useParams<{ id: string; anamnesisId: string }>();
  return <AnamnezEditor key={params.anamnesisId} clientId={params.id} anamnesisId={params.anamnesisId} />;
}
