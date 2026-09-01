import { KupaShell } from "../../components/KupaShell";
import { TechniqueWorkspace } from "../components/TechniqueWorkspace";
import { TechniqueReadView } from "../components/TechniqueReadView";

/**
 * KUPA TEKNİĞİ DETAY — /kupa/teknikler/[id]
 *
 * <1024px: tam-genişlik reader (liste gizli; tarayıcı ileri/geri ile dönülür).
 * >=1024px: sol liste (bu teknik seçili) + sağ reader (split workspace).
 * Next.js: params bir Promise'tir; await edilip client bileşenlere geçilir.
 * Bilinmeyen/başka tenant'a ait id → reader dostça "bulunamadı" gösterir (sızıntı yok).
 */
type PageProps = { params: Promise<{ id: string }> };

export default async function TechniqueDetailPage({ params }: PageProps) {
  const { id } = await params;
  const techniqueId = decodeURIComponent(id);
  return (
    <KupaShell
      title="Kupa Teknikleri"
      breadcrumb={[
        { label: "Kupa Teknikleri", href: "/kupa/teknikler" },
        { label: "Teknik" },
      ]}
    >
      <TechniqueWorkspace selectedId={techniqueId}>
        <TechniqueReadView key={techniqueId} id={techniqueId} />
      </TechniqueWorkspace>
    </KupaShell>
  );
}
