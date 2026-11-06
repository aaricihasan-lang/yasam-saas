"use client";

/**
 * 02.11.2026 — KLASİK ASALET ve ALMUTEN (#644) teknik görünümü (owner GÖRSEL PASS prototipi). Hesap YAPILMAZ; yalnız sunucunun
 * birleştirdiği teknik katman gösterilir. Bölümler: gezegen puanları (esas + arızi + toplam), kabuller, ev başı almutenleri, harita
 * almuteni (Yunanlar CA s. 532 STANDART; diğerleri ALTERNATİF) + Lord of the Geniture (YORUM), kaynaklar. Aynı bileşen canlı sonuç
 * ve kayıtlı analiz (arşiv) görünümünde kullanılır.
 */
import { useState } from "react";
import {
  DIGNITY_PLANET_LABELS as P,
  DIGNITY_SCHOOL_LABELS,
  ESSENTIAL_LABELS,
  FIGURE_POINT_LABELS,
  FIGURE_PRESET_SHORT,
  RECEPTION_LABELS,
  SIGN_ANGLE_LABELS,
  SYZYGY_POINT_NOTE,
  accidentalLabel,
  dignityLon,
  signedPoints,
  type ClassicalDignitiesTechnical,
} from "@/lib/astrology/model/westernClassicalDignities";
import { NATAL_HOUSE_SYSTEM_LABELS } from "@/lib/astrology/labels/tr";
import { ProTable, pt as s } from "./proTechniqueUi";

type Sub = "gezegen" | "kabul" | "ev" | "harita" | "kaynak";
const SUBS: [Sub, string][] = [
  ["gezegen", "Gezegen puanları"],
  ["kabul", "Kabuller"],
  ["ev", "Ev başı almutenleri"],
  ["harita", "Harita almuteni"],
  ["kaynak", "Kaynaklar"],
];
const ESS_PLUS = new Set(["domicile", "exaltation", "triplicity", "term", "face"]);

function Signed({ n }: { n: number | null | undefined }) {
  if (n === null || n === undefined) return <span className={s.muted}>—</span>;
  return <span className={n > 0 ? s.pos : n < 0 ? s.neg : undefined}>{signedPoints(n)}</span>;
}
const tagCls = (points: number | null, positiveKey?: boolean) => `${s.tag} ${points === null ? "" : points < 0 ? s.tagNeg : points > 0 || positiveKey ? s.tagPos : ""}`;

