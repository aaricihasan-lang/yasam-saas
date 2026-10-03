import { redirect } from "next/navigation";
import { LEGACY_DEMO_CLIENT_REDIRECT } from "@/lib/demo/demoVitrinFixture";

/**
 * DEMO-01 — ESKİ paralel demo danışan sayfası KALDIRILDI.
 *
 * Demo vitrin hesabı artık GERÇEK danışan detay sayfasını (/dashboard/clients/[id]) kullanır;
 * sabit sekmeli, elle güncellenen ayrı demo sayfası vitrinin kaynağı değildir. Bu route yalnız
 * eski yer imleri/bağlantılar için geriye uyumlu yönlendirmedir: eski fixture id'si (demo-0..2)
 * demo tenant'ına yüklenen sentetik karşılığına, diğer her şey danışan listesine gider.
 * (Hedef sayfa kendi oturum + modül + tenant korumalarını uygular; yönlendirme yetki VERMEZ.)
 */
export default async function LegacyDemoClientRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const target = Object.prototype.hasOwnProperty.call(LEGACY_DEMO_CLIENT_REDIRECT, id)
    ? LEGACY_DEMO_CLIENT_REDIRECT[id]
    : null;
  redirect(target ? `/dashboard/clients/${target}` : "/danisan-yolculugu/liste");
}
