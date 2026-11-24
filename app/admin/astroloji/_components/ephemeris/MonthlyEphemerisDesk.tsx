"use client";

/**
 * Gökyüzü Araçları — EFEMERİS sekmesi: AYLIK EFEMERİS (Batı tropikal · Vedik sideral) + mevcut ayrıntılı yerel tablo.
 *
 * Aylık tablo hesaplama altyapımızın aylık ucundan gelir (ayın tamamı TEK istek, günlük 12.00 UTC; sunucu önbelleği → aynı ay ikinci
 * kez ücretli istek üretmez) ve sunucuda bağımsız NASA/JPL DE440 kontrolünden geçer. Gezegen gizle/göster, gösterim biçimi ve sıralama
 * YALNIZ görünüm filtresidir (istek yok). Kaydet / Word / PDF / arşivden aç yeni ücretli hesap BAŞLATMAZ (sunucu önbelleği ya da
 * kayıtlı anlık görüntü). Mevcut owner PASS "Ayrıntılı yerel tablo" (00:00 UT, RA/Dek/hız, olaylar) aynen korunur, katlanır bölümde.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { bodyGlyph, bodyHeader, bodyName, cellParts, dayLabel, kindLabel, methodLines, MONTH_NAMES_TR, periodLabel, trLocalNote } from "@/lib/astrology/pro/monthly/format";
import { bodyVerification } from "@/lib/astrology/pro/monthly/contract";
import type { MonthlyBody, MonthlyEphemeris, MonthlyKind } from "@/lib/astrology/pro/monthly/types";
import { astroDownload, astroFetch } from "../../_lib/api";
import EphemerisDesk from "./EphemerisDesk";
import { st as s } from "./skyToolsUi";
import m from "./monthly.module.css";

const API = "/api/admin/astroloji/efemeris/aylik";
const MIN_YEAR = 1600;
const MAX_YEAR = 2600;
type SavedMeta = { id: string; title: string; createdAt: string };
type RecordRow = { id: string; title: string; kind: MonthlyKind; year: number; month: number; createdAt: string };
type Mode = "sign" | "lon";

const nowYm = () => {
  const d = new Date();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16).padStart(8, "0").slice(-8)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);
const trDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
};

export default function MonthlyEphemerisDesk({ active = true }: { active?: boolean }) {
  const init = nowYm();
  const [kind, setKind] = useState<MonthlyKind>("western");
  const [year, setYear] = useState(init.year);
  const [yearText, setYearText] = useState(String(init.year));
  const [month, setMonth] = useState(init.month);
  const [res, setRes] = useState<MonthlyEphemeris | null>(null);
  const [saved, setSaved] = useState<SavedMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Record<MonthlyKind, MonthlyBody[]>>({ western: [], vedic: [] });
  /** Doğrulanmamış cisimler (Lilith; aralık dışı Kiron) varsayılan GİZLİ; yalnız kullanıcı açıkça açarsa "⚠" işaretiyle görünür. */
  const [optIn, setOptIn] = useState<Record<MonthlyKind, MonthlyBody[]>>({ western: [], vedic: [] });
  const [mode, setMode] = useState<Mode>("sign");
  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dl, setDl] = useState<"docx" | "pdf" | null>(null);
  const [records, setRecords] = useState<RecordRow[] | null>(null);
  const [recErr, setRecErr] = useState<string | null>(null);
  const [recMore, setRecMore] = useState(false);
  const gen = useRef(0);
  const saveReq = useRef<string | null>(null);
  const autoloaded = useRef(false);

  const load = useCallback(async (k: MonthlyKind, y: number, mo: number) => {
    if (!Number.isInteger(y) || y < MIN_YEAR || y > MAX_YEAR) {
      setErr(`Yıl ${MIN_YEAR}–${MAX_YEAR} aralığında olmalı.`);
      return;
    }
    const my = ++gen.current;
    setBusy(true);
    setErr(null);
    setNotice(null);
    setSaveOpen(false);
    const r = await astroFetch<{ ok: true; result: MonthlyEphemeris }>(API, { method: "POST", body: { kind: k, year: y, month: mo } });
    if (my !== gen.current) return; // geciken yanıt yeni seçimi ezmez
    setBusy(false);
    if (!r.ok) {
      setRes(null);
      setSaved(null);
      setErr(r.error || "Tablo oluşturulamadı.");
      return;
    }
    setSaved(null);
    setRes(r.data.result);
  }, []);

  const loadRecords = useCallback(async (offset: number) => {
    const r = await astroFetch<{ ok: true; records: RecordRow[]; hasMore: boolean }>(`${API}/kayitlar?limit=20&offset=${offset}`);
    if (!r.ok) {
      setRecErr(r.error || "Kayıtlar yüklenemedi.");
      if (offset === 0) setRecords([]);
      return;
    }
    setRecErr(null);
    setRecords((prev) => (offset === 0 ? r.data.records : [...(prev ?? []), ...r.data.records]));
    setRecMore(r.data.hasMore);
  }, []);

  // Varsayılan: sekme ilk kez görünür olduğunda içinde bulunulan ayın Batı tablosu açılır (gizli sekmede istek atılmaz).
  useEffect(() => {
    if (!active || autoloaded.current) return;
    autoloaded.current = true;
    void load("western", init.year, init.month);
    void loadRecords(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const pick = (k: MonthlyKind, y: number, mo: number) => {
    setKind(k);
    setYear(y);
    setYearText(String(y));
    setMonth(mo);
    void load(k, y, mo);
  };
  const step = (delta: number) => {
    let y = year;
    let mo = month + delta;
    if (mo < 1) {
      mo = 12;
      y -= 1;
    } else if (mo > 12) {
      mo = 1;
      y += 1;
    }
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    pick(kind, y, mo);
  };
  const commitYear = () => {
    const y = Number(yearText);
    if (!/^\d{4}$/.test(yearText) || y < MIN_YEAR || y > MAX_YEAR) {
      setErr(`Yıl ${MIN_YEAR}–${MAX_YEAR} aralığında olmalı.`);
      setYearText(String(year));
      return;
    }
    if (y !== year) pick(kind, y, month);
  };

  const verified = (b: MonthlyBody) => (res ? bodyVerification(res.kind, b, res.year).verified : true);
  const isShown = (b: MonthlyBody) => (res ? (verified(b) ? !hidden[res.kind].includes(b) : optIn[res.kind].includes(b)) : false);
  const shown = res ? res.bodies.filter(isShown) : [];
  const toggleBody = (b: MonthlyBody) => {
    if (!res) return;
    if (isShown(b) && shown.length <= 1) return; // en az bir cisim görünür kalır
    const k = res.kind;
    if (!verified(b)) setOptIn((o) => ({ ...o, [k]: o[k].includes(b) ? o[k].filter((x) => x !== b) : [...o[k], b] }));
    else setHidden((h) => ({ ...h, [k]: h[k].includes(b) ? h[k].filter((x) => x !== b) : [...h[k], b] }));
  };
  const headLabel = (b: MonthlyBody) => (res && !verified(b) ? `${bodyHeader(res.kind, b)} ⚠` : res ? bodyHeader(res.kind, b) : b);
  const headTitle = (b: MonthlyBody) => (res ? `${bodyName(res.kind, b)}${verified(b) ? "" : ` — doğrulanmamış: ${bodyVerification(res.kind, b, res.year).note}`}` : b);

  async function download(format: "docx" | "pdf") {
    if (!res || dl) return;
    setDl(format);
    setNotice(null);
    const base = `efemeris-${res.kind === "western" ? "bati-tropikal" : "vedik-sideral"}-${res.year}-${String(res.month).padStart(2, "0")}.${format}`;
    const path = saved ? `${API}/kayitlar/${saved.id}/rapor?format=${format}` : `${API}/rapor?kind=${res.kind}&year=${res.year}&month=${res.month}&format=${format}`;
    const r = await astroDownload(path, base);
    setDl(null);
    if (!r.ok) setErr(r.error);
  }

  function openSave() {
    if (!res) return;
    setTitle(`Efemeris · ${kindLabel(res.kind)} · ${periodLabel(res.year, res.month)}`);
    saveReq.current = newId();
    setSaveOpen(true);
    setNotice(null);
  }
  async function doSave() {
    if (!res || saving) return;
    setSaving(true);
    setErr(null);
    const r = await astroFetch<{ ok: true; record: RecordRow; reused: boolean }>(`${API}/kayitlar`, { method: "POST", body: { kind: res.kind, year: res.year, month: res.month, title, saveRequestId: saveReq.current } });
    setSaving(false);
    if (!r.ok) {
      setErr(r.error || "Kaydedilemedi.");
      return;
    }
    saveReq.current = null;
    setSaveOpen(false);
    setSaved({ id: r.data.record.id, title: r.data.record.title, createdAt: r.data.record.createdAt });
    setNotice(r.data.reused ? "Bu kayıt zaten oluşturulmuştu." : "Efemeris kaydedildi. Kayıtlı efemerisler listesinden yeniden açabilirsiniz.");
    void loadRecords(0);
  }
  async function openRecord(id: string) {
    const my = ++gen.current;
    setBusy(true);
    setErr(null);
    setNotice(null);
    const r = await astroFetch<{ ok: true; record: RecordRow; result: MonthlyEphemeris }>(`${API}/kayitlar/${id}`);
    if (my !== gen.current) return;
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || "Kayıt açılamadı.");
      return;
    }
    const e = r.data.result;
    setKind(e.kind);
    setYear(e.year);
    setYearText(String(e.year));
    setMonth(e.month);
    setRes(e);
    setSaved({ id: r.data.record.id, title: r.data.record.title, createdAt: r.data.record.createdAt });
    setSaveOpen(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const cc = res?.crossCheck;

  return (
    <section className={s.results} style={{ padding: 0, gap: 14 }} data-testid="monthly-ephemeris">
      <div className={m.head}>
        <div className={m.headText}>
          <h2>Efemeris</h2>
          <p>Aylık günlük gezegen konumları · ayın tamamı tek hesapla</p>
        </div>
        <div className={m.kindSeg} role="group" aria-label="Efemeris türü">
          {(["western", "vedic"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => pick(k, year, month)} disabled={busy} data-testid={`me-kind-${k}`}>
              {kindLabel(k)}
            </button>
          ))}
        </div>
      </div>

      <div className={`${s.panel} ${m.controls}`}>
        <label className={m.ctlField}>
          <span>Ay</span>
          <select value={month} onChange={(e) => pick(kind, year, Number(e.target.value))} disabled={busy} data-testid="me-month">
            {MONTH_NAMES_TR.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={m.ctlField}>
          <span>Yıl</span>
          <input
            inputMode="numeric"
            value={yearText}
            onChange={(e) => setYearText(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onBlur={commitYear}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitYear();
            }}
            aria-describedby="me-year-range"
            disabled={busy}
            data-testid="me-year"
          />
        </label>
        <div className={m.stepBtns}>
          <button type="button" className={m.iconBtn} onClick={() => step(-1)} disabled={busy || (year === MIN_YEAR && month === 1)} data-testid="me-prev">
            ‹ Önceki ay
          </button>
          <button type="button" className={m.iconBtn} onClick={() => pick(kind, nowYm().year, nowYm().month)} disabled={busy} data-testid="me-current">
            Bu ay
          </button>
          <button type="button" className={m.iconBtn} onClick={() => step(1)} disabled={busy || (year === MAX_YEAR && month === 12)} data-testid="me-next">
            Sonraki ay ›
          </button>
        </div>
        <span className={m.spacer} />
        <small id="me-year-range" className={s.muted} style={{ fontSize: 12 }}>
          Yıl aralığı {MIN_YEAR}–{MAX_YEAR}
        </small>
      </div>

      <div className={m.timeBanner} role="note" data-testid="me-time-note">
        <span aria-hidden="true">🕛</span>
        <span>
          <b>Günlük konumlar: 12.00 UTC{trLocalNote(year, month)}.</b> Her satır o anın örneğidir. Ardışık iki günde farklı burç görülmesi geçişin bu iki an arasında olduğunu gösterir; kesin geçiş ya da retro başlama saatini göstermez.
        </span>
      </div>

      {err && (
        <p role="alert" className={s.errorBox} data-testid="me-error">
          {err}
        </p>
      )}
      {notice && (
        <p className={m.okBox} role="status" data-testid="me-notice">
          {notice}
        </p>
      )}

      <section className={`${s.panel} ${s.results}`} aria-live="polite" aria-busy={busy} data-testid="me-result">
        {!res ? (
          <p className={s.empty}>{busy ? "Hesaplanıyor…" : "Ay ve yıl seçin."}</p>
        ) : (
          <>
            {saved && (
              <div className={m.savedBanner} data-testid="me-saved-banner">
                <span>
                  Kayıtlı efemeris: <b>{saved.title}</b> · {trDate(saved.createdAt)}
                </span>
                <button type="button" className={s.btnLight} onClick={() => pick(res.kind, res.year, res.month)} disabled={busy}>
                  Güncel tabloyu aç
                </button>
              </div>
            )}
            <div className={m.resHead}>
              <div>
                <h3 data-testid="me-title">
                  {periodLabel(res.year, res.month)} · {kindLabel(res.kind)}
                </h3>
                <div className={m.chipRow}>
                  <span className={`${m.chip} ${m.chipGold}`}>12.00 UTC · {res.days.length} gün</span>
                  <span className={m.chip}>{res.zodiac === "tropical" ? "Tropikal zodyak" : "Sideral zodyak · Lahiri ayanamsası"}</span>
                  <span className={m.chip}>{res.kind === "western" ? "Ay düğümü: gerçek" : "Rahu: ortalama düğüm"}</span>
                  {cc?.status === "pass" ? (
                    <span className={`${m.chip} ${m.chipOk}`} title={cc.method} data-testid="me-crosscheck">
                      Bağımsız kontrol ✓ en büyük fark {String(cc.maxAbsArcsec).replace(".", ",")}″
                    </span>
                  ) : (
                    <span className={`${m.chip} ${m.chipWarn}`} data-testid="me-crosscheck">
                      Bağımsız kontrol yapılamadı
                    </span>
                  )}
                </div>
              </div>
              <div className={m.actions}>
                {!saved && (
                  <button type="button" className={s.btnGold} onClick={openSave} disabled={busy || saving} data-testid="me-save">
                    Kaydet
                  </button>
                )}
                <button type="button" className={s.btnLight} onClick={() => void download("docx")} disabled={busy || dl !== null} data-testid="me-docx">
                  {dl === "docx" ? "Hazırlanıyor…" : "Word"}
                </button>
                <button type="button" className={s.btnLight} onClick={() => void download("pdf")} disabled={busy || dl !== null} data-testid="me-pdf">
                  {dl === "pdf" ? "Hazırlanıyor…" : "PDF"}
                </button>
              </div>
            </div>

            {saveOpen && (
              <form
                className={m.saveBox}
                onSubmit={(e) => {
                  e.preventDefault();
                  void doSave();
                }}
                data-testid="me-save-form"
              >
                <label>
                  Kayıt başlığı
                  <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-testid="me-save-title" />
                </label>
                <button type="submit" className={s.btnGold} disabled={saving || !title.trim()} data-testid="me-save-confirm">
                  {saving ? "Kaydediliyor…" : "Arşive kaydet"}
                </button>
                <button type="button" className={s.btnLight} onClick={() => setSaveOpen(false)} disabled={saving}>
                  Vazgeç
                </button>
              </form>
            )}

            <div className={m.viewBar}>
              <div className={m.bodyChips} role="group" aria-label="Gösterilen gök cisimleri (yalnız görünüm)">
                {res.bodies.map((b) => (
                  <button key={b} type="button" className={m.bodyChip} aria-pressed={isShown(b)} onClick={() => toggleBody(b)} title={headTitle(b)} data-testid={`me-body-${b}`} data-verified={verified(b) ? "1" : "0"}>
                    {headLabel(b)}
                  </button>
                ))}
              </div>
              <div className={m.smallSeg} role="group" aria-label="Gösterim">
                <button type="button" aria-pressed={mode === "sign"} onClick={() => setMode("sign")} data-testid="me-mode-sign">
                  Burç · derece
                </button>
                <button type="button" aria-pressed={mode === "lon"} onClick={() => setMode("lon")} data-testid="me-mode-lon">
                  Tam boylam
                </button>
              </div>
            </div>

            {/* Klavye erişimi: kap odaklanabilir (ok tuşlarıyla yatay/dikey kaydırma); ekran okuyucu için bölge adı + tablo başlığı. */}
            <div className={m.scroll} data-testid="me-scroll" tabIndex={0} role="region" aria-label={`${periodLabel(res.year, res.month)} ${kindLabel(res.kind)} efemeris tablosu — kaydırılabilir`}>
              <table className={m.table} data-testid="me-table">
                <caption className={m.srOnly}>
                  {periodLabel(res.year, res.month)} · {kindLabel(res.kind)} · günlük konumlar 12.00 UTC · {shown.length} gök cismi
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Gün</th>
                    {shown.map((b) => (
                      <th key={b} scope="col" title={headTitle(b)} data-testid={`me-head-${b}`}>
                        {headLabel(b)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.days.map((d, di) => {
                    const prev = di > 0 ? res.days[di - 1] : null;
                    return (
                      <tr key={d.date} className={d.date === todayIso ? m.today : undefined}>
                        <th scope="row" className={m.dayCell}>
                          {dayLabel(d.date)}
                          <small>
                            {d.date.slice(8, 10)}.{d.date.slice(5, 7)}.{d.date.slice(0, 4)}
                          </small>
                        </th>
                        {shown.map((b) => {
                          const p = d.positions.find((x) => x.body === b)!;
                          const c = cellParts(p);
                          const pp = prev?.positions.find((x) => x.body === b);
                          const changed = !!pp && cellParts(pp).signIndex !== c.signIndex;
                          return (
                            <td
                              key={b}
                              className={`${m.pos} ${c.retro ? m.isRetro : ""} ${changed ? m.ingress : ""}`}
                              title={`${bodyName(res.kind, b)} · ${c.signName} ${c.degMin} · boylam ${c.lonText}${c.retro ? " · retro" : ""}${changed ? " · burç bu iki günlük örnek arasında değişti (kesin saat gösterilmez)" : ""}`}
                              data-testid={`me-cell-${d.date}-${b}`}
                            >
                              {mode === "sign" ? (
                                <>
                                  <span className={m.sign}>
                                    <b aria-hidden="true">{c.signGlyph}</b>
                                    {c.signName}
                                  </span>
                                  <span className={m.deg}>
                                    {c.degMin}
                                    {c.retro && <span className={m.rx} aria-label="retro">℞</span>}
                                  </span>
                                </>
                              ) : (
                                <span className={m.deg}>
                                  {c.lonText}
                                  {c.retro && <span className={m.rx} aria-label="retro">℞</span>}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={m.legend}>
              <span>
                <span className={m.legendSwatch} style={{ background: "#fff5f6", border: "1px solid #f3c5ca" }} />℞ retro (hesaplama altyapısının günlük retro bilgisi)
              </span>
              <span>
                <span className={m.legendSwatch} style={{ boxShadow: "inset 0 2px 0 #b68a3c", background: "#fff", border: "1px solid #eee" }} />
                Burç önceki güne göre değişti (geçiş bu iki 12.00 UTC örneği arasında)
              </span>
              <span>Derece ve dakika aşağı yuvarlanır.</span>
              {res.bodies.some((b) => !verified(b)) && <span data-testid="me-unverified-note">⚠ Bağımsız olarak doğrulanmamış cisimler ({res.bodies.filter((b) => !verified(b)).map((b) => bodyName(res.kind, b)).join(", ")}) varsayılan olarak gizlidir ve Word/PDF raporuna girmez.</span>}
            </div>
            {res.missingBodies.length > 0 && (
              <p className={s.small} role="note" data-testid="me-missing">
                {res.missingBodies.map((b) => `${bodyGlyph(res.kind, b)} ${bodyName(res.kind, b)}`).join(", ")}: hesaplama altyapısı bu ay için konum vermedi; tabloda gösterilmez.
              </p>
            )}
            <ul className={m.notes} data-testid="me-method">
              {methodLines(res).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={`${s.panel} ${m.archive}`} data-testid="me-archive">
        <div className={m.archiveHead}>
          <h3>Kayıtlı efemerisler</h3>
          <button type="button" className={s.btnLight} onClick={() => void loadRecords(0)} data-testid="me-archive-refresh">
            Yenile
          </button>
        </div>
        {recErr && <p className={s.small}>{recErr}</p>}
        {records === null ? (
          <p className={s.small}>Yükleniyor…</p>
        ) : records.length === 0 ? (
          <p className={s.small}>Henüz kayıtlı efemeris yok. Tabloyu açıp “Kaydet” ile arşive ekleyebilirsiniz.</p>
        ) : (
          <ul className={m.recList}>
            {records.map((r) => (
              <li key={r.id} className={m.rec} data-testid="me-record">
                <span>
                  <span className={m.recTitle}>{r.title}</span>
                  <br />
                  <span className={m.recMeta}>
                    {kindLabel(r.kind)} · {periodLabel(r.year, r.month)} · kaydedildi {trDate(r.createdAt)}
                  </span>
                </span>
                <button type="button" className={s.btnLight} onClick={() => void openRecord(r.id)} disabled={busy} data-testid="me-record-open">
                  Aç
                </button>
              </li>
            ))}
          </ul>
        )}
        {recMore && (
          <button type="button" className={s.btnLight} onClick={() => void loadRecords(records?.length ?? 0)}>
            Daha fazla
          </button>
        )}
      </section>

      <details className={m.advanced} data-testid="me-advanced">
        <summary>Ayrıntılı yerel tablo — 00:00 UT satırları, RA · Dek · Hız, burç girişi ve istasyon olayları (Yaşam Sistemi yerel hesabı)</summary>
        <div style={{ marginTop: 12 }}>
          <EphemerisDesk />
        </div>
      </details>
    </section>
  );
}