export function ClassicalDignitiesPanel({ t }: { t: ClassicalDignitiesTechnical }) {
  const [sub, setSub] = useState<Sub>("gezegen");
  const A = t.dignities;
  const sectLabel = t.sect.day ? "Gündüz haritası" : "Gece haritası";
  const ranked = A.planets.filter((p) => p.fortitude !== null);
  const best = [...ranked].sort((a, b) => (b.fortitude as number) - (a.fortitude as number))[0];
  const worst = [...ranked].sort((a, b) => (a.fortitude as number) - (b.fortitude as number))[0];

  let body: React.ReactNode = null;
  if (sub === "gezegen") {
    body = (
      <>
        <div className={s.kpis}>
          <div className={s.kpi}>
            <span className={s.kpiK}>Harita</span>
            <span className={s.kpiV}>{sectLabel}</span>
            <span className={s.kpiS}>Üçlü yöneticileri buna göre seçilir.</span>
          </div>
          {best && (
            <div className={s.kpi}>
              <span className={s.kpiK}>En güçlü</span>
              <span className={s.kpiV}>
                {P[best.planet]} <Signed n={best.fortitude} />
              </span>
              <span className={s.kpiS}>Esas + arızi toplam</span>
            </div>
          )}
          {worst && (
            <div className={s.kpi}>
              <span className={s.kpiK}>En zayıf</span>
              <span className={s.kpiV}>
                {P[worst.planet]} <Signed n={worst.fortitude} />
              </span>
              <span className={s.kpiS}>Esas + arızi toplam</span>
            </div>
          )}
          <div className={s.kpi}>
            <span className={s.kpiK}>Şans Noktası</span>
            <span className={s.kpiV}>{dignityLon(A.partOfFortune.lon)}</span>
            <span className={s.kpiS}>{t.sect.day ? "Gündüz formülü" : "Gece formülü"} ({DIGNITY_SCHOOL_LABELS[A.school.id]})</span>
          </div>
        </div>
        <ProTable
          head={["Gezegen", "Konum", "Ev", "Esas asalet", "Esas", "Arızi asalet", "Arızi", "Toplam"]}
          wrap={[3, 5]}
          testId="astro-dignities-planets"
          rows={A.planets.map((p) => ({
            key: p.planet,
            cells: [
              <b key="p">{P[p.planet]}</b>,
              dignityLon(p.essential.lon),
              p.house === null ? "—" : `${p.house}. ev`,
              <div key="e" className={s.tags}>
                {p.essential.reasons.map((r, i) => (
                  <span key={i} className={tagCls(r.points, ESS_PLUS.has(r.key))}>
                    {ESSENTIAL_LABELS[r.key] ?? r.key} {signedPoints(r.points)}
                  </span>
                ))}
              </div>,
              <Signed key="es" n={p.essential.score} />,
              p.accidental ? (
                <div key="a" className={s.tags}>
                  {p.accidental.items.map((it, i) => (
                    <span key={i} className={tagCls(it.points)} title={it.verified ? undefined : "Kaynakta teyit edilmedi; toplama katılmaz"}>
                      {accidentalLabel(it.key)} {signedPoints(it.points)}
                    </span>
                  ))}
                </div>
              ) : (
                <span key="a" className={s.muted}>
                  —
                </span>
              ),
              <Signed key="ac" n={p.accidental?.total ?? null} />,
              <b key="f">
                <Signed n={p.fortitude} />
              </b>,
            ],
          }))}
        />
      </>
    );
  } else if (sub === "kabul") {
    const list = A.receptions.all.filter((r) => r.type !== "none");
    body = (
      <>
        {list.length === 0 ? (
          <p className={s.small}>Bu haritada klasik gezegenler arasında kabul yok.</p>
        ) : (
          <ProTable
            head={["Çift", "Kabul", "Kabul eden (b→a)", "Kabul eden (a→b)", "Burç açısı"]}
            wrap={[2, 3]}
            full={[2, 3, 4]}
            long={[]}
            testId="astro-dignities-receptions"
            rows={list.map((r) => {
              const ab = r.bReceivesA.map((k) => ESSENTIAL_LABELS[k] ?? k).join(", ");
              const ba = r.aReceivesB.map((k) => ESSENTIAL_LABELS[k] ?? k).join(", ");
              return {
                key: `${r.a}-${r.b}`,
                cells: [
                  <b key="c">
                    {P[r.a]} ↔ {P[r.b]}
                  </b>,
                  r.type === "mutual" ? <span key="k" className={s.pass}>{RECEPTION_LABELS[r.type]}</span> : RECEPTION_LABELS[r.type],
                  ab ? `${P[r.b]} → ${P[r.a]}: ${ab}` : "—",
                  ba ? `${P[r.a]} → ${P[r.b]}: ${ba}` : "—",
                  r.aspect.aversion ? (
                    <span key="x" className={s.muted}>
                      açı yok (aversion)
                    </span>
                  ) : (
                    <span key="x">
                      {SIGN_ANGLE_LABELS[r.aspect.signAngle as number] ?? "—"}
                      {r.aspect.withinMoieties ? <span className={s.pos}> · orb içinde</span> : <span className={s.muted}> · orb dışı</span>}
                    </span>
                  ),
                ],
              };
            })}
          />
        )}
        <p className={s.small}>Kabul: bir gezegen, diğerinin bulunduğu yerde asalet sahibiyse onu &quot;kabul eder&quot;. Karşılıklı = iki yönlü; karma = iki yönlü ama farklı asalet türleriyle.</p>
      </>
    );
  } else if (sub === "ev") {
    body = A.cuspAlmutens ? (
      <>
        <ProTable
          head={["Ev", "Ev başı", "Almuten", "Puan", "Diğer adaylar"]}
          wrap={[4]}
          testId="astro-dignities-cusps"
          rows={A.cuspAlmutens.items.map((c) => ({
            key: String(c.house),
            cells: [
              <b key="h">{c.house}. ev</b>,
              dignityLon(c.lon),
              <span key="w">
                <b>{c.winners.map((w) => P[w]).join(" = ")}</b>
                {c.tie ? (
                  <>
                    {" "}
                    <span className={s.yorum}>eşitlik</span>
                  </>
                ) : null}
              </span>,
              String(c.max),
              c.scores
                .slice(0, 4)
                .map((x) => `${P[x.planet]} ${x.total}`)
                .join(" · "),
            ],
          }))}
        />
        <p className={s.small}>Puanlar: burç yöneticisi 5, yücelme 4, üçlü 3, terim 2, yüz 1 (CA s. 115). Ev sistemi: {NATAL_HOUSE_SYSTEM_LABELS[t.houseSystem] ?? t.houseSystem}.</p>
      </>
    ) : (
      <p className={s.note}>Ev başı almutenleri bu sonuçta hesaplanamadı (ev başları yok).</p>
    );
  } else if (sub === "harita") {
    const lg = A.lordOfGenitureLilly;
    body = (
      <>
        <div className={`${s.kpis} ${s.kpisFigs}`}>
          {A.figureAlmutens.map((f) => (
            <div key={f.preset} className={s.kpi} data-testid={`astro-figure-${f.preset}`}>
              <span className={s.kpiK}>{f.standard ? <span className={s.std}>STANDART</span> : <span className={s.yorum}>ALTERNATİF</span>}</span>
              <span className={s.kpiV}>{f.winners && f.winners.length ? `${f.winners.map((w) => P[w]).join(" = ")} · ${f.max}` : "—"}</span>
              <span className={s.kpiS}>
                <b>{FIGURE_PRESET_SHORT[f.preset] ?? f.preset}</b>
                <br />
                Noktalar: {f.points.map((p) => FIGURE_POINT_LABELS[p.id] ?? p.id).join(", ")}
                {f.missing.length ? (
                  <>
                    <br />
                    Eksik nokta: {f.missing.map((m) => FIGURE_POINT_LABELS[m] ?? m).join(", ")}
                  </>
                ) : null}
                {f.note ? (
                  <>
                    <br />
                    {f.note}
                  </>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        {t.syzygy && A.figureAlmutens.some((f) => f.points.some((p) => p.id === "prenatal_syzygy")) && <p className={s.small}>{SYZYGY_POINT_NOTE}</p>}
        {lg && lg.winners ? (
          <>
            <div className={s.subH}>
              Lord of the Geniture (Lilly) <span className={s.yorum}>YORUM</span>
            </div>
            <ProTable
              head={["Gezegen", "Esas", "Arızi", "Toplam"]}
              testId="astro-dignities-log"
              rows={lg.ranking.map((r) => ({ key: r.planet, cells: [<b key="p">{P[r.planet]}</b>, <Signed key="e" n={r.essential} />, <Signed key="a" n={r.accidental} />, <b key="t"><Signed n={r.total} /></b>] }))}
            />
            <p className={s.note}>{lg.note}</p>
          </>
        ) : (
          <p className={s.note}>Lord of the Geniture bu ekolde hesaplanmaz (puan yöntemi yok) ya da arızi veri eksik.</p>
        )}
      </>
    );
  } else {
    body = (
      <>
        <div className={s.subH}>{A.school.label}</div>
        <ProTable
          head={["Kaynak", "İçerik", "Teyit"]}
          wrap={[1]}
          testId="astro-dignities-sources"
          rows={A.school.sources.map((x) => ({
            key: x.id,
            cells: [
              <b key="i">{x.id}</b>,
              <span key="t">
                {x.text}
                {x.note ? (
                  <>
                    <br />
                    <span className={s.muted}>{x.note}</span>
                  </>
                ) : null}
              </span>,
              x.verified ? <span key="v" className={s.pos}>Teyitli</span> : <span key="v" className={s.neg}>Teyitsiz</span>,
            ],
          }))}
        />
        {A.warnings.map((w, i) => (
          <p key={i} className={s.note}>
            {w}
          </p>
        ))}
      </>
    );
  }

  return (
    <div className={s.root} data-testid="astro-dignities-panel">
      <div className={s.chips}>
        <span className={s.chip}>{DIGNITY_SCHOOL_LABELS[A.school.id]}</span>
        <span className={s.chip}>{sectLabel}</span>
        <span className={s.chip}>Ev sistemi: {NATAL_HOUSE_SYSTEM_LABELS[t.houseSystem] ?? t.houseSystem}</span>
        <span className={`${s.chip} ${s.chipLav}`}>Yerel hesap</span>
      </div>
      {t.sect.nearHorizon && <p className={s.note}>Güneş doğum anında ufka çok yakın ({t.sect.sunAltitude.toFixed(2).replace(".", ",")}°): gündüz/gece ayrımı doğum saatindeki küçük bir farkla değişebilir.</p>}
      <div className={s.subtabs} role="group" aria-label="Sonuç bölümü">
        {SUBS.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={sub === v} onClick={() => setSub(v)} data-testid={`astro-dignities-sub-${v}`}>
            {l}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}
