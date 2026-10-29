"use client";

// Klasik Numeroloji merkezi (prototip klasik.html). Kartın tamamı tek bağlantı; "Aç" satırı yok.

import { Hero, Icon, Shell, TiltLink } from "./_ui/kit";

const TILES: { href: string; icon: string; title: string; desc: string; cls?: string; badge?: string; testid: string }[] = [
  { href: "/numeroloji-klasik/yeni", icon: "plus", title: "Yeni Analiz", desc: "Ad soyad ve doğum tarihiyle tüm teknikleri ya da seçtiklerinizi hesaplayın.", cls: "nk-feature", badge: "Buradan başlayın", testid: "hub-yeni" },
  { href: "/numeroloji-klasik/kayitlar", icon: "archive", title: "Kayıtlı Analizler", desc: "Saklanan Klasik analizler; yeniden adlandırma, silme ve Word çıktısı.", cls: "nk-feature", testid: "hub-kayitlar" },
  { href: "/numeroloji-klasik/kutuphane", icon: "book", title: "Sayı Bilgi Kütüphanesi", desc: "1–9, usta sayılar ve Kalde 10–52 bileşik sayı anlamları.", testid: "hub-kutuphane" },
  { href: "/numeroloji-klasik/iliski", icon: "link", title: "İlişki Analizi", desc: "İki kişinin çekirdek sayılarının uyumu ve tamamlayıcı yönleri.", testid: "hub-iliski" },
  { href: "/numeroloji-klasik/isletme", icon: "building", title: "İşletme Numerolojisi", desc: "Firma ve marka adının Kalde sayısı ve geleneksel değerlendirmesi.", testid: "hub-isletme" },
  { href: "/numeroloji-klasik/isimler", icon: "tag", title: "İsim Seçenekleri", desc: "En çok altı aday ismi Pisagor ve Kalde ile yan yana inceleyin.", testid: "hub-isimler" },
];

export default function HubClient() {
  return (
    <Shell crumbs={[{ href: "/numeroloji-merkezi", label: "Numeroloji Merkezi" }, { label: "Klasik Numeroloji" }]}>
      <Hero
        eyebrow="Klasik Numeroloji"
        title="Batı ve Kalde gelenekleri"
        sub="Pisagor çekirdek sayıları, karmik yapı, zamanlama döngüleri ve Kalde bileşik sayıları — her adımı izlenebilir hesapla."
      />
      <section className="nk-hub-grid" aria-label="Klasik Numeroloji bölümleri">
        {TILES.map((t) => (
          <TiltLink key={t.href} href={t.href} className={`nk-tile ${t.cls ?? ""}`} data-testid={t.testid}>
            <span className="nk-tile-icon"><Icon name={t.icon} /></span>
            <h2 className="nk-tile-title">{t.title}</h2>
            <p className="nk-tile-desc">{t.desc}</p>
            {t.badge ? <span className="nk-badges"><span className="nk-badge nk-ice">{t.badge}</span></span> : null}
          </TiltLink>
        ))}
        <div className="nk-card nk-tile nk-wide" data-testid="hub-dogaltas">
          <span className="nk-tile-icon"><Icon name="gem" /></span>
          <h2 className="nk-tile-title">Numeroloji – Doğaltaş</h2>
          <p className="nk-tile-desc">
            Kişi analizinin “Taşlar” sekmesinde üç kaynak ayrı gösterilir: haritanın önerdiği taşlar, titreşim eşleşmesi ve gezegen ilişkisi;
            stok bilginizle birlikte. Öneriler sembolik ve gelenekseldir; sağlık iddiası taşımaz.
          </p>
          <span className="nk-badges"><span className="nk-badge">Sembolik / geleneksel</span><span className="nk-badge nk-ice">Analiz sonucunda · Taşlar</span></span>
        </div>
      </section>
    </Shell>
  );
}
