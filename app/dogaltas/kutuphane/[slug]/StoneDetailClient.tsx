"use client";

/**
 * Taş ayrıntısı (uzman + owner önizleme). İçerik kaynağı seçici: varsayılan gösterim (alan başına çözülmüş katman),
 * Doğrulanmış Türkçe çeviri, Kaynak metin (Türkçe), Kaynak metin (İngilizce). Tüm metin çalışma anında API'den gelir.
 * Uzmana iç yönetim durumu (taslak / eskimiş / sürüm no) gösterilmez.
 */

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  STONE_LIBRARY_DISPLAY_FIELDS,
  STONE_LIBRARY_DISPLAY_LABEL_TR,
  type StoneLibraryDisplayField,
  type StoneLibraryStoneDoc,
} from "@/lib/stone-library/contract";
import { viewerGet } from "../_shared/api";
import { AuthImage } from "../_shared/AuthImage";
import { FACET_LABEL, FACET_ORDER, FIELD_LABEL, formatHardness, monthName, splitKeywords } from "../_shared/labels";
import { ModuleNav, NotFoundState } from "../LibraryClient";
import s from "../kutuphane.module.css";

type Mode = "default" | "verified" | "tr" | "en";
type Block = { key: string; label: string | null; text: string; tag: string; verified?: boolean };

const MODES: { key: Mode; label: string }[] = [
  { key: "default", label: "Önerilen gösterim" },
  { key: "verified", label: "Doğrulanmış Türkçe çeviri" },
  { key: "tr", label: "Kaynak metin (Türkçe)" },
  { key: "en", label: "Kaynak metin (İngilizce)" },
];

function blocksFor(item: StoneLibraryStoneDoc, f: StoneLibraryDisplayField, mode: Mode): { blocks: Block[]; note: string | null } {
  const disp = item.display.fields.find((x) => x.field === f) ?? null;
  if (mode === "default") {
    if (!disp) return { blocks: [], note: null };
    return {
      blocks: [{ key: "d", label: null, text: disp.content, tag: STONE_LIBRARY_DISPLAY_LABEL_TR[disp.display_source], verified: disp.display_source === "DOGRULANMIS_TR_CEVIRI" }],
      note: null,
    };
  }
  if (mode === "verified") {
    if (item.display.verified_available[f] !== true) return { blocks: [], note: "Bu alan için doğrulanmış Türkçe çeviri yok." };
    const vt = item.display.verified_content[f] ?? (disp?.display_source === "DOGRULANMIS_TR_CEVIRI" ? disp.content : null);
    if (vt) return { blocks: [{ key: "v", label: null, text: vt, tag: STONE_LIBRARY_DISPLAY_LABEL_TR.DOGRULANMIS_TR_CEVIRI, verified: true }], note: null };
    return { blocks: [], note: "Bu alan için doğrulanmış Türkçe çeviri yok." };
  }
  const lang = mode;
  const tag = lang === "tr" ? "Kaynak metin (Türkçe)" : "Kaynak metin (İngilizce)";
  if (f === "keywords") {
    const words = (item.facets.keyword ?? []).filter((k) => k.lang === lang).map((k) => k.text);
    return words.length ? { blocks: [{ key: "k", label: null, text: words.join(" | "), tag }], note: null } : { blocks: [], note: null };
  }
  const blocks: Block[] = [];
  for (const sec of item.sections) {
    for (const x of sec.fields) {
      if (x.field === f && x.lang === lang) blocks.push({ key: `${sec.key}-${lang}`, label: [sec.label, sec.attribution].filter(Boolean).join(" · ") || null, text: x.content, tag });
    }
  }
  return { blocks, note: null };
}

