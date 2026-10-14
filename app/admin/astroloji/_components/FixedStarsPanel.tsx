"use client";

/**
 * Sabit yıldızlar — uzman görünümü (2026-10-14).
 *
 *   A. Önemli kavuşumlar (seçili orb içinde) — ilk ekran; kalabalık 43'lük tablo YIĞILMAZ.
 *   B. 43 yıldızın tam kataloğu — arama, burç / parlaklık / grup / doğa süzgeçleri, sıralama; kavuşumu olmayanlar dahil.
 *   C. Yıldız ayrıntısı — yalnız sağlayıcıdan gerçekten gelen alanlar + Yaşam kataloğu (Bayer, takımyıldız, enlem).
 *   D. Orb çipleri — YALNIZ filtre (sağlayıcıdan zaten 3° istendi): 0 yeni istek.
 *
 * Teknik katman kanoniktir. Sağlayıcı metni (kavuşum anlatısı, anahtar kelimeler) yalnız `interpretation` verilirse
 * (yorum yetkisi + görünürlük sunucuda doğrulanmış) gösterilir.
 */

import { useMemo, useState } from "react";
import { ASPECT_GLYPHS, ASPECT_LABELS, BODY_GLYPHS, BODY_LABELS, NODE_TYPE_LABELS, SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { SIGN_IDS, type BodyId, type SignId } from "@/lib/astrology/model/western";
import {
  FIXED_STAR_ORB_OPTIONS,
  fixedStarOrbOf,
  TRADITIONAL_PLANETS,
  type FixedStar,
  type FixedStarContact,
  type FixedStarPointId,
  type FixedStarsInterpretation,
  type FixedStarsTechnical,
} from "@/lib/astrology/model/westernFixedStars";
import {
  FIXED_STAR_CATALOG,
  FIXED_STAR_FAR_LAT,
  fixedStarName,
  fixedStarNatureLabel,
  magnitudeClass,
  starKeywordTr,
  TRADITIONAL_PLANET_LABELS,
} from "@/lib/astrology/labels/fixedStars";
import { contactsInOrb, contactText, DEFAULT_STAR_FILTER, filterStars, isFarFromEcliptic, starKeywords, type StarFilter } from "../_lib/fixedStarsView";

const pointLabel = (p: FixedStarPointId) => (p === "ascendant" ? "Yükselen (ASC)" : p === "midheaven" ? "Tepe noktası (MC)" : BODY_LABELS[p as BodyId]);
const pointGlyph = (p: FixedStarPointId) => (p === "ascendant" ? "ASC" : p === "midheaven" ? "MC" : BODY_GLYPHS[p as BodyId]);
/** Astrodienst Astrowiki: ışıklar (Güneş, Ay) ve ASC/MC ile kavuşumlar özellikle önemlidir → görsel vurgu (sıra orb'a göre kalır). */
const PRIORITY_POINTS = new Set<FixedStarPointId>(["sun", "moon", "ascendant", "midheaven"]);
const orbTr = (v: number) => `${v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}°`;
const latTr = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
const magTr = (v: number) => v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StarPos({ s }: { s: Pick<FixedStar, "sign" | "degreeInSign"> }) {
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1" aria-hidden>
        {SIGN_GLYPHS[s.sign]}
      </span>
      {SIGN_LABELS[s.sign]} {formatDegree(s.degreeInSign)}
    </span>
  );
}

