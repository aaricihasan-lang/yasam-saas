import type { ReactNode } from "react";
import css from "./MemberDetailV2.module.css";

/** Ad soyaddan iki harf (Türkçe büyük harf). Boşsa "?". */
export function memberInitials(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  const pick = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1);
  const s = pick.map((p) => p.charAt(0)).join("").toLocaleUpperCase("tr-TR");
  return s || "?";
}

/**
 * Üye Detayı V2 üst profil alanı (Owner görsel PASS sürüm 5) — yalnız sunum.
 * İçerik (etiket, rozet, bilgi şeridi, işlem düğmeleri) sayfadan gelir; burada veri türetilmez.
 */
export function MemberDetailHeader({
  eyebrow,
  name,
  email,
  badges,
  facts,
  actions,
}: {
  eyebrow: ReactNode;
  name: string;
  email: string;
  badges: ReactNode;
  facts: { label: string; value: ReactNode }[];
  actions?: ReactNode;
}) {
  return (
    <header className={css.hero} aria-labelledby="uye-detay-ad">
      <div className={css.identity}>
        <div className={css.avatar} aria-hidden>
          {memberInitials(name)}
        </div>
        <div className={css.idText}>
          <p className={css.eyebrow}>{eyebrow}</p>
          <h1 id="uye-detay-ad" className={css.name}>
            {name}
          </h1>
          <p className={css.email}>{email}</p>
          <div className={css.badges}>{badges}</div>
        </div>
      </div>
      {actions ? <div className={css.heroActions}>{actions}</div> : null}
      <dl className={css.facts}>
        {facts.map((f) => (
          <div key={f.label} className={css.fact}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
