"use client";

/**
 * Natal "Semboller" rehberi (2026-11-04) — yeni başlayanlar için kısa, TEKNİK tanımlar. Yorum / astrolojik iddia içermez:
 * gök cismi ve noktalar astronomik / hesap tanımıyla, açılar açı değeriyle anlatılır. Profesyonel kullanıcıyı yormamak için
 * ayrı sekmededir (çarkta yalnız ipucu). Haritaya özgü bilgiler (düğüm türü, Şans Noktası gündüz/gece) teknik veriden okunur.
 */

import type { ReactNode } from "react";
import type { AspectType, BodyId, NatalTechnical, SignId } from "@/lib/astrology/model/western";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import {
  ASPECT_GLYPHS,
  ASPECT_LABELS,
  BODY_GLYPHS,
  BODY_LABELS,
  ELEMENT_LABELS,
  MODALITY_LABELS,
  NODE_TYPE_LABELS,
  SIGN_ELEMENT,
  SIGN_GLYPHS,
  SIGN_LABELS,
} from "@/lib/astrology/labels/tr";
import styles from "./natalWheel.module.css";

const BODY_TEXT: Record<BodyId, string> = {
  sun: "Doğum anında Güneş'in zodyaktaki konumu. Güneş zodyağı yaklaşık bir yılda dolaşır (günde ~1°).",
  moon: "Ay'ın konumu. En hızlı hareket eden gök cismidir: günde yaklaşık 12–15°, bu yüzden doğum saati Ay derecesini belirgin etkiler.",
  mercury: "Güneş'e en yakın gezegen. Dünya'dan bakıldığında Güneş'ten en fazla ~28° uzaklaşır.",
  venus: "Dünya'dan bakıldığında Güneş'ten en fazla ~47° uzaklaşır.",
  mars: "Zodyağı yaklaşık 2 yılda (687 gün) dolaşır.",
  jupiter: "Zodyağı yaklaşık 12 yılda dolaşır.",
  saturn: "Zodyağı yaklaşık 29,5 yılda dolaşır; çıplak gözle görülen en uzak klasik gezegen.",
  uranus: "Zodyağı yaklaşık 84 yılda dolaşır.",
  neptune: "Zodyağı yaklaşık 165 yılda dolaşır.",
  pluto: "Zodyağı yaklaşık 248 yılda dolaşır (yörüngesi çok basık olduğundan burçlarda kalma süresi değişkendir).",
  north_node: "Ay yörüngesinin ekliptiği güneyden kuzeye kestiği nokta (hesaplanan nokta, gök cismi değildir).",
  south_node: "Kuzey Ay Düğümü'nün tam karşısı (her zaman 180°).",
  chiron: "Satürn ile Uranüs yörüngeleri arasında dolanan küçük gök cismi (2060 Chiron); zodyağı yaklaşık 50 yılda dolaşır.",
  lilith: "Kara Ay Lilith: Ay yörüngesinin Dünya'dan en uzak noktası (apoje). Bu sistemde ortalama (mean) hesap kullanılır.",
};

const ASPECT_DEG: Record<AspectType, number> = {
  conjunction: 0,
  semi_sextile: 30,
  semi_square: 45,
  sextile: 60,
  square: 90,
  trine: 120,
  sesquiquadrate: 135,
  quincunx: 150,
  opposition: 180,
};

const MAJOR_ORDER: AspectType[] = ["conjunction", "sextile", "square", "trine", "opposition"];
const MINOR_ORDER: AspectType[] = ["semi_sextile", "semi_square", "sesquiquadrate", "quincunx"];

const SIGN_MODALITY: Record<SignId, "cardinal" | "fixed" | "mutable"> = {
  aries: "cardinal",
  cancer: "cardinal",
  libra: "cardinal",
  capricorn: "cardinal",
  taurus: "fixed",
  leo: "fixed",
  scorpio: "fixed",
  aquarius: "fixed",
  gemini: "mutable",
  virgo: "mutable",
  sagittarius: "mutable",
  pisces: "mutable",
};

const ELEMENT_INK: Record<string, string> = { fire: "#dc2626", earth: "#15803d", air: "#ca8a04", water: "#2563eb" };

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{title}</h4>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

function Row({ glyph, name, children, glyphInk }: { glyph: ReactNode; name: string; children: ReactNode; glyphInk?: string }) {
  return (
    <li className="flex gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className={`${styles.symbol} w-8 shrink-0 text-center text-xl leading-6`} style={glyphInk ? { color: glyphInk } : undefined} aria-hidden="true">
        {glyph}
      </span>
      <span className="min-w-0 text-sm leading-6 text-slate-700">
        <strong className="font-semibold text-slate-900">{name}</strong>
        <span className="text-slate-400"> — </span>
        {children}
      </span>
    </li>
  );
}

