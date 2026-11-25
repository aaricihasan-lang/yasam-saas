"use client";

// Klasik Numeroloji merkezi — açık premium vitrin (30.10.2026). Kartın tamamı tek bağlantı; kart / bağlantı / test kimlikleri korunur.
// Görseller ekran düzeyi dekordur (premiumArt.tsx; projede üretilmiş SVG) — kayıt içeriğine bağlı değildir.

import { useTranslations } from "next-intl";
import { Icon, Shell, TiltLink } from "./_ui/kit";
import { ClassicHeroArt, Emblem, SceneOrnament, type EmblemName } from "./_ui/premiumArt";

// Metinler numerology.classic.hub (TR birebir); `key` yalnız katalog anahtarıdır.
type TileKey = "new" | "records" | "library" | "relationship" | "business" | "names";
type Tile = { href: string; icon: string; emblem: EmblemName; key: TileKey; feature?: boolean; badge?: boolean; testid: string };

const TILES: Tile[] = [
  { href: "/numeroloji-klasik/yeni", icon: "plus", emblem: "analysis", key: "new", feature: true, badge: true, testid: "hub-yeni" },
  { href: "/numeroloji-klasik/kayitlar", icon: "archive", emblem: "archive", key: "records", feature: true, testid: "hub-kayitlar" },
  { href: "/numeroloji-klasik/kutuphane", icon: "book", emblem: "library", key: "library", testid: "hub-kutuphane" },
  { href: "/numeroloji-klasik/iliski", icon: "link", emblem: "relation", key: "relationship", testid: "hub-iliski" },
  { href: "/numeroloji-klasik/isletme", icon: "building", emblem: "business", key: "business", testid: "hub-isletme" },
  { href: "/numeroloji-klasik/isimler", icon: "tag", emblem: "names", key: "names", testid: "hub-isimler" },
];

export default function HubClient() {
  const t = useTranslations("numerology.classic");
  return (
    <Shell crumbs={[{ href: "/numeroloji-merkezi", label: t("shared.crumbCentre") }, { label: t("shared.crumbClassic") }]}>
      <header className="nk-vitrin" aria-labelledby="nk-hub-title">
        <SceneOrnament className="nk-vitrin-orn" />
        <div className="nk-vitrin-text">
          <p className="nk-eyebrow nk-eyebrow-left">{t("shared.crumbClassic")}</p>
          <h1 className="nk-title" id="nk-hub-title">{t("hub.title")}</h1>
          <p className="nk-sub">{t("hub.sub")}</p>
          <ul className="nk-vitrin-chips" aria-label={t("hub.chipsLabel")}>
            <li><span className="nk-dot nk-dot-b" aria-hidden="true" />{t("labels.method.pythagorean")}</li>
            <li><span className="nk-dot nk-dot-g" aria-hidden="true" />{t("labels.method.chaldean")}</li>
            <li><span className="nk-dot nk-dot-v" aria-hidden="true" />{t("hub.chipMaster")}</li>
          </ul>
        </div>
        <ClassicHeroArt className="nk-vitrin-art" />
      </header>

      <section className="nk-hub-grid" aria-label={t("hub.sectionsLabel")}>
        {TILES.map((tile) => (
          <TiltLink key={tile.href} href={tile.href} className={`nk-tile${tile.feature ? " nk-feature" : ""}`} data-testid={tile.testid}>
            <Emblem name={tile.emblem} className="nk-tile-emblem" />
            <span className="nk-tile-icon"><Icon name={tile.icon} /></span>
            <span className="nk-tile-body">
              <h2 className="nk-tile-title">{t(`hub.tiles.${tile.key}.title`)}</h2>
              <p className="nk-tile-desc">{t(`hub.tiles.${tile.key}.desc`)}</p>
            </span>
            {tile.badge ? <span className="nk-badges"><span className="nk-badge nk-gold">{t(`hub.tiles.${tile.key}.badge`)}</span></span> : null}
            {tile.feature ? <span className="nk-tile-go" aria-hidden="true">→</span> : null}
          </TiltLink>
        ))}
        <div className="nk-card nk-tile nk-wide" data-testid="hub-dogaltas">
          <Emblem name="stone" className="nk-tile-emblem" />
          <span className="nk-tile-icon"><Icon name="gem" /></span>
          <span className="nk-tile-body">
            <h2 className="nk-tile-title">{t("hub.stone.title")}</h2>
            <p className="nk-tile-desc">{t("hub.stone.desc")}</p>
          </span>
          <span className="nk-badges"><span className="nk-badge">{t("hub.stone.badgeSymbolic")}</span><span className="nk-badge nk-ice">{t("hub.stone.badgeWhere")}</span></span>
        </div>
      </section>
    </Shell>
  );
}