function Badges({ id }: { id: string }) {
  const c = FIXED_STAR_CATALOG[id];
  return (
    <span className="inline-flex flex-wrap gap-1">
      {c?.royal && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">Kraliyet</span>}
      {c?.behenian && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-900">Behenian</span>}
      {isFarFromEcliptic(id) && (
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-900" title={`Ekliptik enlemi ±${FIXED_STAR_FAR_LAT}°'den büyük: boylam kavuşumu bir izdüşümdür.`}>
          Ekliptiğe uzak
        </span>
      )}
    </span>
  );
}

function StarDetail({ star, contacts, orb, interp }: { star: FixedStar; contacts: FixedStarContact[]; orb: number; interp: FixedStarsInterpretation | null }) {
  const cat = FIXED_STAR_CATALOG[star.id];
  const mine = contacts.filter((c) => c.star === star.id);
  const kws = starKeywords(interp, star.id);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800" data-testid="fs-star-detail">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Bayer:</dt>
          <dd>{cat?.bayer ?? "—"}</dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Takımyıldız:</dt>
          <dd>{cat?.constellation ?? "—"}</dd>
        </div>
        {cat && cat.altNames.length > 0 && (
          <div className="flex flex-wrap gap-1 sm:col-span-2">
            <dt className="text-slate-500">Diğer adlar:</dt>
            <dd className="min-w-0 break-words">{cat.altNames.join(" · ")}</dd>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Konum:</dt>
          <dd>
            <StarPos s={star} /> <span className="text-slate-500">({star.longitude.toFixed(4)}°)</span>
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Parlaklık (kadir):</dt>
          <dd>
            {magTr(star.magnitude)} · {magnitudeClass(star.magnitude)}
          </dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Geleneksel doğa:</dt>
          <dd>{fixedStarNatureLabel(star.nature)}</dd>
        </div>
        <div className="flex flex-wrap gap-1">
          <dt className="text-slate-500">Ekliptik enlem (J2000):</dt>
          <dd>{cat ? latTr(cat.latJ2000) : "—"}</dd>
        </div>
      </dl>
      {isFarFromEcliptic(star.id) && (
        <p className="rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-900">
          Bu yıldız ekliptikten {cat ? Math.abs(cat.latJ2000).toFixed(0) : "?"}° uzaktadır. Boylam kavuşumu bir izdüşümdür; gökyüzünde gezegenle yan yana görünmez. Profesyonel
          uygulamada bu tür yıldızlar için paran yöntemi tercih edilir (bu ekranda paran hesaplanmaz).
        </p>
      )}
      {kws.length > 0 && (
        <p className="min-w-0 break-words">
          <span className="text-slate-500">Anahtar kelimeler (Roxy): </span>
          {kws.map((k) => starKeywordTr(k)).join(", ")}
        </p>
      )}
      <div>
        <p className="text-slate-500">Natal temaslar (sağlayıcı sorgusu 3°):</p>
        {mine.length === 0 ? (
          <p className="text-slate-600">Bu yıldızın 3° içinde natal teması yok.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1.5">
            {mine.map((c) => {
              const t = contactText(interp, c.star, c.point);
              const inside = c.orb <= orb + 1e-9;
              return (
                <li key={c.point} className={`rounded-md border px-2 py-1.5 ${inside ? "border-amber-300 bg-white" : "border-slate-200 bg-white/60 text-slate-500"}`}>
                  <span className="font-medium">
                    {ASPECT_GLYPHS.conjunction} {ASPECT_LABELS.conjunction} · {pointGlyph(c.point)} {pointLabel(c.point)}
                  </span>{" "}
                  · orb {orbTr(c.orb)} {!inside && <span className="text-xs">(seçili orb dışında)</span>}
                  {t && <p className="mt-1 break-words text-slate-700">{t}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function FixedStarsPanel({ t, options, interpretation = null }: { t: FixedStarsTechnical; options: Record<string, unknown>; interpretation?: FixedStarsInterpretation | null }) {
  const savedOrb = fixedStarOrbOf(options.orb);
  const [orb, setOrb] = useState<number>(savedOrb);
  const [filter, setFilter] = useState<StarFilter>(DEFAULT_STAR_FILTER);
  const [open, setOpen] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const inOrb = useMemo(() => contactsInOrb(t.contacts, orb), [t.contacts, orb]);
  const starById = useMemo(() => new Map(t.stars.map((s) => [s.id, s])), [t.stars]);
  const list = useMemo(() => filterStars(t.stars, t.contacts, orb, filter), [t.stars, t.contacts, orb, filter]);
  const contactCount = (id: string) => inOrb.filter((c) => c.star === id).length;
  const set = <K extends keyof StarFilter>(k: K, v: StarFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));
  const filtered = JSON.stringify(filter) !== JSON.stringify(DEFAULT_STAR_FILTER);
  const sel = "min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="fs-panel">
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm text-slate-700">
          <strong>Ekliptik boylam kavuşumu</strong> · Tropikal · {t.stars.length} yıldız · Ay düğümü: {NODE_TYPE_LABELS[t.nodeType] ?? t.nodeType}
        </p>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kavuşum orbu">
          <span className="mr-1 text-sm text-slate-600">Orb:</span>
          {FIXED_STAR_ORB_OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={orb === o}
              onClick={() => setOrb(o)}
              className={`min-h-[36px] rounded-full border px-3 text-sm ${orb === o ? "border-amber-500 bg-amber-100 font-semibold text-amber-900" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {o.toLocaleString("tr-TR")}°
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Orb yalnız filtredir: yıldız verisi sağlayıcıdan 3° ile bir kez alındı, orbu değiştirmek yeni hesaplama yapmaz.
          {orb !== savedOrb && ` Kayıt ve Word/PDF raporu seçenekteki orbu (${savedOrb.toLocaleString("tr-TR")}°) kullanır.`}
          {" "}Paran ve heliakal doğuş bu teknikte hesaplanmaz.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="fs-contacts-h" data-testid="fs-contacts">
        <div className="border-b border-slate-100 px-3 py-2">
          <h4 id="fs-contacts-h" className="text-sm font-semibold text-slate-700">
            Önemli sabit yıldız kavuşumları (orb ≤ {orb.toLocaleString("tr-TR")}°) · {inOrb.length}
          </h4>
        </div>
        {inOrb.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-600">Seçili orb içinde kavuşum yok. Orbu genişletebilir veya aşağıdaki katalogdan tüm yıldızları inceleyebilirsiniz.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {inOrb.map((c) => {
              const s = starById.get(c.star);
              const text = contactText(interpretation, c.star, c.point);
              return (
                <li key={`${c.star}|${c.point}`} className="flex min-w-0 flex-col gap-1 px-3 py-2.5" data-testid="fs-contact">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <button
                      type="button"
                      className="inline-flex min-h-[36px] items-center text-left font-semibold text-slate-900 underline decoration-amber-400 decoration-2 underline-offset-2"
                      onClick={() => {
                        setShowCatalog(true);
                        setOpen(c.star);
                        setFilter({ ...DEFAULT_STAR_FILTER, query: fixedStarName(c.star) });
                      }}
                    >
                      {fixedStarName(c.star)}
                    </button>
                    <span className="text-slate-700">
                      {ASPECT_GLYPHS.conjunction} {ASPECT_LABELS.conjunction} · <span aria-hidden>{pointGlyph(c.point)}</span> {pointLabel(c.point)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">orb {orbTr(c.orb)}</span>
                    {PRIORITY_POINTS.has(c.point) && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900" title="Işıklar (Güneş, Ay) ve Yükselen/MC ile kavuşumlar geleneksel olarak en güçlü kabul edilir.">
                        Öncelikli nokta
                      </span>
                    )}
                    <Badges id={c.star} />
                  </div>
                  {s && (
                    <p className="text-xs text-slate-600">
                      <StarPos s={s} /> · kadir {magTr(s.magnitude)} · doğa: {fixedStarNatureLabel(s.nature)}
                    </p>
                  )}
                  {text && <p className="break-words text-sm text-slate-700">{text}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="fs-catalog-h" data-testid="fs-catalog">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <h4 id="fs-catalog-h" className="text-sm font-semibold text-slate-700">
            Sabit yıldız kataloğu · {t.stars.length} yıldızın tamamı
          </h4>
          <button
            type="button"
            aria-expanded={showCatalog}
            onClick={() => setShowCatalog((v) => !v)}
            className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
            data-testid="fs-catalog-toggle"
          >
            {showCatalog ? "Kataloğu gizle" : `${t.stars.length} yıldızı göster`}
          </button>
        </div>
        {showCatalog && (
          <div className="flex flex-col gap-2 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <input
                type="search"
                value={filter.query}
                onChange={(e) => set("query", e.target.value)}
                placeholder="Yıldız, Bayer adı, takımyıldız…"
                aria-label="Yıldız ara"
                className={sel}
              />
              <select className={sel} aria-label="Burç" value={filter.sign} onChange={(e) => set("sign", e.target.value as SignId | "")}>
                <option value="">Tüm burçlar</option>
                {SIGN_IDS.map((s) => (
                  <option key={s} value={s}>
                    {SIGN_LABELS[s]}
                  </option>
                ))}
              </select>
              <select className={sel} aria-label="Parlaklık" value={filter.maxMagnitude === null ? "" : String(filter.maxMagnitude)} onChange={(e) => set("maxMagnitude", e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">Tüm parlaklıklar</option>
                <option value="0.5">Çok parlak (kadir &lt; 0,5)</option>
                <option value="1.5">1. kadir (&lt; 1,5)</option>
                <option value="2.5">2. kadir ve daha parlak (&lt; 2,5)</option>
              </select>
              <select className={sel} aria-label="Grup" value={filter.group} onChange={(e) => set("group", e.target.value as StarFilter["group"])}>
                <option value="">Tüm gruplar</option>
                <option value="royal">Kraliyet yıldızları (4)</option>
                <option value="behenian">Behenian yıldızları</option>
                <option value="far">Ekliptiğe uzak (|enlem| &gt; {FIXED_STAR_FAR_LAT}°)</option>
              </select>
              <select className={sel} aria-label="Geleneksel doğa" value={filter.nature} onChange={(e) => set("nature", e.target.value)}>
                <option value="">Tüm doğalar</option>
                {TRADITIONAL_PLANETS.map((p) => (
                  <option key={p} value={p}>
                    {TRADITIONAL_PLANET_LABELS[p]} doğalı
                  </option>
                ))}
              </select>
              <select className={sel} aria-label="Sıralama" value={filter.sort} onChange={(e) => set("sort", e.target.value as StarFilter["sort"])}>
                <option value="zodiac">Zodyak sırası</option>
                <option value="brightness">Parlaklık</option>
                <option value="name">Ad</option>
                <option value="orb">En sıkı kavuşum</option>
              </select>
            </div>
            <label className="flex min-h-[36px] items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={filter.onlyContacts} onChange={(e) => set("onlyContacts", e.target.checked)} /> Yalnız seçili orbda kavuşumu olanlar
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span data-testid="fs-catalog-count">
                {list.length} / {t.stars.length} yıldız gösteriliyor
              </span>
              {filtered && (
                <button type="button" className="min-h-[32px] rounded-md px-2 text-amber-800 underline" onClick={() => setFilter(DEFAULT_STAR_FILTER)}>
                  Süzgeçleri temizle
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {list.map((s) => {
                const n = contactCount(s.id);
                const isOpen = open === s.id;
                return (
                  <li key={s.id} className="min-w-0 rounded-lg border border-slate-200" data-testid="fs-star-row" data-star={s.id}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : s.id)}
                      className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm"
                    >
                      <span className="min-w-[8rem] font-semibold text-slate-900">{fixedStarName(s.id)}</span>
                      <span className="text-slate-700">
                        <StarPos s={s} />
                      </span>
                      <span className="text-slate-600">kadir {magTr(s.magnitude)}</span>
                      <span className="text-slate-600">{fixedStarNatureLabel(s.nature)}</span>
                      {n > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{n} kavuşum</span>}
                      <Badges id={s.id} />
                      <span className="ml-auto text-slate-400" aria-hidden>
                        {isOpen ? "▴" : "▾"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-2 pb-2">
                        <StarDetail star={s} contacts={t.contacts} orb={orb} interp={interpretation} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {list.length === 0 && <p className="text-sm text-slate-600">Süzgeçlere uyan yıldız yok.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

export default FixedStarsPanel;
