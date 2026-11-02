"use client";

/**
 * Gökyüzü Atlası — GÖKYÜZÜ ARAÇLARI sayfası (owner GÖRSEL PASS 02.11.2026). Doğum verisi gerektirmez; hesaplar yerel motorda,
 * sağlayıcı çağrısı ve kredi yok, hiçbir şey kaydedilmez. Üç sekme: Efemeris (#645) · Ay Evreleri ve Tutulmalar (#662/#681) ·
 * Derece Geçişleri (#663). Sekme adres çubuğunda (#efemeris | #ay-evreleri | #derece-gecisleri) tutulur.
 * Atlas menüsü: Yeni Analiz · Analiz Arşivi · Bilgi Bankası bağlantıları Atlas sayfasının ilgili görünümünü açar (açık hedef).
 */
import { useState, useSyncExternalStore } from "react";
import { atlasDisplay, atlasText } from "../atlas/fonts";
import { ATLAS_NAV_TARGET_KEY } from "../../_lib/skyToolsNav";
import DegreesTool from "./DegreesTool";
import EphemerisDesk from "./EphemerisDesk";
import LunationsTool from "./LunationsTool";
import { st as s } from "./skyToolsUi";

type Tab = "efemeris" | "ay" | "derece";
const TABS: { id: Tab; hash: string; label: string }[] = [
  { id: "efemeris", hash: "efemeris", label: "Efemeris" },
  { id: "ay", hash: "ay-evreleri", label: "Ay Evreleri ve Tutulmalar" },
  { id: "derece", hash: "derece-gecisleri", label: "Derece Geçişleri" },
];
const NAV: { hash: string; label: string }[] = [
  { hash: "yeni-analiz", label: "Yeni Analiz" },
  { hash: "analiz-arsivi", label: "Analiz Arşivi" },
  { hash: "bilgi-bankasi", label: "Bilgi Bankası" },
];
const tabFromHash = (h: string): Tab => TABS.find((t) => `#${t.hash}` === h)?.id ?? "efemeris";

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const noSubscribe = () => () => undefined;

export default function SkyToolsDesk() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  // Sekme seçimi adres çubuğunu replaceState ile günceller (hashchange tetiklenmez) → seçim yerelde tutulur; elle değişen hash öncelik alır.
  const [picked, setPicked] = useState<{ tab: Tab; hash: string } | null>(null);
  const tab = picked && picked.hash === hash ? picked.tab : tabFromHash(hash);
  const base = useSyncExternalStore(noSubscribe, () => (window.location.pathname.startsWith("/admin/") ? "/admin/astroloji" : "/astroloji"), () => "/astroloji");
  const choose = (t: Tab) => {
    setPicked({ tab: t, hash });
    const h = TABS.find((x) => x.id === t)!.hash;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${h}`);
  };
  const goAtlas = (hash: string) => {
    try {
      sessionStorage.setItem(ATLAS_NAV_TARGET_KEY, hash);
    } catch {
      /* depolama yoksa Atlas ana ekranı açılır */
    }
  };

  return (
    <div className={`${s.page} ${atlasDisplay.variable} ${atlasText.variable}`} data-testid="sky-tools">
      <header className={s.hero}>
        <div className={s.heroInner}>
          <a className={s.brand} href={base}>
            <span className={s.brandMark} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="3.2" />
                <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-28 12 12)" />
              </svg>
            </span>
            <span>
              <span className={s.brandEyebrow}>YAŞAM SİSTEMİ · ASTROLOJİ</span>
              <span className={s.brandTitle}>
                GÖKYÜZÜ <b>ATLASI</b>
              </span>
            </span>
          </a>
          <nav className={s.nav} aria-label="Gökyüzü Atlası menüsü">
            {NAV.map((n) => (
              <a key={n.hash} className={s.navItem} href={`${base}#${n.hash}`} onClick={() => goAtlas(n.hash)}>
                {n.label}
              </a>
            ))}
            <span className={`${s.navItem} ${s.navActive}`} aria-current="page">
              Gökyüzü Araçları <span className={s.navNew}>YENİ</span>
            </span>
          </nav>
        </div>
      </header>

      <main className={s.tools}>
        <section className={s.toolsHead}>
          <div>
            <p className={s.eyebrow}>GÖKYÜZÜ ARAÇLARI</p>
            <h1 className={s.title}>Tarih aralığına göre gökyüzü hesapları</h1>
            <p className={s.lead}>Doğum verisi gerektirmez. Tüm hesaplar Yaşam Sistemi yerel motorunda yapılır; hesaplama servisine çağrı ve kredi kullanımı yoktur.</p>
          </div>
          <div className={s.tabs} role="tablist" aria-label="Araç seçimi">
            {TABS.map((t) => (
              <button key={t.id} role="tab" type="button" className={s.tab} aria-selected={tab === t.id} onClick={() => choose(t.id)} data-testid={`sky-tab-${t.id}`}>
                {t.label}
              </button>
            ))}
          </div>
        </section>
        {/* Sekmeler bağımsız; seçili olmayan sekmenin durumu korunur (gizli). */}
        <div hidden={tab !== "efemeris"}>
          <EphemerisDesk />
        </div>
        <div hidden={tab !== "ay"}>
          <LunationsTool />
        </div>
        <div hidden={tab !== "derece"}>
          <DegreesTool />
        </div>
      </main>
    </div>
  );
}