export default function NatalSymbolGuide({ technical }: { technical: NatalTechnical }) {
  const sect = technical.points?.partOfFortune?.sect ?? null;
  return (
    <div className="flex flex-col gap-3" data-testid="natal-symbol-guide">
      <p className="rounded-lg border border-slate-200 bg-[#fbfaf7] px-3 py-2 text-sm leading-6 text-slate-600">
        Bu rehber çarktaki işaretlerin <strong>ne olduğunu</strong> kısaca anlatır; yorum değildir. Çarkta bir sembolün üzerine
        gelince (dokunmatikte basılı tutunca) adı ve tam derecesi görünür.
      </p>

      <Block title="Gezegenler ve noktalar">
        <ul>
          {(Object.keys(BODY_TEXT) as BodyId[]).map((id) => (
            <Row key={id} glyph={BODY_GLYPHS[id]} name={BODY_LABELS[id]}>
              {BODY_TEXT[id]}
              {id === "north_node" ? ` Bu haritada: ${NODE_TYPE_LABELS[technical.nodeType] ?? technical.nodeType}.` : ""}
            </Row>
          ))}
          <Row glyph="⊗" name="Şans Noktası" glyphInk="#0f766e">
            Yükselen, Güneş ve Ay&apos;dan hesaplanan nokta (gök cismi değildir). Gündüz doğumunda Yükselen + Ay − Güneş, gece doğumunda
            Yükselen + Güneş − Ay formülü kullanılır.
            {sect ? ` Bu harita: ${sect === "day" ? "gündüz" : "gece"} doğumu.` : ""}
          </Row>
          <Row glyph="Vx" name="Vertex" glyphInk="#0f766e">
            Ana dikey dairenin (doğu–batı yönündeki dikey daire) ekliptiği batı tarafta kestiği nokta; doğum yerinin enlemine ve saatine
            bağlıdır.
          </Row>
        </ul>
      </Block>

      <Block title="Açısal noktalar (eksenler)">
        <ul>
          <Row glyph="ASC" name="Yükselen">
            Doğum anında doğu ufkunda yükselen zodyak derecesi. Çoğu ev sisteminde 1. evin başlangıcıdır.
          </Row>
          <Row glyph="DSC" name="Alçalan">
            Batı ufkundaki derece; Yükselen&apos;in tam karşısı (180°).
          </Row>
          <Row glyph="MC" name="Tepe Noktası (Medium Coeli)">
            Ekliptiğin yerel meridyeni (güney yönü) kestiği derece. Placidus, Koch gibi sistemlerde 10. evin başlangıcıdır.
          </Row>
          <Row glyph="IC" name="Dip Noktası (Imum Coeli)">
            MC&apos;nin tam karşısı (180°).
          </Row>
        </ul>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Tam Burç ve Eşit Ev sistemlerinde ev başlangıçları eksenlerle çakışmayabilir; Natal çarkında gerçek ASC–DSC ve MC–IC ekseni
          kalın çizgiyle ayrıca gösterilir.
        </p>
      </Block>

      <Block title="Burçlar">
        <ul className="grid gap-x-4 sm:grid-cols-2">
          {SIGN_IDS.map((s, i) => (
            <Row key={s} glyph={SIGN_GLYPHS[s]} name={SIGN_LABELS[s]} glyphInk={ELEMENT_INK[SIGN_ELEMENT[s]]}>
              {i * 30}°–{i * 30 + 30}° · {ELEMENT_LABELS[SIGN_ELEMENT[s]]} · {MODALITY_LABELS[SIGN_MODALITY[s]]}
            </Row>
          ))}
        </ul>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Zodyak 12 eşit 30° dilimdir (tropikal zodyak; 0° Koç = ilkbahar noktası). Burç rengi elementini gösterir.
        </p>
      </Block>

      <Block title="Açılar">
        <ul>
          {[...MAJOR_ORDER, ...MINOR_ORDER].map((t) => (
            <Row key={t} glyph={ASPECT_GLYPHS[t]} name={ASPECT_LABELS[t]}>
              İki nokta arasındaki {ASPECT_DEG[t]}° açı.
              {MAJOR_ORDER.includes(t) ? " Başlıca açı: Temel görünümde de çizilir." : " Küçük açı: yalnız Profesyonel görünümde, kesik çizgiyle."}
            </Row>
          ))}
        </ul>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Çizgi renkleri sistemin açı türü sınıfıdır: mavi uyumlu, kırmızı zorlayıcı, gri nötr. Kavuşumdaki iki nokta çarkta üst üste
          olduğundan kavuşum çizgisi görünmeyebilir; bütün açılar Açılar sekmesinde listelenir. Kuzey–Güney Düğüm karşıtlığı her haritada
          tanım gereği 180° olduğundan çarka çizilmez.
        </p>
      </Block>

      <Block title="Orb, retro ve derece gösterimi">
        <ul>
          <Row glyph="orb" name="Orb">
            Gerçek açının tam açı değerinden farkı. Örnek: iki gezegen arasında 93° varsa kare (90°) açı, orb 3°. Hangi orb&apos;a kadar açı
            sayılacağı hesaplama kaynağının kuralıdır; bu ekran orb&apos;u değiştirmez. Profesyonel görünümde orb küçüldükçe çizgi kalınlaşır.
          </Row>
          <Row glyph="℞" name="Retro (geri hareket)" glyphInk="#be123c">
            Gezegen Dünya&apos;dan bakıldığında zodyakta geri yönde ilerliyor görünür. Bu görünür bir harekettir; gezegenin yörüngedeki
            yönü değişmez.
          </Row>
          <Row glyph="°′" name="Derece ve dakika">
            1° = 60′ (yay dakikası). Dereceler efemeris geleneğiyle dakika kesilerek yazılır: 29°59,9′ → 29°59′ (sonraki burca
            yuvarlanmaz). Çarktaki cetvelde her çentik 1°, orta çentik 5°, uzun çentik 10°dir.
          </Row>
        </ul>
      </Block>
    </div>
  );
}
