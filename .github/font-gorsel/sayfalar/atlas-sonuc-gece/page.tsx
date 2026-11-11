"use client";
// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). Gerçek ResultDesk — KOYU (night) masa; sentetik başlık / sekme / sonuç
// metni (gerçek danışan yok, hesaplama / istek yok). Harita yerine teknik sonuç paneli (stage) çizilir.
import { useState } from "react";
import ResultDesk, { DeskChip, deskGhost, type DeskTab } from "@/app/admin/astroloji/_components/atlas/ResultDesk";
import { atlasDisplay, atlasText } from "@/app/admin/astroloji/_components/atlas/fonts";

const TABS: DeskTab[] = [
  { id: "durum", label: "Gezegen Konumları", tone: "lavender", badge: 12 },
  { id: "ev", label: "Evler ve Açılar", tone: "blue" },
  { id: "yorum", label: "Yorum Özeti", tone: "gold", ownHeading: true },
  { id: "not", label: "Kendi Yorumum", tone: "turquoise", ownHeading: true },
];
const VARYANT: "night" | "light" = "night";

export default function Page() {
  const [tab, setTab] = useState("durum");
  return (
    <main className={`${atlasDisplay.variable} ${atlasText.variable} min-h-screen w-full overflow-x-hidden`}>
      <ResultDesk
        variant={VARYANT}
        backLabel="Teknik seçimine dön"
        onBack={() => {}}
        eyebrow="ANALİZ SONUCU"
        title="Örnek Danışan — Güneş Dönüşü"
        subtitle={
          <>
            <strong className="font-semibold">Güneş Dönüşü (Solar Return)</strong> · 2026 · Placidus
          </>
        }
        meta={["Tropikal zodyak", "Gerçek Ay düğümü", "Saat doğruluğu: dakika"]}
        chips={<DeskChip tone="muted">Otomatik yorum yok · yalnız teknik sonuçlar</DeskChip>}
        actions={
          <button type="button" className={deskGhost}>
            Tümünü Kaydet
          </button>
        }
        tabs={TABS}
        active={tab}
        onTab={setTab}
        stage={
          <div className="p-6">
            <p className="text-2xl font-light [font-family:var(--font-atlas-display)]">Şükran · Ğ İ Ş Ç Ö Ü — ığşçöü</p>
            <p className="mt-3 text-sm">Güneş 18° Akrep · 3. ev · Ay 07° İkizler · 10. ev · Yükselen 24° Oğlak</p>
          </div>
        }
        panelTitle="Gezegen Konumları"
      >
        <div className="space-y-2 p-4 text-sm">
          <p>Merkür 02° Yay — 4. ev · retro değil</p>
          <p>Venüs 29° Terazi — 3. ev · kendi burcunda</p>
          <p>Satürn 21° Balık — 6. ev · üçgen (Güneş)</p>
        </div>
      </ResultDesk>
    </main>
  );
}
