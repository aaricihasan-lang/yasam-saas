import localFont from "next/font/local";
import { HdHubModules, type HdHubModule } from "./components/HdHubModules";
import styles from "./_premium/hd.module.css";
import { cookies } from "next/headers";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import { isEducationCatalogOpen, isEducationOwner } from "@/lib/human-design/education/educationAccess";
import { privateEnvKillSwitch } from "@/lib/human-design/education/private/privateAccess";

// 2026-10-18 premium görünüm (owner onaylı prototip, tasarım arşivi 1fed59a): başlık Fraunces, etiket Jost —
// next/font ile kendi sunucumuzdan (dış istek yok); Türkçe için latin-ext.
// Yerel dosyalar (app/_fonts/FONTLAR.md): Google'ın sunduğu latin + latin-ext içeriğiyle aynı; build'de ağ isteği yok.
const hdDisplay = localFont({ src: "../_fonts/fraunces.woff2", weight: "100 900", variable: "--hd-display", display: "swap", adjustFontFallback: "Times New Roman" });
const hdLabel = localFont({ src: [{ path: "../_fonts/jost.woff2", weight: "400", style: "normal" }], variable: "--hd-label", display: "swap" });

// AŞAMA 3C — premium, görev odaklı iki çalışma alanı. Eski kartların işlevleri silinmedi:
//   • Danışanlar / Human Design Haritası / Kayıtlı Haritalar / Kayıtlı Raporlar → Hesaplama çalışma
//     alanı (danışan seç/yeni + hesapla + Geçmiş Analizler; raporlar analizlerin altında). Route'lar
//     (/kayitli-haritalar, /kayitli-raporlar, /rapor-olustur, /harita-kaydi) eski bağlantılar için durur.
//   • Manuel harita / Rapor Oluştur yeni üretim yüzeyi değildir (uzmandan ve adminden kaldırıldı).
const HD_MODULES: readonly HdHubModule[] = [
  {
    title: "Human Design Hesaplama",
    desc: "Danışan seçin veya yeni danışan oluşturun ve profesyonel Human Design haritasını hesaplayın.",
    href: "/human-design/danisanlar",
    badge: "Hesaplama",
    tone: "violet",
    tile: "map",
    art: "hesaplama",
  },
  {
    title: "Bilgi Bankası",
    desc: "Human Design mesleki bilgilerinizi yönetin.",
    href: "/human-design/bilgi-bankasi",
    badge: "İçerik",
    tone: "blue",
    tile: "stack",
    art: "bilgi-bankasi",
  },
  {
    title: "İlişki ve Grup Analizleri",
    desc: "İki kişi için ilişki analizi (Connection), 3–5 kişi için grup analizi (Penta). Kayıtlı danışanlarınızdan seçin.",
    href: "/human-design/iliski-grup",
    badge: "Connection · Penta",
    tone: "purple",
    tile: "heart",
    // Owner kararı: ilişki kartında YALNIZ birbirine bağlı ışıklı küreler — insan silüeti yok.
    art: "iliski-kureler",
  },
  {
    title: "Günün ve Kişisel Transitleri",
    desc: "Seçtiğiniz tarihin gezegensel etkilerini inceleyin; kayıtlı danışanlarınızın kişisel transitlerini görüntüleyin.",
    href: "/human-design/transit",
    badge: "Transit",
    tone: "blue",
    tile: "orbit",
    art: "transit-gokyuzu",
  },
];

/**
 * Eğitim Merkezi owner kartı: SUNUCUDA opak admin oturum token'ı → aktif admin → KATI owner (DB). Diğer herkesin
 * HTML'inde kart hiç bulunmaz. Kart güvenlik sınırı DEĞİLDİR: yönetim ekranı ve API'leri her istekte owner kapısından geçer.
 */
async function resolveOwnerEducationCard(): Promise<boolean> {
  try {
    const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
    if (!token) return false;
    const db = getServerDb();
    return await isEducationOwner(db, await resolveAdminShellUserId(db, token));
  } catch {
    return false;
  }
}

/** Owner kararı 31.10.2026: katalog kapısı owner panelindeki DB anahtarı; okuma hatası → kapalı (kart yoklaması yapılmaz). */
async function resolveCatalogOpen(): Promise<boolean> {
  try { return await isEducationCatalogOpen(getServerDb()); } catch { return false; }
}

export default async function HumanDesignHubPage() {
  const ownerEducationCard = await resolveOwnerEducationCard();
  const catalogOpen = await resolveCatalogOpen();
  return (
    <div className={`${styles.root} ${hdDisplay.variable} ${hdLabel.variable}`}>
      <div className={styles.page}>
        {/* Panoramik başlık — iki yandaki sahneler dekor (ekran okuyucudan gizli). */}
        <section className={styles.hero} aria-labelledby="hd-hub-title">
          <div className={`${styles.heroScene} ${styles.heroLeft}`} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok */}
            <img src="/premium/human-design/hero-sol.webp" width={532} height={254} alt="" decoding="async" draggable={false} />
          </div>
          <div className={`${styles.heroScene} ${styles.heroRight}`} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element -- dekor; boyutlar sabit, dış istek yok */}
            <img src="/premium/human-design/hero-sag.webp" width={510} height={254} alt="" decoding="async" draggable={false} />
          </div>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>
              <span>Yaşam Sistemi</span>
            </p>
            <h1 id="hd-hub-title" className={styles.heroTitle}>
              Human Design
            </h1>
            <p className={styles.heroSub}>Profesyonel Human Design hesaplama ve mesleki bilgi çalışma alanı.</p>
          </div>
        </section>

        {/* Ana çalışma alanları */}
        {/* Katalog kapısı KAPALIYKEN (varsayılan) merkezî kart yoklaması yapılmaz. Özel arşiv kartı: kapı owner'ın arşiv
            anahtarıdır ve yalnız sunucu yoklamasıyla (yetkili eğitmene 200) görünür; acil kapatmada yoklama yok. */}
        <HdHubModules
          modules={HD_MODULES}
          educationCard={catalogOpen}
          privateEducationCard={!privateEnvKillSwitch()}
          ownerEducationCard={ownerEducationCard}
        />
      </div>
    </div>
  );
}
