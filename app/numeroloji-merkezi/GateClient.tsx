"use client";

// Numeroloji Merkezi — ekol seçim kapısı (prototip index.html).
// A kartı mevcut modülü (/numeroloji) DEĞİŞTİRMEDEN açan düz bir bağlantıdır.

import Link from "next/link";
import { Hero, Icon, Shell, TiltLink } from "@/app/numeroloji-klasik/_ui/kit";

export default function GateClient() {
  return (
    <Shell theme="gate">
      <Hero
        eyebrow="Numeroloji Merkezi"
        title="Hangi ekolle çalışacaksınız?"
        sub="İki ekol birbirinden bağımsızdır; hesap kuralları, harf tabloları ve kayıtlar ayrı tutulur. Dilediğiniz zaman iki kaydı yan yana inceleyebilirsiniz."
      />

      <section className="nk-gate-grid" aria-label="Ekoller">
        <Link className="nk-card nk-link-card nk-school nk-tone-a" href="/numeroloji" aria-describedby="nk-a-not" data-testid="gate-a">
          <span className="nk-badge nk-gold nk-corner">Mevcut modül</span>
          <div className="nk-school-head">
            <span className="nk-school-mark" aria-hidden="true">A</span>
            <div>
              <h2 className="nk-school-title">Mevcut Numeroloji</h2>
              <p className="nk-school-sub">Eğitim tekniklerine dayalı, alıştığınız çalışma alanı.</p>
            </div>
          </div>
          <dl className="nk-idcard" aria-label="Ekol kimlik kartı — Mevcut Numeroloji">
            <div className="nk-idrow"><dt>Harf tablosu</dt><dd>Pisagor harf tablosu + eğitim teknikleri</dd></div>
            <div className="nk-idrow"><dt>Usta sayı</dt><dd>Tüm rakamlar tek seferde toplanır, ara toplam gösterilir (ör. 32/5).</dd></div>
            <div className="nk-idrow">
              <dt>Temel teknikler</dt>
              <dd className="nk-chips">
                {["PİN", "Ana Kulvar", "Yan Kulvar", "Çakra Omurgası", "Elementler", "Hayat Yolu"].map((c) => <span key={c} className="nk-chip">{c}</span>)}
              </dd>
            </div>
          </dl>
          <p className="nk-school-foot" id="nk-a-not"><Icon name="lock" />Mevcut modül olduğu gibi açılır; tasarımı ve hesapları değişmez.</p>
        </Link>

        <TiltLink className="nk-school nk-tone-b" href="/numeroloji-klasik" data-testid="gate-b">
          <span className="nk-badge nk-ice nk-corner">Yeni</span>
          <div className="nk-school-head">
            <span className="nk-school-mark" aria-hidden="true">B</span>
            <div>
              <h2 className="nk-school-title">Klasik Numeroloji</h2>
              <p className="nk-school-sub">Batı ve Kalde gelenekleri; adım adım doğrulanabilir hesap.</p>
            </div>
          </div>
          <dl className="nk-idcard" aria-label="Ekol kimlik kartı — Klasik Numeroloji">
            <div className="nk-idrow"><dt>Harf tablosu</dt><dd>Pisagor (Batı) ve Kalde (Cheiro) — iki ayrı yöntem</dd></div>
            <div className="nk-idrow"><dt>Usta sayı</dt><dd>Ay, gün ve yıl ayrı indirgenir; 11 · 22 · 33 korunur.</dd></div>
            <div className="nk-idrow">
              <dt>Temel teknikler</dt>
              <dd className="nk-chips">
                {["Çekirdek Sayılar", "Karmik Dersler", "Zirveler", "Köprüler", "Kalde Bileşik", "İki Sistem"].map((c) => <span key={c} className="nk-chip">{c}</span>)}
              </dd>
            </div>
          </dl>
          <p className="nk-school-foot"><Icon name="shield" />Her sayının hesabı “Nasıl Hesaplandı?” ile açıkça gösterilir.</p>
        </TiltLink>
      </section>

      <TiltLink className="nk-compare-card" href="/numeroloji-karsilastirma" data-testid="gate-compare">
        <span className="nk-duo" aria-hidden="true"><span>A</span><span>B</span></span>
        <span>
          <span className="nk-h3" style={{ display: "block" }}>Karşılaştırmalı İnceleme</span>
          <span className="nk-lead" style={{ display: "block" }}>Aynı danışanın A ve B kayıtlarını kavram kavram yan yana inceleyin. Sayılar birleştirilmez; orijinal analizler değişmez.</span>
        </span>
        <span className="nk-badge nk-violet">İki ekol</span>
      </TiltLink>

      <p className="nk-gate-note"><Icon name="info" />Bu ekran yalnız ekol seçimidir. “Mevcut Numeroloji” kartı bugünkü modülü değiştirmeden açar; “Klasik Numeroloji” ayrı bir çalışma alanıdır.</p>
    </Shell>
  );
}
