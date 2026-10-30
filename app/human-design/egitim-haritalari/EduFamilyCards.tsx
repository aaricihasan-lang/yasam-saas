"use client";

/**
 * Hazır Eğitim Haritaları — EĞİTMEN aile kartları (owner kararı 30.10.2026).
 * Owner ekranındaki onaylı premium aile kartının eğitmen karşılığı (aynı stil dosyası; yeni tasarım yok).
 * Aileler sunucudan gelir ve YALNIZ tüm üyeleri yayımlı + uygun olan aileleri içerir (visibleFamilies) — burada filtre yok,
 * eksik üye bilgisi istemciye hiç ulaşmaz. Yeni ilişki hesabı (Connection / Penta) YOK.
 */

import Link from "next/link";
import { useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import ov from "@/app/admin/hd-egitim-haritalari/ownerViews.module.css";
import type { EduVisibleFamily } from "@/lib/human-design/education/educationFamilies";

export const EDU_CATALOG_HREF = "/human-design/egitim-haritalari";

function FamilyCard({ family }: { family: EduVisibleFamily }) {
  const [sel, setSel] = useState<string[]>([]);
  const all = family.members.map((m) => m.id);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const famHref = `${EDU_CATALOG_HREF}/aile/${encodeURIComponent(family.key)}`;
  const selHref = sel.length === 1 ? `${EDU_CATALOG_HREF}/${encodeURIComponent(sel[0])}` : `${famHref}?sec=${sel.map(encodeURIComponent).join(",")}`;
  const nameOf = (id: string) => family.members.find((m) => m.id === id)?.displayName ?? null;
  const linkText = family.links.map((l) => { const a = nameOf(l.from); const b = nameOf(l.to); return a && b ? `${a} ⟷ ${b} (${l.label})` : null; }).filter(Boolean).join(" · ");
  return (
    <article className={ov.famCard} data-edu-family={family.key}>
      <h3 className={ov.famTitle}>{family.title}</h3>
      {linkText ? <p className={ov.famLink} data-edu-family-link>{linkText}</p> : null}
      <ul className={ov.famMembers}>
        {family.members.map((m) => (
          <li key={m.id} className={ov.famMember}>
            <label>
              <input type="checkbox" checked={sel.includes(m.id)} onChange={() => toggle(m.id)} data-edu-family-pick={m.id} aria-label={`${m.displayName} seç`} />
              <span className={ov.famName}>{m.displayName}</span>
            </label>
            <span className={ov.famRole} data-edu-family-role={m.role}>{m.role}</span>
            <Link className={ov.famOpen} href={`${EDU_CATALOG_HREF}/${encodeURIComponent(m.id)}`}>Ayrıntı →</Link>
          </li>
        ))}
      </ul>
      <div className={ov.famActions}>
        <button type="button" className={ov.famBtn} onClick={() => setSel(sel.length === all.length ? [] : all)} data-edu-family-all>
          {sel.length === all.length ? "Seçimi temizle" : "Ailenin Tamamını Seç"}
        </button>
        <Link className={ov.famBtn} href={selHref} aria-disabled={sel.length === 0} tabIndex={sel.length === 0 ? -1 : undefined} data-edu-family-selected>
          {sel.length === 1 ? "Seçili kişiyi incele" : `Seçilenleri İncele (${sel.length})`}
        </Link>
        <Link className={`${ov.famBtn} ${ov.famBtnMain}`} href={famHref} data-edu-family-review>Ailenin Tamamını İncele</Link>
      </div>
    </article>
  );
}

/** Katalog sayfasının EN ALTINDAKİ aile bölümü. Görünür aile yoksa hiç çizilmez. */
export function EduFamilyCards({ families }: { families: EduVisibleFamily[] }) {
  if (!families.length) return null;
  return (
    <section className={`${base.panel} ${ov.famSection}`} aria-labelledby="edu-fam-title" data-edu-families>
      <div className={ov.famHead}>
        <h2 id="edu-fam-title" className={base.h2}>Aile Haritaları</h2>
        <small className={base.lead}>Yalnız kaynakla doğrulanmış aile bağları · bireyler yukarıdaki listede de yer alır</small>
      </div>
      <div className={ov.famGrid}>
        {families.map((f) => <FamilyCard key={f.key} family={f} />)}
      </div>
    </section>
  );
}
