import { jost400Vars } from "@/app/_fonts/google/etiket-400";
import { HdHubModules, type HdHubModule } from "./components/HdHubModules";
import styles from "./_premium/hd.module.css";
import { cookies } from "next/headers";
import { getServerDb } from "@/lib/supabase-server";
import { ADMIN_SESSION_COOKIE, resolveAdminShellUserId } from "@/lib/auth/adminShellSession";
import { isEducationCatalogOpen, isEducationOwner } from "@/lib/human-design/education/educationAccess";
import { privateEnvKillSwitch } from "@/lib/human-design/education/private/privateAccess";
import { getLocale, getTranslations } from "next-intl/server";

// 2026-10-18 premium görünüm (owner onaylı prototip, tasarım arşivi 1fed59a): başlık Fraunces, etiket Jost —
// next/font ile kendi sunucumuzdan (dış istek yok); Türkçe için latin-ext.
// Yerel dosyalar (app/_fonts/FONTLAR.md); build'de ağ isteği yok. Başlık (--hd-display): global Fraunces; etiket (--hd-label):
// Jost 400 — ys-fv-human-design (app/_fonts/google/degiskenler.css).

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

/** D-HD i18n: kart metni anahtarı (href son bölümü → hd.hub.modules.<anahtar>). */
const HUB_MODULE_KEY: Readonly<Record<string, string>> = {
  "/human-design/danisanlar": "danisanlar",
  "/human-design/bilgi-bankasi": "bilgiBankasi",
  "/human-design/iliski-grup": "iliskiGrup",
  "/human-design/transit": "transit",
};

export default async function HumanDesignHubPage() {
  const ownerEducationCard = await resolveOwnerEducationCard();
  const catalogOpen = await resolveCatalogOpen();
  // D-HD i18n: Türkçede kaynak kart verisi AYNEN (sözleşme testleri HD_MODULES metnini kilitler); diğer dillerde
  // görünen başlık/açıklama/rozet sözlükten. href / ton / görsel değişmez.
  const locale = await getLocale();
  const t = await getTranslations("hd.hub");
  const modules: readonly HdHubModule[] =
    locale === "tr"
      ? HD_MODULES
      : HD_MODULES.map((m) => {
          const k = HUB_MODULE_KEY[m.href];
          return k ? { ...m, title: t(`modules.${k}.title`), desc: t(`modules.${k}.desc`), badge: t(`modules.${k}.badge`) } : m;
        });
  return (
    <div className={`${styles.root} ys-fv-human-design ${jost400Vars}`}>
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
            <p className={styles.heroSub}>{t("heroSub")}</p>
          </div>
        </section>

        {/* Ana çalışma alanları */}
        {/* Katalog kapısı KAPALIYKEN (varsayılan) merkezî kart yoklaması yapılmaz. Özel arşiv kartı: kapı owner'ın arşiv
            anahtarıdır ve yalnız sunucu yoklamasıyla (yetkili eğitmene 200) görünür; acil kapatmada yoklama yok. */}
        <HdHubModules
          modules={modules}
          educationCard={catalogOpen}
          privateEducationCard={!privateEnvKillSwitch()}
          ownerEducationCard={ownerEducationCard}
        />
      </div>
    </div>
  );
}
