// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). Kampanya Merkezi ZİYARETÇİ GÖRÜNÜMÜ — gerçek sunum bileşenleri
// (VisitorCampaignView; hook / veri erişimi yok, yalnız props) + gerçek kampanya.module.css (.km kökü: --body "Geist",
// --label "Jost" SABİT aile adlarıyla). /ucretsiz-analiz sarmalayıcısıyla aynı: .km + premiumFontVars. Sentetik metin.
import { premiumFontVars } from "@/app/_premium/fonts";
import styles from "@/app/admin/kampanya-merkezi/kampanya.module.css";
import { VisitorHeader, VisitorHero, VisitorSoon, type VisitorView } from "@/app/_campaign/VisitorCampaignView";

const V: VisitorView = {
  state: "yakinda",
  slogan: "Yeni ücretsiz analiz kampanyası",
  altSlogan: "Sınırlı kontenjan · Türkçe karakter sınaması: ğüşıöç ĞÜŞİÖÇ",
  description: "Yaşam Sistemi'nin profesyonel analiz altyapısını ücretsiz deneyin.",
  affirmation: "Kendini tanımak, değişimin ilk adımıdır.",
  ctaText: "Hemen başlayın",
  imageSrc: null,
  startsLabel: "12 Kasım 2026 Perşembe",
  modules: [],
};

export default function Page() {
  return (
    <div className={`${styles.km} ${premiumFontVars}`}>
      <div className="vz" data-vz-state="yakinda">
        <div className="vzWrap">
          <VisitorHeader highlight />
          <VisitorHero compact={false} />
          <VisitorSoon v={V} />
          <p data-k="km --body metin">Gövde metni (var(--body)): Danışan kayıtlarından yaşam analizlerine — ğüşıöç ĞÜŞİÖÇ 0123456789</p>
          <p className="eyebrow" data-k="km --label eyebrow">Profesyoneller için tek merkez</p>
          <span className="pill" data-k="km --body pill">Kredi kartı gerekmez</span>
        </div>
      </div>
    </div>
  );
}
