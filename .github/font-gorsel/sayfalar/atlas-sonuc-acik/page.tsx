"use client";
// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). Gerçek ResultDesk — AYDINLIK (light) masa (Natal sonucu bu masayı
// kullanır); sentetik başlık / sekme / sonuç metni (gerçek danışan yok, hesaplama / istek yok).
import { useState } from "react";
import ResultDesk, { DeskChip, deskGhostLight, type DeskTab } from "@/app/admin/astroloji/_components/atlas/ResultDesk";
import { atlasDisplay, atlasText } from "@/app/admin/astroloji/_components/atlas/fonts";

const TABS: DeskTab[] = [
  { id: "durum", label: "Gezegen Konumları", tone: "lavender", badge: 12 },
  { id: "ev", label: "Evler ve Açılar", tone: "blue" },
  { id: "yorum", label: "Yorum Özeti", tone: "gold", ownHeading: true },
  { id: "not", label: "Kendi Yorumum", tone: "turquoise", ownHeading: true },
];

export default function Page() {
  const [tab, setTab] = useState("durum");
  return (
    <main className={`${atlasDisplay.variable} ${atlasText.variable} min-h-screen w-full overflow-x-hidden`}>
      <ResultDesk
        variant="light"
        backLabel="Teknik seçimine dön"
        onBack={() => {}}
        eyebrow="ANALİZ SONUCU"
        title="Örnek Danışan — Natal"
        subtitle={
          <>
            <strong className="font-semibold">Natal Harita</strong> · Placidus
          </>
        }
        params="Placidus · Gerçek düğüm"
        kunye={[
          { label: "Saat dilimi", value: "Europe/Istanbul (UTC+02:00)" },
          { label: "Doğum profili", value: "rev 2 · güncel" },
          { label: "Saat doğruluğu", value: "dakika" },
        ]}
        meta={["Tropikal zodyak", "Gerçek Ay düğümü"]}
        chips={<DeskChip tone="muted">Otomatik yorum yok · yalnız teknik sonuçlar</DeskChip>}
        actions={
          <button type="button" className={deskGhostLight}>
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
