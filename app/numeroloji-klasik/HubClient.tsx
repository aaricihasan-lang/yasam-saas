"use client";

// Klasik Numeroloji merkezi — açık premium vitrin (30.10.2026). Kartın tamamı tek bağlantı; kart / bağlantı / test kimlikleri korunur.
// Görseller ekran düzeyi dekordur (premiumArt.tsx; projede üretilmiş SVG) — kayıt içeriğine bağlı değildir.

import { Icon, Shell, TiltLink } from "./_ui/kit";
import { ClassicHeroArt, Emblem, SceneOrnament, type EmblemName } from "./_ui/premiumArt";

type Tile = { href: string; icon: string; emblem: EmblemName; title: string; desc: string; feature?: boolean; badge?: string; testid: string };

const TILES: Tile[] = [
  { href: "/numeroloji-klasik/yeni", icon: "plus", emblem: "analysis", title: "Yeni Analiz", desc: "Ad soyad ve doğum tarihiyle tüm teknikleri ya da seçtiklerinizi hesaplayın.", feature: true, badge: "Buradan başlayın", testid: "hub-yeni" },
  { href: "/numeroloji-klasik/kayitlar", icon: "archive", emblem: "archive", title: "Kayıtlı Analizler", desc: "Saklanan Klasik analizler; yeniden adlandırma, silme ve Word çıktısı.", feature: true, testid: "hub-kayitlar" },
  { href: "/numeroloji-klasik/kutuphane", icon: "book", emblem: "library", title: "Sayı Bilgi Kütüphanesi", desc: "1–9, usta sayılar ve Kalde 10–52 bileşik sayı anlamları.", testid: "hub-kutuphane" },
  { href: "/numeroloji-klasik/iliski", icon: "link", emblem: "relation", title: "İlişki Analizi", desc: "İki kişinin çekirdek sayılarının uyumu ve tamamlayıcı yönleri.", testid: "hub-iliski" },
  { href: "/numeroloji-klasik/isletme", icon: "building", emblem: "business", title: "İşletme Numerolojisi", desc: "Firma ve marka adının Kalde sayısı ve geleneksel değerlendirmesi.", testid: "hub-isletme" },
  { href: "/numeroloji-klasik/isimler", icon: "tag", emblem: "names", title: "İsim Seçenekleri", desc: "En çok altı aday ismi Pisagor ve Kalde ile yan yana inceleyin.", testid: "hub-isimler" },
];

export default function HubClient() {
  return (
    <Shell crumbs={[{ href: "/numeroloji-merkezi", label: "Numeroloji Merkezi" }, { label: "Klasik Numeroloji" }]}>
      <header className="nk-vitrin" aria-labelledby="nk-hub-title">
        <SceneOrnament className="nk-vitrin-orn" />
        <div className="nk-vitrin-text">
          <p className="nk-eyebrow nk-eyebrow-left">Klasik Numeroloji</p>
          <h1 className="nk-title" id="nk-hub-title">Batı ve Kalde gelenekleri</h1>
          <p className="nk-sub">Pisagor çekirdek sayıları, karmik yapı, zamanlama döngüleri ve Kalde bileşik sayıları — her adımı izlenebilir hesapla.</p>
          <ul className="nk-vitrin-chips" aria-label="Yöntemin temel ilkeleri">
            <li><span className="nk-dot nk-dot-b" aria-hidden="true" />Pisagor (Batı)</li>
            <li><span className="nk-dot nk-dot-g" aria-hidden="true" />Kalde (Cheiro)</li>
            <li><span className="nk-dot nk-dot-v" aria-hidden="true" />Usta sayılar 11 · 22 · 33</li>
          </ul>
        </div>
        <ClassicHeroArt className="nk-vitrin-art" />
      </header>

      <section className="nk-hub-grid" aria-label="Klasik Numeroloji bölümleri">
        {TILES.map((t) => (
          <TiltLink key={t.href} href={t.href} className={`nk-tile${t.feature ? " nk-feature" : ""}`} data-testid={t.testid}>
            <Emblem name={t.emblem} className="nk-tile-emblem" />
            <span className="nk-tile-icon"><Icon name={t.icon} /></span>
            <span className="nk-tile-body">
              <h2 className="nk-tile-title">{t.title}</h2>
              <p className="nk-tile-desc">{t.desc}</p>
            </span>
            {t.badge ? <span className="nk-badges"><span className="nk-badge nk-gold">{t.badge}</span></span> : null}
            {t.feature ? <span className="nk-tile-go" aria-hidden="true">→</span> : null}
          </TiltLink>
        ))}
        <div className="nk-card nk-tile nk-wide" data-testid="hub-dogaltas">
          <Emblem name="stone" className="nk-tile-emblem" />
          <span className="nk-tile-icon"><Icon name="gem" /></span>
          <span className="nk-tile-body">
            <h2 className="nk-tile-title">Numeroloji – Doğaltaş</h2>
            <p className="nk-tile-desc">
              Kişi analizinin “Taşlar” sekmesinde üç kaynak ayrı gösterilir: haritanın önerdiği taşlar, titreşim eşleşmesi ve gezegen ilişkisi;
              stok bilginizle birlikte. Öneriler sembolik ve gelenekseldir; sağlık iddiası taşımaz.
            </p>
          </span>
          <span className="nk-badges"><span className="nk-badge">Sembolik / geleneksel</span><span className="nk-badge nk-ice">Analiz sonucunda · Taşlar</span></span>
        </div>
      </section>
    </Shell>
  );
}
