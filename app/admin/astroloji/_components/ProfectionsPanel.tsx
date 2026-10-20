"use client";

/**
 * Yıllık profeksiyonlar — teknik sonuç görünümü (2026-10-20). Yalnız kanonik teknik katman (sağlayıcı yanıtının doğrulanmış
 * alanları + profeksiyon yılı tarih aralığı) gösterilir; etiketler Yaşam Türkçe sözlüğünden. Sağlayıcının kısa açıklaması bu
 * panelde DEĞİL, ayrı yorum katmanında ("Sistem Yorumu" — ProviderInterpretationPanel) gösterilir; uzman değerlendirmesi
 * "Kendi Yorumum" alanındadır.
 * Aynı bileşen canlı sonuç ve kayıtlı analiz (arşiv) görünümünde kullanılır.
 */

import type { BodyId } from "@/lib/astrology/model/western";
import type { ProfectionsTechnical } from "@/lib/astrology/model/westernProfections";
import { BODY_GLYPHS, BODY_LABELS, HOUSE_SYSTEM_LABELS, SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";

const fmt = (iso: string) => iso.split("-").reverse().join(".");

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 px-3 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:w-56">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-800" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

export function ProfectionsPanel({ t }: { t: ProfectionsTechnical }) {
  const lord = t.lordOfYear as BodyId;
  return (
    <div className="flex flex-col gap-3" data-testid="astro-profections-panel">
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <h4 className="text-sm font-semibold text-slate-700">Profeksiyon Yılı</h4>
          <span className="text-xs text-slate-500">
            {fmt(t.yearStart)} – {fmt(t.yearEnd)}
          </span>
        </div>
        <dl>
          <Row label="Profeksiyon Yılı" testId="astro-profections-year">
            {t.age} yaş profeksiyon yılı · {fmt(t.yearStart)} – {fmt(t.yearEnd)}
          </Row>
          <Row label="Tamamlanmış Yaş" testId="astro-profections-age">
            {t.age}
          </Row>
          <Row label="Etkin Astrolojik Ev" testId="astro-profections-house">
            {t.profectedHouse}. ev
          </Row>
          <Row label="Etkin Burç" testId="astro-profections-sign">
            <span className="mr-1">{SIGN_GLYPHS[t.profectedSign]}</span>
            {SIGN_LABELS[t.profectedSign]}
          </Row>
          <Row label="Yılın Yönetici Gezegeni" testId="astro-profections-lord">
            <span className="mr-1">{BODY_GLYPHS[lord]}</span>
            {BODY_LABELS[lord]}
          </Row>
          <Row label="Yöneticinin Natal Konumu" testId="astro-profections-lord-natal">
            <span className="mr-1">{SIGN_GLYPHS[t.lordNatal.sign]}</span>
            {SIGN_LABELS[t.lordNatal.sign]} · {t.lordNatal.house}. ev
          </Row>
          <Row label="Ev Sistemi" testId="astro-profections-house-system">
            {HOUSE_SYSTEM_LABELS[t.houseSystem]}
          </Row>
        </dl>
      </section>
      <p className="text-xs leading-relaxed text-slate-500" data-testid="astro-profections-method">
        Yükselen burçtan her tamamlanmış yaş için bir burç ilerlenir; etkin ev = yaş mod 12 + 1 (0, 12, 24, 36… yaşlarında 1. ev). Yılın
        yönetici gezegeni etkin burcun klasik yöneticisidir (yedi gezegen). Yöneticinin natal evi de Tam Burç (Whole Sign) evleriyle
        gösterilir; doğum haritası analizlerinizdeki ev sistemi tercihi değişmez. Profeksiyon yılı doğum gününde başlar.
      </p>
      {t.leapDayBirth && (
        <p className="text-xs leading-relaxed text-slate-500" data-testid="astro-profections-leapday">
          29 Şubat doğumu: artık olmayan yıllarda yeni profeksiyon yılı 1 Mart&apos;ta başlar (28 Şubat önceki yaşa aittir); artık yıllarda 29
          Şubat&apos;ta başlar.
        </p>
      )}
    </div>
  );
}
