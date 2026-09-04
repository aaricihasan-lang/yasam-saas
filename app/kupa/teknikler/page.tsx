"use client";

import { KupaShell } from "../components/KupaShell";
import { TechniqueWorkspace } from "./components/TechniqueWorkspace";

/**
 * KUPA TEKNİKLERİ — reader-first çalışma alanı (FAZ 4 / 2B).
 *
 * Index route: liste-önce. <1024px yalnız liste; >=1024px liste + "teknik seçin"
 * boş sağ panel. Teknik seçimi /kupa/teknikler/[id] deep-link'idir. Eski generic
 * form-tabanlı düzenleme ekranı KALDIRILDI (reader-first workspace ile değiştirildi).
 */
export default function TekniklerPage() {
  return (
    <KupaShell
      title="Kupa Teknikleri"
      subtitle="Tekniklerinizi tek çalışma alanında okuyun, düzenleyin; güvenlik ve kaynaklarını bağlayın."
      breadcrumb={[{ label: "Kupa Teknikleri" }]}
    >
      <TechniqueWorkspace selectedId={null}>
        <div className="flex h-full min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
          <p className="text-[14px] text-slate-400">Okumak veya düzenlemek için soldan bir teknik seçin.</p>
        </div>
      </TechniqueWorkspace>
    </KupaShell>
  );
}
