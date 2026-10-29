"use client";

// Numeroloji Merkezi — yöntem seçim vitrini (açık premium, 30.10.2026).
// "Bütüncül Numeroloji" kartı mevcut modülü (/numeroloji) DEĞİŞTİRMEDEN açan düz bir bağlantıdır; görseli o modülün kendi
// vitrin görselidir (public/premium/numeroloji/hero-sol.webp). Klasik görseli projede üretilmiş SVG'dir (premiumArt.tsx).

import Link from "next/link";
import { Icon, Shell, TiltLink } from "@/app/numeroloji-klasik/_ui/kit";
import { ClassicHeroArt, Emblem, SceneOrnament } from "@/app/numeroloji-klasik/_ui/premiumArt";

export default function GateClient() {
  return (
    <Shell theme="gate">
      <header className="nk-gate-hero" aria-labelledby="nk-gate-title">
        <SceneOrnament className="nk-gate-orn" />
        <p className="nk-eyebrow">Numeroloji Merkezi</p>
        <h1 className="nk-title" id="nk-gate-title">Hangi numeroloji yöntemiyle çalışacaksınız?</h1>
        <p className="nk-sub">İki yöntem bağımsızdır; hesap kuralları ve kayıtlar ayrı tutulur. Dilediğiniz zaman iki kaydı yan yana inceleyebilirsiniz.</p>
      </header>

      <section className="nk-gate-grid" aria-label="Numeroloji yöntemleri">
        <Link className="nk-card nk-link-card nk-school nk-tone-a" href="/numeroloji" aria-describedby="nk-a-not" data-testid="gate-a">
          <span className="nk-school-art nk-art-a" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- sabit dekor; mevcut modülün kendi görseli */}
            <img src="/premium/numeroloji/hero-sol.webp" width={600} height={320} alt="" decoding="async" draggable={false} />
          </span>
          <div className="nk-school-head">
            <span className="nk-school-mark" aria-hidden="true">A</span>
            <div>
              <h2 className="nk-school-title">Bütüncül Numeroloji</h2>
              <p className="nk-school-sub">Eğitim tekniklerine dayalı, bütüncül numeroloji çalışma alanı.</p>
            </div>
          </div>
          <dl className="nk-idcard" aria-label="Yöntem kimlik kartı — Bütüncül Numeroloji">
            <div className="nk-idrow"><dt>Harf tablosu</dt><dd>Pisagor harf tablosu + eğitim teknikleri</dd></div>
            <div className="nk-idrow"><dt>Usta sayı</dt><dd>Tüm rakamlar tek seferde toplanır, ara toplam gösterilir (ör. 32/5).</dd></div>
            <div className="nk-idrow">
              <dt>Temel teknikler</dt>
              <dd className="nk-chips">
                {["PİN", "Ana Kulvar", "Yan Kulvar", "Çakra Omurgası", "Elementler", "Hayat Yolu"].map((c) => <span key={c} className="nk-chip">{c}</span>)}
              </dd>
            </div>
          </dl>
          <p className="nk-school-foot" id="nk-a-not">
            <Icon name="lock" />Kendi çalışma alanında açılır.
            <span className="nk-school-cta" aria-hidden="true">Bütüncül Numeroloji’yi aç →</span>
          </p>
        </Link>

        <TiltLink className="nk-school nk-tone-b" href="/numeroloji-klasik" data-testid="gate-b">
          <span className="nk-school-art nk-art-b" aria-hidden="true">
            <ClassicHeroArt variant="card" className="nk-school-svg" />
          </span>
          <div className="nk-school-head">
            <span className="nk-school-mark" aria-hidden="true">B</span>
            <div>
              <h2 className="nk-school-title">Klasik Numeroloji</h2>
              <p className="nk-school-sub">Batı ve Kalde gelenekleri; adım adım doğrulanabilir hesap.</p>
            </div>
          </div>
          <dl className="nk-idcard" aria-label="Yöntem kimlik kartı — Klasik Numeroloji">
            <div className="nk-idrow"><dt>Harf tablosu</dt><dd>Pisagor (Batı) ve Kalde (Cheiro) — iki ayrı yöntem</dd></div>
            <div className="nk-idrow"><dt>Usta sayı</dt><dd>Ay, gün ve yıl ayrı indirgenir; 11 · 22 · 33 korunur.</dd></div>
            <div className="nk-idrow">
              <dt>Temel teknikler</dt>
              <dd className="nk-chips">
                {["Çekirdek Sayılar", "Karmik Dersler", "Zirveler", "Köprüler", "Kalde Bileşik", "İki Sistem"].map((c) => <span key={c} className="nk-chip">{c}</span>)}
              </dd>
            </div>
          </dl>
          <p className="nk-school-foot">
            <Icon name="shield" />Her sayının hesabı adım adım gösterilir.
            <span className="nk-school-cta" aria-hidden="true">Klasik Numeroloji’yi aç →</span>
          </p>
        </TiltLink>
      </section>

      <TiltLink className="nk-compare-card" href="/numeroloji-karsilastirma" data-testid="gate-compare">
        <Emblem name="compare" className="nk-compare-emblem" />
        <span>
          <span className="nk-h3" style={{ display: "block" }}>Karşılaştırmalı İnceleme</span>
          <span className="nk-lead" style={{ display: "block" }}>Aynı danışanın iki yöntemdeki kayıtlarını kavram kavram yan yana inceleyin. Sayılar birleştirilmez; orijinal analizler değişmez.</span>
        </span>
        <span className="nk-badge nk-violet">İki yöntem</span>
      </TiltLink>
    </Shell>
  );
}