export default function StoneDetailClient({ slug }: { slug: string }) {
  const [state, setState] = useState<{ slug: string; item: StoneLibraryStoneDoc | null } | null>(null);
  const [mode, setMode] = useState<Mode>("default");

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const r = await viewerGet<{ ok: true; item: StoneLibraryStoneDoc }>(`/api/dogaltas/kutuphane/${encodeURIComponent(slug)}`, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setState({ slug, item: r.ok ? r.data.item : null });
    })();
    return () => ctrl.abort();
  }, [slug]);

  const shell = (children: ReactNode) => (
    <main className={s.root}>
      <div className={s.page}>
        <ModuleNav current="library" />
        {children}
      </div>
    </main>
  );

  if (!state || state.slug !== slug) return shell(<p className={s.loading}>Yükleniyor…</p>);
  const item = state.item;
  if (!item) return shell(<NotFoundState />);

  const anyVerified = STONE_LIBRARY_DISPLAY_FIELDS.some((f) => item.display.verified_available[f] === true);
  const hasEn = item.sections.some((x) => x.fields.some((f) => f.lang === "en")) || (item.facets.keyword ?? []).some((k) => k.lang === "en");
  const hasTr = item.sections.some((x) => x.fields.some((f) => f.lang === "tr")) || (item.facets.keyword ?? []).some((k) => k.lang === "tr");
  const disabled: Record<Mode, boolean> = { default: false, verified: !anyVerified, tr: !hasTr, en: !hasEn };
  const sourceOnly = item.display.fields.length > 0 && item.display.fields.every((f) => f.display_source === "KAYNAK_TR");

  const facts: [string, string][] = [];
  const hard = formatHardness(item.hardness);
  if (hard) facts.push(["Sertlik (Mohs)", hard]);
  if (item.facets.birth_month?.length) facts.push(["Doğum ayı", item.facets.birth_month.map(monthName).join(", ")]);
  if (item.facets.numerical_vibration?.length) facts.push(["Sayısal titreşim", item.facets.numerical_vibration.join(", ")]);
  const groups = FACET_ORDER.filter((k) => (item.facets[k]?.length ?? 0) > 0);

  const notice = (
    <aside className={`${s.notice} ${item.has_health_content ? s.noticeStrong : ""}`} role="note">
      <b>Sağlık bilgilendirmesi</b>
      <p>{item.medical_notice.tr}</p>
    </aside>
  );
  const warnings = item.owner_info.filter((n) => n.kind === "warning");
  const notes = item.owner_info.filter((n) => n.kind !== "warning");

  return shell(
    <>
      <div className={s.crumbrow}>
        <Link className={s.crumb} href="/dogaltas/kutuphane">
          ‹ Kütüphaneye dön
        </Link>
      </div>
      <div className={s.detail}>
        <aside className={s.aside}>
          <div>
            <div className={s.photo}>
              {item.image ? (
                <AuthImage src={`/api/dogaltas/kutuphane/${item.slug}/gorsel`} alt={`${item.name_tr} — taş görseli`} className={s.phImg} placeholderClassName={s.phEmpty} />
              ) : (
                <span className={s.phEmpty}>Görsel yok</span>
              )}
            </div>
            {item.image?.attribution ? <p className={s.photoCaption}>{item.image.attribution}</p> : null}
          </div>
          {facts.length ? (
            <div className={s.panel}>
              <h2>Taş bilgileri</h2>
              <dl className={s.facts}>
                {facts.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {groups.length ? (
            <div className={s.panel}>
              <h2>Eşleştirmeler</h2>
              {groups.map((k) => (
                <div key={k} className={s.matchGroup}>
                  <h3>{FACET_LABEL[k]}</h3>
                  <div className={s.chips}>
                    {(item.facets[k] ?? []).map((v) => (
                      <span key={v.key} className={`${s.chip} ${s.chipStatic}`}>
                        {v.label_tr}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </aside>

        <div className={s.main}>
          <header className={s.head}>
            <h1>{item.name_tr}</h1>
            {item.name_en && item.name_en !== item.name_tr ? <p>İngilizce adı: {item.name_en}</p> : null}
          </header>

          <div className={s.srcbar}>
            <span className={s.srcLabel}>İçerik kaynağı</span>
            <div className={s.srcsw} role="radiogroup" aria-label="İçerik kaynağı">
              {MODES.map((m) => (
                <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} disabled={disabled[m.key]} onClick={() => setMode(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {!anyVerified || sourceOnly ? (
            <p className={s.expertNote}>Bu taş için doğrulanmış Türkçe çeviri henüz yayında değil; içerik kaynak metin (Türkçe) olarak gösteriliyor.</p>
          ) : null}

          {STONE_LIBRARY_DISPLAY_FIELDS.map((f) => {
            const { blocks, note } = blocksFor(item, f, mode);
            const sec = (
              <section key={f} className={s.sec}>
                <div className={s.secHead}>
                  <h2>
                    <span className={s.bar} />
                    {FIELD_LABEL[f]}
                  </h2>
                  {blocks.length === 1 ? <span className={`${s.srcTag} ${blocks[0].verified ? s.srcTagVer : ""}`}>{blocks[0].tag}</span> : null}
                </div>
                {blocks.length ? (
                  blocks.map((b) => (
                    <div key={b.key}>
                      {blocks.length > 1 && b.label ? <p className={s.srcNote}>{b.label}</p> : null}
                      {f === "keywords" ? (
                        <div className={s.chips}>
                          {splitKeywords(b.text).map((k) => (
                            <span key={k} className={`${s.chip} ${s.chipStatic}`}>
                              {k}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className={`${s.txt} ${f === "affirmation" ? s.affirm : ""}`}>{b.text}</p>
                      )}
                      {blocks.length === 1 && b.label ? <p className={s.srcNote}>{b.label}</p> : null}
                    </div>
                  ))
                ) : (
                  <p className={s.missing}>{note ?? "Bu alan bu kaynakta yer almıyor."}</p>
                )}
              </section>
            );
            return f === "description" && item.has_health_content ? [sec, <div key="notice">{notice}</div>] : sec;
          })}

          {item.owner_info.length ? (
            <section className={`${s.sec} ${s.notes}`}>
              <div className={s.secHead}>
                <h2>
                  <span className={`${s.bar} ${s.barAlt}`} />
                  Ek Bilgiler ve Uzman Notları
                </h2>
              </div>
              <p className={s.notesSub}>Bu bölüm kaynak metinlerden ve doğrulanmış çeviriden ayrıdır.</p>
              {[...warnings, ...notes].map((n, i) => (
                <article key={i} className={`${s.noteItem} ${n.kind === "warning" ? s.noteWarn : ""}`}>
                  <div className={s.noteCat}>{n.kind === "warning" ? "Kullanım uyarısı" : "Ek bilgi"}</div>
                  {n.title ? <h3>{n.title}</h3> : null}
                  <p>{n.body}</p>
                </article>
              ))}
            </section>
          ) : null}

          {item.pairings.length ? (
            <section className={s.sec}>
              <div className={s.secHead}>
                <h2>
                  <span className={s.bar} />
                  Birlikte kullanılan taşlar
                </h2>
              </div>
              <div className={s.pairs}>
                {item.pairings.map((p) => (
                  <Link key={p.slug} className={s.pair} href={`/dogaltas/kutuphane/${p.slug}`}>
                    {p.name_tr}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {!item.has_health_content ? notice : null}
        </div>
      </div>
    </>,
  );
}
