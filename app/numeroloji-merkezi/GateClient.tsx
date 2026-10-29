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
        title="Hangi numeroloji yöntemiyle çalışacaksınız?"
        sub="İki yöntem birbirinden bağımsızdır; hesap kuralları, harf tabloları ve kayıtlar ayrı tutulur. Dilediğiniz zaman iki kaydı yan yana inceleyebilirsiniz."
      />

      <section className="nk-gate-grid" aria-label="Numeroloji yöntemleri">
        <Link className="nk-card nk-link-card nk-school nk-tone-a" href="/numeroloji" aria-describedby="nk-a-not" data-testid="gate-a">
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
          <p className="nk-school-foot" id="nk-a-not"><Icon name="lock" />Kendi çalışma alanında açılır; hesap kuralları ve kayıtları ayrı tutulur.</p>
        </Link>

        <TiltLink className="nk-school nk-tone-b" href="/numeroloji-klasik" data-testid="gate-b">
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
          <p className="nk-school-foot"><Icon name="shield" />Her sayının hesabı “Nasıl Hesaplandı?” ile açıkça gösterilir.</p>
        </TiltLink>
      </section>

      <TiltLink className="nk-compare-card" href="/numeroloji-karsilastirma" data-testid="gate-compare">
        <span className="nk-duo" aria-hidden="true"><span>A</span><span>B</span></span>
        <span>
          <span className="nk-h3" style={{ display: "block" }}>Karşılaştırmalı İnceleme</span>
          <span className="nk-lead" style={{ display: "block" }}>Aynı danışanın A ve B kayıtlarını kavram kavram yan yana inceleyin. Sayılar birleştirilmez; orijinal analizler değişmez.</span>
        </span>
        <span className="nk-badge nk-violet">İki yöntem</span>
      </TiltLink>

      <p className="nk-gate-note"><Icon name="info" />Bu ekran yalnız yöntem seçimidir. “Bütüncül Numeroloji” ve “Klasik Numeroloji” ayrı çalışma alanlarında açılır; kayıtları birbirini etkilemez.</p>
    </Shell>
  );
}
