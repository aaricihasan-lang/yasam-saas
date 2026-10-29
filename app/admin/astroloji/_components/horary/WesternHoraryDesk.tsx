"use client";

/**
 * Gökyüzü Atlası — Batı Horary (William Lilly) çalışma masası. 2026-10-30 Owner kararıyla yayında (önizleme bayrağı kaldırıldı).
 *
 * Akış: soru → tarih/saat/konum → sorulan ev (bilerek seçilir; varsayılan YOK) → "Haritayı Oluştur" → sunucuda GERÇEK hesaplama
 * (lib/astrology/horary/western; sağlayıcı çağrısı yok) → çark + temel bulgular + olay çizelgesi; ileri ayrıntılar kapalı <details>.
 * Soru METNİ hesaplama isteğine girmez ve kaydedilmez; yalnız uzman işaretlerse Word/PDF isteğiyle o rapor için gönderilir.
 * Word/PDF: sunucuda yeniden hesap (ReportBar). Kalıcı kayıt / arşiv bu sürümde YOK (veritabanı onayı bekliyor).
 * HÜKÜM ÜRETİLMEZ. Bilgi hiyerarşisi: kesin astronomik veri → klasik şartları sağlanan olay → aday / eksik / sınıflandırılamayan
 * (ilk ekranda yalnız sayı; kanıtıyla ileri ayrıntıda).
 * Revizyon-01 (2026-10-29): girdi değişince önceki sonuç gizlenir; geciken yanıt yeni durumu ezemez; 320 px tek sütun.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Archive, ChevronDown, ChevronLeft } from "lucide-react";
import type { WesternHoraryResult } from "@/lib/astrology/horary/westernRun";
import type { SignId } from "@/lib/astrology/model/western";
import { astroFetch, astroHeaders, astroPath } from "../../_lib/api";
import {
  ASPECT_GLYPH,
  ASPECT_LABEL,
  CONSIDERATION_LABEL,
  HOUSE_TOPICS,
  INTERPOSITION_LABEL,
  RECEPTION_LABEL,
  SOLAR_PHASE,
  TIMELINE_TAG,
  TRANSLATION_STATUS,
  UNRESOLVED_REASON,
  accidentalLabel,
  body,
  dm,
  glyph,
  localAt,
  lonLabel,
  offsetLabel,
  sign,
  signGlyph,
  uncertaintyLabel,
} from "../../_lib/horaryWesternLabels";
import { atlasEyebrow, atlasGhostBtn, atlasPanel, atlasPaperInput, atlasPrimaryBtn, atlasSecondaryBtn } from "../AtlasShell";
import LocationPicker, { type PickedLocation } from "../LocationPicker";
import NatalWheel, { type WheelChart } from "../NatalWheel";
import { openHoraryRecord } from "./HoraryArchive";
import HoraryClientPick, { type PickedClient } from "./HoraryClientPick";

const DEMO = { question: "DEMO — Bu ortaklık teklifi gerçekleşecek mi?", date: "2026-10-29", time: "14:30", place: { id: "tr-34-istanbul", label: "İstanbul, Türkiye" }, house: 7 } as const;
const ASPECT_TYPE = { 0: "conjunction", 60: "sextile", 90: "square", 120: "trine", 180: "opposition" } as const;
const SIGN_ORDER: SignId[] = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const signAt = (lon: number) => SIGN_ORDER[Math.floor((((lon % 360) + 360) % 360) / 30)];
/** Hesaplamanın doğrulandığı aralık (sunucu da aynı sınırı uygular; sessizce genişletilmez). */
const MIN_YEAR = 1800;
const MAX_YEAR = 2200;
const RANGE_MSG = `Desteklenen tarih aralığı ${MIN_YEAR}–${MAX_YEAR}. Bu sınır, hesaplamanın doğrulandığı aralıktır.`;
const REQUEST_TIMEOUT_MS = 25_000;
/** Çark ile bulgular, Horary içerik alanı en az bu genişlikteyse yan yana (sol menü düşüldükten sonra ölçülür). */
const SIDE_BY_SIDE_MIN = 900;
/** Horary'ye ait dokunmatik hedef: en az 44 px yükseklik; giriş alanları kapsayıcı genişliğini aşmaz. */
const ctl = "min-h-[44px] w-full min-w-0";

type Err = { message: string; field?: "date" | "time" | "place" | "house" | "network"; ambiguous?: { choice: "earlier" | "later"; utcIso: string; offsetSeconds: number }[] };
type Snapshot = { date: string; time: string; placeId: string; house: number; question: string; dst?: "earlier" | "later" };

function nowLocal(): { date: string; time: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

export function horaryWheel(r: WesternHoraryResult): WheelChart {
  const c = r.chart;
  return {
    bodies: c.planets.map((p) => ({ id: p.planet, longitude: p.lon, sign: p.sign as SignId, degreeInSign: p.degree, retrograde: p.retrograde })),
    houses: c.cusps.map((lon, i) => ({ number: i + 1, longitude: lon, sign: signAt(lon), degreeInSign: ((lon % 360) + 360) % 30 })),
    angles: { ascendant: { longitude: c.cusps[0] }, midheaven: { longitude: c.cusps[9] } },
    aspects: c.aspects
      .filter((a) => a.withinMoieties)
      .map((a) => ({ a: a.a, b: a.b, type: ASPECT_TYPE[a.angle as keyof typeof ASPECT_TYPE], nature: a.angle === 60 || a.angle === 120 ? ("harmonious" as const) : a.angle === 0 ? ("neutral" as const) : ("challenging" as const) })),
  };
}

/** Kapsayıcının GERÇEK genişliği (sol menü / kenar boşlukları düşülmüş) — viewport değil. */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(Math.round(es[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const RECORD_HASH_RE = /^#?horary-lilly\/kayit\/([0-9a-fA-F-]{36})$/;
/** Kayıtlı Horary adresi: #horary-lilly/kayit/<id> (arşivden açılır; yenileme / geri-ileri ile korunur). */
function useRecordHash(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setId(RECORD_HASH_RE.exec(window.location.hash)?.[1] ?? null);
    read();
    window.addEventListener("popstate", read);
    window.addEventListener("hashchange", read);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("hashchange", read);
    };
  }, []);
  return id;
}
/** Analiz Arşivi'ni "Horary Soruları" sekmesiyle açar (yeni menü yok). */
export const ARCHIVE_MODE_EVENT = "yasam:astro-archive-mode";
function openHoraryArchive() {
  window.dispatchEvent(new CustomEvent(ARCHIVE_MODE_EVENT, { detail: "horary" }));
  window.location.hash = "analiz-arsivi";
}

export default function WesternHoraryDesk({ onHome }: { onHome: () => void }) {
  const recordId = useRecordHash();
  const [question, setQuestion] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState<PickedLocation | null>(null);
  const [house, setHouse] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err | null>(null);
  const [result, setResult] = useState<{ r: WesternHoraryResult; snap: Snapshot; demo: boolean } | null>(null);
  // Her girdi değişikliği ve her gönderim yeni kuşak açar; yalnız güncel kuşağın yanıtı ekrana yazılır (geciken eski yanıt yok sayılır).
  const gen = useRef(0);
  const busyRef = useRef(false);

  const invalidate = () => {
    gen.current += 1;
    setResult(null);
    busyRef.current = false;
    setBusy(false);
  };
  const edit =
    <T,>(set: (v: T) => void, field?: Err["field"]) =>
    (v: T) => {
      set(v);
      setDemo(false);
      invalidate();
      setErr((e) => (e && (!field || e.field === field || e.field === "network" || e.ambiguous) ? null : e));
    };

  async function submit(dst?: "earlier" | "later") {
    if (busyRef.current) return;
    const y = Number(date.slice(0, 4));
    const missing: Err | null = !date
      ? { message: "Sorunun tarihini girin.", field: "date" }
      : !time
        ? { message: "Sorunun saatini girin.", field: "time" }
        : !place
          ? { message: "Sorunun sorulduğu konumu seçin.", field: "place" }
          : house === null
            ? { message: "Sorulan evi seçin. Sorunun konusu hangi eve aitse onu bilerek seçmelisiniz.", field: "house" }
            : !Number.isFinite(y) || y < MIN_YEAR || y > MAX_YEAR
              ? { message: RANGE_MSG, field: "date" }
              : null;
    if (missing) {
      setResult(null);
      setErr(missing);
      return;
    }
    const my = ++gen.current;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    setResult(null);
    const snap: Snapshot = { date, time, placeId: place!.id, house: house!, question: question.trim(), ...(dst ? { dst } : {}) };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((res) => {
      timer = setTimeout(() => res("timeout"), REQUEST_TIMEOUT_MS);
    });
    const res = await Promise.race([
      astroFetch<{ ok: true; result: WesternHoraryResult }>("/api/admin/astroloji/horary/western", {
        method: "POST",
        body: { date, time, locationId: place!.id, quesitedHouse: house, ...(dst ? { dst } : {}) },
      }),
      timeout,
    ]);
    clearTimeout(timer);
    if (my !== gen.current) return; // girdiler değişti ya da yeni istek başladı → bu yanıt artık geçersiz
    busyRef.current = false;
    setBusy(false);
    if (res === "timeout") {
      gen.current += 1; // geç gelen yanıt da yok sayılır
      setErr({ message: `Hesaplama ${REQUEST_TIMEOUT_MS / 1000} saniye içinde yanıt vermedi. Bağlantınızı kontrol edip tekrar deneyin.`, field: "network" });
      return;
    }
    if (res.ok) {
      setResult({ r: res.data.result, snap, demo });
      return;
    }
    const raw = typeof res.data?.field === "string" ? res.data.field : undefined;
    const field: Err["field"] = raw === "quesitedHouse" ? "house" : raw === "date" || raw === "time" || raw === "place" ? raw : undefined;
    const message =
      res.code === "NETWORK"
        ? "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."
        : res.status >= 500
          ? "Sunucu hatası nedeniyle harita oluşturulamadı. Girdileriniz korunuyor; biraz sonra tekrar deneyin."
          : res.code === "OUT_OF_RANGE"
            ? RANGE_MSG
            : res.error;
    setErr({ message, field: res.code === "NETWORK" || res.status >= 500 ? "network" : field, ambiguous: res.code === "TIME_AMBIGUOUS" ? (res.data?.options as Err["ambiguous"]) : undefined });
  }

  const fieldErr = (f: Err["field"]) => (err?.field === f ? "border-rose-400 ring-2 ring-rose-200" : "");

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="horary-western">
      {/* Başlık: teknik adı + geri dönüş tek satırda; uzun açıklama yöntem satırına taşındı (mobilde form yukarıda başlar). */}
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 max-sm:px-3">
        <div className="min-w-0">
          <p className={atlasEyebrow}>Horary · Soru haritası</p>
          <h2 className="mt-0.5 text-[1.45rem] font-light leading-tight tracking-[0.02em] text-[#F6F2EA] [font-family:var(--font-atlas-display)] sm:text-[1.75rem]">William Lilly Horary</h2>
        </div>
        <span className="flex flex-wrap gap-2">
          <button type="button" onClick={openHoraryArchive} className={`${atlasGhostBtn} min-h-[44px]`} data-testid="horary-open-archive">
            <Archive className="h-4 w-4" aria-hidden="true" />
            Kayıtlı sorular
          </button>
          <button type="button" onClick={onHome} className={`${atlasGhostBtn} min-h-[44px]`} data-testid="horary-back">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Atlas ana ekranı
          </button>
        </span>
      </header>

      {recordId ? (
        <SavedRecordView key={recordId} id={recordId} />
      ) : (
      <>

      <form
        className={`${atlasPanel} grid min-w-0 grid-cols-1 gap-4 px-4 py-5 sm:px-6`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-label="Horary sorusu"
        noValidate
        data-testid="horary-form"
      >
        {demo && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-amber-900" data-testid="horary-demo-badge">
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 font-semibold tracking-[0.12em]">DEMO VERİSİ</span>
            Örnek girdi; hesaplama gerçektir.
          </p>
        )}
        <label className="grid min-w-0 gap-1.5">
          <span className="text-sm font-medium text-slate-700">Soru</span>
          <textarea className={`${atlasPaperInput} ${ctl} min-h-[64px] resize-y`} rows={2} maxLength={500} value={question} onChange={(e) => edit(setQuestion)(e.target.value)} placeholder="Danışanın sorusu (isteğe bağlı)" data-testid="horary-question" />
          <span className="text-xs text-slate-500">Soru metni hesaplama için gönderilmez ve kaydedilmez; yalnız raporda “Soru metnini rapora ekle” işaretliyse o rapor için gönderilir.</span>
        </label>

        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1.5">
            <span className="text-sm font-medium text-slate-700">Tarih (sorunun yerel tarihi)</span>
            <input type="date" min={`${MIN_YEAR}-01-01`} max={`${MAX_YEAR}-12-31`} className={`${atlasPaperInput} ${ctl} ${fieldErr("date")}`} value={date} onChange={(e) => edit(setDate, "date")(e.target.value)} aria-invalid={err?.field === "date"} data-testid="horary-date" />
          </label>
          <div className="grid min-w-0 gap-1.5">
            <label htmlFor="horary-time" className="text-sm font-medium text-slate-700">
              Saat (yerel)
            </label>
            <div className="flex min-w-0 gap-2">
              <input id="horary-time" type="time" className={`${atlasPaperInput} ${ctl} flex-1 ${fieldErr("time")}`} value={time} onChange={(e) => edit(setTime, "time")(e.target.value)} aria-invalid={err?.field === "time"} data-testid="horary-time" />
              <button
                type="button"
                className={`${atlasSecondaryBtn} min-h-[44px] shrink-0 px-3`}
                onClick={() => {
                  const n = nowLocal();
                  setDate(n.date);
                  setTime(n.time);
                  setDemo(false);
                  invalidate();
                  setErr(null);
                }}
                data-testid="horary-now"
              >
                Şimdi
              </button>
            </div>
          </div>
        </div>

        <div className={`grid min-w-0 gap-1.5 rounded-lg ${err?.field === "place" ? "ring-2 ring-rose-200" : ""}`} data-testid="horary-place">
          <span className="text-sm font-medium text-slate-700">Konum</span>
          <LocationPicker value={place} onChange={edit(setPlace, "place")} />
        </div>

        <label className="grid min-w-0 gap-1.5">
          <span className="text-sm font-medium text-slate-700">Sorulan ev</span>
          <select className={`${atlasPaperInput} ${ctl} ${fieldErr("house")}`} value={house ?? ""} onChange={(e) => edit(setHouse, "house")(e.target.value ? Number(e.target.value) : null)} aria-invalid={err?.field === "house"} aria-describedby="horary-house-help" data-testid="horary-house">
            <option value="">Sorulan evi seçin…</option>
            {Object.entries(HOUSE_TOPICS).map(([h, t]) => (
              <option key={h} value={h}>
                {h}. ev — {t}
              </option>
            ))}
          </select>
          <span id="horary-house-help" className="text-xs text-slate-500">
            Sorunun konusu hangi eve aitse onu seçin. Ev konuları klasik anlamlardır; seçim uzmana aittir.
          </span>
        </label>

        {err && (
          <div role="alert" className="min-w-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" data-testid="horary-error" data-field={err.field ?? ""}>
            {err.message}
            {err.ambiguous && (
              <span className="mt-2 flex flex-wrap gap-2">
                {err.ambiguous.map((o) => (
                  <button key={o.choice} type="button" className={`${atlasSecondaryBtn} min-h-[44px]`} onClick={() => void submit(o.choice)} data-testid={`horary-dst-${o.choice}`}>
                    {o.choice === "earlier" ? "İlk yaşanan" : "İkinci yaşanan"} ({offsetLabel(o.offsetSeconds)})
                  </button>
                ))}
              </span>
            )}
          </div>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button type="submit" className={`${atlasPrimaryBtn} min-h-[44px]`} disabled={busy} aria-busy={busy} data-testid="horary-submit">
            {busy ? "Hesaplanıyor…" : "Haritayı Oluştur"}
          </button>
          <button
            type="button"
            className={`${atlasSecondaryBtn} min-h-[44px]`}
            disabled={busy}
            onClick={() => {
              setQuestion(DEMO.question);
              setDate(DEMO.date);
              setTime(DEMO.time);
              setPlace({ ...DEMO.place });
              setHouse(DEMO.house);
              invalidate();
              setDemo(true);
              setErr(null);
            }}
            data-testid="horary-demo"
          >
            DEMO verisiyle doldur
          </button>
          <span className="text-xs text-slate-500 sm:ml-auto">William Lilly, Christian Astrology (1647) · Regiomontanus evleri</span>
        </div>
      </form>

      {busy && (
        <p className="px-1 text-sm text-[#F6F2EA]/80 max-sm:px-3" role="status" data-testid="horary-busy">
          Harita hesaplanıyor…
        </p>
      )}
      {result && (
        <HoraryResult
          r={result.r}
          snap={result.snap}
          demo={result.demo}
          actions={
            <>
              <ReportBar snap={result.snap} demo={result.demo} />
              <SaveBar r={result.r} snap={result.snap} demo={result.demo} />
            </>
          }
        />
      )}
      </>
      )}
    </div>
  );
}

function Section({ title, children, testId, id, hint }: { title: string; children: ReactNode; testId?: string; id?: string; hint?: string }) {
  return (
    <details id={id} className={`${atlasPanel} group min-w-0 overflow-hidden`} data-testid={testId}>
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none sm:px-6 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#c9a54e] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-[#0b1430]">{title}</span>
          {hint && <span className="block text-xs text-slate-500">{hint}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#b8954e] motion-safe:transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="min-w-0 border-t border-[#ece3cf] px-4 pb-5 pt-4 sm:px-6">{children}</div>
    </details>
  );
}

const P = (id: string) => (
  <span className="whitespace-nowrap">
    <span aria-hidden="true">{glyph(id)} </span>
    {body(id)}
  </span>
);

function Fact({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 border-b border-[#efe6d2] py-2.5 last:border-b-0" data-testid={testId}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a6a2a]">{label}</dt>
      <dd className="mt-1 text-[14.5px] leading-relaxed text-slate-800">{children}</dd>
    </div>
  );
}

function H4({ children }: { children: ReactNode }) {
  return <h4 className="mb-1.5 mt-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8a6a2a] first:mt-0">{children}</h4>;
}

type Row = { k: string; text: ReactNode; when: string; evidence?: ReactNode };

/** Motor kayıtlarını DEĞİŞTİRMEDEN sınıflandırır: şartları sağlanan / aday (kaynak tanımı) / şartı eksik-kesintili-belirsiz / sınıflandırılamayan. */
function groupEvents(r: WesternHoraryResult, at: (iso: string) => string) {
  const met: Row[] = [];
  const candidate: Row[] = [];
  const incomplete: Row[] = [];
  const unresolved: Row[] = [];
  const rec = (ks: string[]) => (ks.length ? ks.map((k) => RECEPTION_LABEL[k] ?? k).join(", ") : "yok");
  for (const p of r.pairs) {
    const a = p.analysis;
    for (const x of a.interpositions) {
      const row: Row = {
        k: `i${p.role}${x.atUtc}${x.third}${x.significator}`,
        text: (
          <>
            {INTERPOSITION_LABEL[x.kind]}: {body(x.significator)} {ASPECT_GLYPH[x.angle]} {body(x.third)}
          </>
        ),
        when: x.atUtc,
      };
      if (x.kind === "unresolved") unresolved.push({ ...row, evidence: x.unresolvedReason ? `Neden: ${UNRESOLVED_REASON[x.unresolvedReason]}` : undefined });
      else candidate.push(row);
    }
    for (const t of a.translations) {
      const row: Row = {
        k: `t${p.role}${t.by}${t.from}${t.to}`,
        text: (
          <>
            Işık aktarımı — {body(t.by)}: {body(t.from)} → {body(t.to)} · <strong className="font-semibold">{TRANSLATION_STATUS[t.status]}</strong>
          </>
        ),
        when: t.joinsAt,
        evidence: (
          <>
            Ayrılma {at(t.separatedAt)} · birleşme {at(t.joinsAt)}
            {t.status === "valid" && (
              <>
                {" "}
                · CA s. 125: göstergeler ayrılmış {t.judgement.significatorsSeparated ? "evet" : "hayır"}, kabul {rec(t.judgement.receivedBy)}
              </>
            )}
            {t.interruptions.length > 0 && <> · araya girenler: {t.interruptions.map((i) => `${body(i.with)} ${ASPECT_GLYPH[i.angle]} (${at(i.atUtc)}${i.orderUncertain ? ", sırası belirsiz" : ""})`).join("; ")}</>}
          </>
        ),
      };
      if (t.status === "valid" && t.judgement.ok) met.push(row);
      else incomplete.push(row);
    }
    for (const x of a.collections) {
      const row: Row = {
        k: `c${p.role}${x.by}`,
        text: (
          <>
            Işık toplanması — {body(x.by)} · <strong className="font-semibold">{x.ok ? "CA s. 126 şartları sağlanıyor" : "şartı eksik"}</strong>
          </>
        ),
        when: x.aAt > x.bAt ? x.aAt : x.bAt,
        evidence: (
          <>
            {body(p.a)} {at(x.aAt)}, {body(p.b)} {at(x.bAt)} · kabul: {body(p.a)} {rec(x.receivedByA)}, {body(p.b)} {rec(x.receivedByB)} · göstergeler birbirine bakmıyor: {x.significatorsNotAspecting ? "evet" : "hayır"}
          </>
        ),
      };
      if (x.ok) met.push(row);
      else incomplete.push(row);
    }
    if (a.refranation)
      candidate.push({
        k: `r${p.role}`,
        text: (
          <>
            Refranation adayı: {body(p.a)}–{body(p.b)} kesinleşmeden geri dönüyor (en küçük uzaklık {dm(a.refranation.minOrb)})
          </>
        ),
        when: a.refranation.atUtc,
      });
  }
  return { met, candidate, incomplete, unresolved };
}

function EventList({ rows, at, testId }: { rows: Row[]; at: (iso: string) => string; testId?: string }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-slate-500" data-testid={testId}>
        Yok.
      </p>
    );
  return (
    <ul className="grid gap-2" data-testid={testId}>
      {rows.map((x) => (
        <li key={x.k} className="min-w-0 break-words text-[14px] leading-relaxed">
          {x.text} <span className="text-slate-500">· {at(x.when)}</span>
          {x.evidence && (
            <details className="mt-0.5">
              <summary className="inline-flex min-h-[32px] cursor-pointer items-center text-xs text-[#7a5a1e] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9a54e]">Kanıt</summary>
              <p className="break-words text-[13px] text-slate-600">{x.evidence}</p>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Dosya indirme (Word / PDF): yanıt gövdesi → Blob → indirme. Hata gövdesi JSON ise okunur metin; 5xx genel metin. */
async function downloadFile(url: string, init: { method: "GET" | "POST"; body?: string }, fallback: string): Promise<{ ok: true; name: string } | { ok: false; text: string }> {
  try {
    const res = await fetch(astroPath(url), { method: init.method, body: init.body, headers: astroHeaders(init.method === "POST"), cache: "no-store" });
    if (!res.ok) {
      let text = res.status >= 500 ? "Sunucu hatası nedeniyle rapor oluşturulamadı. Biraz sonra tekrar deneyin." : "Rapor oluşturulamadı.";
      try {
        const j = (await res.json()) as { error?: unknown };
        if (res.status < 500 && typeof j.error === "string") text = j.error;
      } catch {}
      return { ok: false, text };
    }
    const blob = await res.blob();
    const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get("content-disposition") ?? "");
    const name = m ? decodeURIComponent(m[1]) : fallback;
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return { ok: true, name };
  } catch {
    return { ok: false, text: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin." };
  }
}

function ReportButtons({ busy, onDownload, children }: { busy: "docx" | "pdf" | null; onDownload: (f: "docx" | "pdf") => void; children?: ReactNode }) {
  return (
    <>
      <button type="button" className={`${atlasSecondaryBtn} min-h-[44px]`} disabled={!!busy} onClick={() => onDownload("docx")} data-testid="horary-report-docx">
        {busy === "docx" ? "Hazırlanıyor…" : "Word indir"}
      </button>
      <button type="button" className={`${atlasSecondaryBtn} min-h-[44px]`} disabled={!!busy} onClick={() => onDownload("pdf")} data-testid="horary-report-pdf">
        {busy === "pdf" ? "Hazırlanıyor…" : "PDF indir"}
      </button>
      {children}
    </>
  );
}

function StatusLine({ msg, testId }: { msg: { ok: boolean; text: string } | null; testId: string }) {
  if (!msg) return null;
  return (
    <span role={msg.ok ? "status" : "alert"} className={`basis-full text-sm ${msg.ok ? "text-emerald-800" : "text-rose-800"}`} data-testid={testId}>
      {msg.text}
    </span>
  );
}

/**
 * Word / PDF (kaydedilmemiş harita): hesaplama girdileri sunucuya yeniden gönderilir ve harita sunucuda YENİDEN hesaplanır.
 * Soru metni yalnız uzman işaretlediyse ve yalnız bu rapor için gönderilir (saklanmaz, günlüğe yazılmaz).
 */
function ReportBar({ snap, demo }: { snap: Snapshot; demo: boolean }) {
  const [withQuestion, setWithQuestion] = useState(true);
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function download(format: "docx" | "pdf") {
    if (busy) return;
    setBusy(format);
    setMsg(null);
    const r = await downloadFile(
      `/api/admin/astroloji/horary/western/report?format=${format}`,
      { method: "POST", body: JSON.stringify({ date: snap.date, time: snap.time, locationId: snap.placeId, quesitedHouse: snap.house, ...(snap.dst ? { dst: snap.dst } : {}), ...(withQuestion && snap.question ? { question: snap.question } : {}), demo }) },
      `Horary.${format}`,
    );
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: `${format === "docx" ? "Word" : "PDF"} raporu indirildi: ${r.name}` } : { ok: false, text: r.text });
  }
  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-[#efe6d2] pt-3" data-testid="horary-report-bar">
      <ReportButtons busy={busy} onDownload={(f) => void download(f)}>
        {snap.question && (
          <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-[#b8954e]" checked={withQuestion} onChange={(e) => setWithQuestion(e.target.checked)} data-testid="horary-report-question" />
            Soru metnini rapora ekle
          </label>
        )}
      </ReportButtons>
      <span className="basis-full text-xs text-slate-500">Rapor sunucuda yeniden hesaplanır; soru metni yalnız işaretliyse bu rapor için gönderilir ve saklanmaz.</span>
      <StatusLine msg={msg} testId="horary-report-msg" />
    </div>
  );
}

/**
 * Kaydet: başlık (zorunlu), isteğe bağlı danışan, "soru metnini de kaydet" (VARSAYILAN KAPALI; rapor izninden bağımsız).
 * Aynı harita için istek kimliği sabittir → çift tıklama / yeniden deneme TEK kayıt üretir. Sunucu haritayı yeniden hesaplar.
 */
function SaveBar({ r, snap, demo }: { r: WesternHoraryResult; snap: Snapshot; demo: boolean }) {
  const [reqId] = useState(() => crypto.randomUUID());
  const defaultTitle = (snap.question || `Horary — ${r.question.localDate.split("-").reverse().join(".")} ${r.question.localTime} · ${snap.house}. ev`).slice(0, 200);
  const [title, setTitle] = useState(defaultTitle);
  const [client, setClient] = useState<PickedClient | null>(null);
  const [saveQuestion, setSaveQuestion] = useState(false);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string; id?: string }>({ kind: "idle" });
  const savingRef = useRef(false);
  async function save() {
    if (savingRef.current || state.kind === "saved") return;
    if (!title.trim()) {
      setState({ kind: "error", text: "Kayıt başlığı gerekli." });
      return;
    }
    savingRef.current = true;
    setState({ kind: "saving" });
    const res = await astroFetch<{ ok: true; reused: boolean; record: { id: string } }>("/api/admin/astroloji/horary/western/records", {
      method: "POST",
      body: {
        date: snap.date,
        time: snap.time,
        locationId: snap.placeId,
        quesitedHouse: snap.house,
        ...(snap.dst ? { dst: snap.dst } : {}),
        title: title.trim(),
        saveRequestId: reqId,
        ...(client ? { clientId: client.id } : {}),
        ...(saveQuestion && snap.question ? { saveQuestion: true, question: snap.question } : {}),
        demo,
      },
    });
    savingRef.current = false;
    if (res.ok) {
      setState({ kind: "saved", id: res.data.record.id, text: res.data.reused ? "Bu harita zaten kayıtlı." : "Kaydedildi. Analiz Arşivi → Horary Soruları içinde bulabilirsiniz." });
      return;
    }
    setState({ kind: "error", text: res.status >= 500 || res.status === 0 ? "Kayıt şu anda yapılamadı. Girdileriniz korunuyor; tekrar deneyin." : res.error });
  }
  const locked = state.kind === "saving" || state.kind === "saved";
  return (
    <div className="mt-3 grid min-w-0 gap-3 border-t border-[#efe6d2] pt-3" data-testid="horary-save-bar">
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <label className="grid min-w-0 gap-1.5">
          <span className="text-sm font-medium text-slate-700">Kayıt başlığı</span>
          <input className={`${atlasPaperInput} ${ctl}`} value={title} maxLength={200} disabled={locked} onChange={(e) => setTitle(e.target.value)} data-testid="horary-save-title" />
        </label>
        <div className="grid min-w-0 gap-1.5">
          <span className="text-sm font-medium text-slate-700">Danışan (isteğe bağlı)</span>
          <HoraryClientPick value={client} onChange={setClient} disabled={locked} testId="horary-save-client" />
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button type="button" className={`${atlasPrimaryBtn} min-h-[44px]`} disabled={locked} aria-busy={state.kind === "saving"} onClick={() => void save()} data-testid="horary-save">
          {state.kind === "saving" ? "Kaydediliyor…" : state.kind === "saved" ? "Kaydedildi" : state.kind === "error" ? "Tekrar dene" : "Kaydet"}
        </button>
        {snap.question && (
          <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-[#b8954e]" checked={saveQuestion} disabled={locked} onChange={(e) => setSaveQuestion(e.target.checked)} data-testid="horary-save-question" />
            Soru metnini de kaydet
          </label>
        )}
        {state.kind === "saved" && state.id && (
          <button type="button" className={`${atlasSecondaryBtn} min-h-[44px]`} onClick={() => openHoraryRecord(state.id!)} data-testid="horary-saved-open">
            Kayıtlı haritayı aç
          </button>
        )}
        <span className="basis-full text-xs text-slate-500">Harita kayıt anındaki hesaplamayla saklanır ve sonradan değişmez. Soru metni yalnız işaretlerseniz kaydedilir.</span>
        <StatusLine msg={state.kind === "saved" ? { ok: true, text: state.text ?? "Kaydedildi." } : state.kind === "error" ? { ok: false, text: state.text ?? "Kayıt yapılamadı." } : null} testId="horary-save-msg" />
      </div>
    </div>
  );
}

type SavedRecord = {
  id: string;
  title: string;
  clientId: string | null;
  clientLabel: string | null;
  clientMissing: boolean;
  localDate: string;
  localTime: string;
  quesitedHouse: number;
  methodologyVersion: string;
  orbVariant: string;
  isDemo: boolean;
  createdAt: string;
  questionText: string | null;
};

/** Kayıtlı Horary: anlık görüntüden açılır (yeniden hesap YOK). Düzenlenebilir: başlık, danışan bağlantısı. Rapor kayıttan. */
function SavedRecordView({ id }: { id: string }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; text: string } | { kind: "ok"; rec: SavedRecord; r: WesternHoraryResult }>({ kind: "loading" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    void astroFetch<{ record: SavedRecord; result: WesternHoraryResult }>(`/api/admin/astroloji/horary/western/records/${id}`).then((res) => {
      if (!alive) return;
      if (res.ok) setState({ kind: "ok", rec: res.data.record, r: res.data.result });
      else setState({ kind: "error", text: res.status === 404 ? "Kayıt bulunamadı ya da bu kayda erişim yetkiniz yok." : res.status >= 500 || res.status === 0 ? "Kayıt yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin." : res.error });
    });
    return () => {
      alive = false;
    };
  }, [id, reload]);
  if (state.kind === "loading")
    return (
      <p className="px-1 text-sm text-[#F6F2EA]/80 max-sm:px-3" role="status" data-testid="horary-record-loading">
        Kayıtlı harita yükleniyor…
      </p>
    );
  if (state.kind === "error")
    return (
      <div role="alert" className={`${atlasPanel} flex flex-wrap items-center gap-3 px-4 py-4 text-sm text-rose-800 sm:px-6`} data-testid="horary-record-error">
        {state.text}
        <button
          type="button"
          className={`${atlasSecondaryBtn} min-h-[44px]`}
          onClick={() => {
            setState({ kind: "loading" });
            setReload((n) => n + 1);
          }}
        >
          Tekrar dene
        </button>
        <button type="button" className={`${atlasSecondaryBtn} min-h-[44px]`} onClick={() => (window.location.hash = "horary-lilly")}>
          Yeni Horary sorusu
        </button>
      </div>
    );
  const { rec, r } = state;
  const snap: Snapshot = { date: rec.localDate, time: rec.localTime, placeId: "", house: rec.quesitedHouse, question: rec.questionText ?? rec.title };
  return <HoraryResult r={r} snap={snap} demo={rec.isDemo} actions={<SavedBar rec={rec} onSaved={(x) => setState({ kind: "ok", rec: { ...rec, ...x }, r })} />} />;
}

function SavedBar({ rec, onSaved }: { rec: SavedRecord; onSaved: (x: Partial<SavedRecord>) => void }) {
  const [title, setTitle] = useState(rec.title);
  const [busy, setBusy] = useState<"docx" | "pdf" | "save" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [withQuestion, setWithQuestion] = useState(true);
  async function patch(body: Record<string, unknown>, okText: string) {
    setBusy("save");
    setMsg(null);
    const res = await astroFetch<{ record: Partial<SavedRecord> }>(`/api/admin/astroloji/horary/western/records/${rec.id}`, { method: "PATCH", body });
    setBusy(null);
    if (res.ok) {
      onSaved({ title: res.data.record.title, clientId: res.data.record.clientId ?? null, clientLabel: res.data.record.clientLabel ?? null, clientMissing: false });
      setMsg({ ok: true, text: okText });
    } else setMsg({ ok: false, text: res.status >= 500 || res.status === 0 ? "Güncelleme yapılamadı; tekrar deneyin." : res.error });
  }
  async function download(format: "docx" | "pdf") {
    if (busy) return;
    setBusy(format);
    setMsg(null);
    const q = withQuestion && rec.questionText ? "&question=1" : "";
    const r = await downloadFile(`/api/admin/astroloji/horary/western/records/${rec.id}/report?format=${format}${q}`, { method: "GET" }, `Horary.${format}`);
    setBusy(null);
    setMsg(r.ok ? { ok: true, text: `${format === "docx" ? "Word" : "PDF"} raporu indirildi: ${r.name}` } : { ok: false, text: r.text });
  }
  const saved = new Date(rec.createdAt);
  return (
    <div className="mt-3 grid min-w-0 gap-3 border-t border-[#efe6d2] pt-3" data-testid="horary-saved-bar">
      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600" data-testid="horary-saved-meta">
        <span className="rounded-full border border-[#d9c9a3] bg-[#f5ecd7] px-2.5 py-0.5 font-semibold tracking-[0.12em] text-[#7a5a1e]">KAYITLI HARİTA</span>
        <span>William Lilly · {rec.methodologyVersion}</span>
        <span>· kaydedildi {Number.isNaN(saved.getTime()) ? rec.createdAt : saved.toLocaleString("tr-TR")}</span>
        <span className="basis-full">Bu harita kayıt anındaki hesaplamadır; hesap motoru güncellense de değişmez.</span>
      </p>
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-1.5">
          <label htmlFor="horary-saved-title" className="text-sm font-medium text-slate-700">
            Kayıt başlığı
          </label>
          <span className="flex min-w-0 gap-2">
            <input id="horary-saved-title" className={`${atlasPaperInput} ${ctl} flex-1`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-testid="horary-saved-title" />
            <button type="button" className={`${atlasSecondaryBtn} min-h-[44px] shrink-0`} disabled={busy === "save" || !title.trim() || title.trim() === rec.title} onClick={() => void patch({ title: title.trim() }, "Başlık güncellendi.")} data-testid="horary-saved-title-save">
              Kaydet
            </button>
          </span>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <span className="text-sm font-medium text-slate-700">Danışan (isteğe bağlı)</span>
          <HoraryClientPick value={rec.clientId && rec.clientLabel ? { id: rec.clientId, label: rec.clientLabel } : null} disabled={busy === "save"} onChange={(c) => void patch({ clientId: c ? c.id : null }, c ? "Danışan bağlandı." : "Danışan bağlantısı kaldırıldı.")} testId="horary-saved-client" />
          {rec.clientMissing && <span className="text-xs text-amber-800">Bağlı danışana artık erişilemiyor (silinmiş olabilir). Kayıt korunuyor.</span>}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ReportButtons busy={busy === "save" ? null : busy} onDownload={(f) => void download(f)}>
          {rec.questionText && (
            <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-[#b8954e]" checked={withQuestion} onChange={(e) => setWithQuestion(e.target.checked)} data-testid="horary-report-question" />
              Kayıtlı soru metnini rapora ekle
            </label>
          )}
        </ReportButtons>
        <button type="button" className={`${atlasSecondaryBtn} min-h-[44px]`} onClick={() => (window.location.hash = "horary-lilly")} data-testid="horary-new-question">
          Yeni Horary sorusu
        </button>
        <StatusLine msg={msg} testId="horary-saved-msg" />
      </div>
    </div>
  );
}

function HoraryResult({ r, snap, demo, actions }: { r: WesternHoraryResult; snap: Snapshot; demo: boolean; actions?: ReactNode }) {
  const question = snap.question;
  const c = r.chart;
  const tz = r.question.timezone;
  const wheel = useMemo(() => horaryWheel(r), [r]);
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
  const side = boxW >= SIDE_BY_SIDE_MIN;
  const main = r.pairs.find((p) => p.role === "lord1_lordN") ?? null;
  const moonPair = r.pairs.find((p) => p.role === "moon_lordN") ?? null;
  const at = (iso: string) => localAt(iso, tz);
  const ascSign = signAt(c.cusps[0]);
  const qSign = signAt(c.cusps[r.significators.quesitedHouse - 1]);
  const g = useMemo(() => groupEvents(r, (iso) => localAt(iso, r.question.timezone)), [r]);
  const others = g.candidate.length + g.incomplete.length + g.unresolved.length;
  const openCandidates = () => {
    const el = document.getElementById("horary-all-candidates");
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.querySelector("summary")?.focus({ preventScroll: true });
    }
  };
  const mutual = c.planets.flatMap((p) => p.mutualReception.map((m) => ({ k: `${p.planet}${m.with}${m.by}`, a: p.planet, b: m.with, by: m.by, pts: m.points })));
  const hosts = [...new Set(c.receptions.map((x) => x.host))];
  const near = c.aspects.filter((a) => a.withinMoieties);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="horary-result">
      <section className={`${atlasPanel} px-4 py-4 sm:px-6`} aria-label="Soru bilgisi">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {question && <p className="break-words text-[17px] font-medium text-[#0b1430] [font-family:var(--font-atlas-display)]">{question}</p>}
            <p className="mt-1 break-words text-sm text-slate-600" data-testid="horary-moment">
              {r.question.localDate.split("-").reverse().join(".")} {r.question.localTime} — {r.question.place} ({offsetLabel(r.question.offsetSeconds)}) · {r.question.utc.replace("T", " ").replace("Z", " UTC")}
            </p>
          </div>
          {demo && <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.12em] text-amber-800">DEMO GİRDİSİ</span>}
        </div>
        {actions}
      </section>

      <div ref={boxRef} className={`grid min-w-0 items-start gap-4 ${side ? "grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : "grid-cols-1"}`} data-testid="horary-main" data-layout={side ? "side" : "stack"}>
        <section className={`${atlasPanel} flex min-w-0 justify-center px-1 py-2 sm:px-3 sm:py-3`} aria-label="Horary çarkı" data-testid="horary-wheel">
          <NatalWheel technical={wheel} label="Horary soru haritası çarkı" tinted sizeClassName={`h-auto w-full ${side ? "max-w-[640px]" : "max-w-[600px]"}`} />
        </section>

        <section className={`${atlasPanel} min-w-0 px-4 py-3 sm:px-6`} aria-label="Temel bulgular" data-testid="horary-summary">
          <dl>
            <Fact label="Göstergeler" testId="horary-sig">
              Soran: {P(r.significators.querent)} <span className="text-slate-500">(1. ev, {signGlyph(ascSign)} {sign(ascSign)})</span>
              <br />
              Sorulan: {P(r.significators.quesited)} <span className="text-slate-500">({r.significators.quesitedHouse}. ev, {signGlyph(qSign)} {sign(qSign)})</span>
              <br />
              Ortak gösterge: {P("moon")}
              {r.significators.sameRuler && <span className="mt-1 block text-sm text-amber-800">Soran ve sorulan aynı gezegen — gösterge çifti analizi yapılmaz; Ay ilişkisi gösterilir.</span>}
            </Fact>
            {main && (
              <Fact label="Göstergeler arasındaki ilişki" testId="horary-relation">
                Şu an: {ASPECT_LABEL[main.analysis.now.angle]}, {dm(main.analysis.now.orb)} uzaklık · {main.analysis.now.applying ? "yaklaşıyor" : "ayrılıyor"} · {main.analysis.now.withinMoieties ? "orb içinde" : "orb dışında"}
                <br />
                {main.analysis.perfection ? (
                  <>
                    Kesinleşme: {ASPECT_GLYPH[main.analysis.perfection.angle]} {ASPECT_LABEL[main.analysis.perfection.angle]} — {at(main.analysis.perfection.atUtc)} <span className="text-slate-500">{uncertaintyLabel(main.analysis.perfection.uncertaintySec)}</span>
                  </>
                ) : (
                  <span className="text-slate-600">{r.horizonDays} günlük hesaplama ufkunda kesinleşme yok.</span>
                )}
              </Fact>
            )}
            {moonPair && (
              <Fact label={`Ay ile ${body(moonPair.b)}`}>
                {moonPair.analysis.perfection ? (
                  <>
                    Kesinleşme: {ASPECT_GLYPH[moonPair.analysis.perfection.angle]} {ASPECT_LABEL[moonPair.analysis.perfection.angle]} — {at(moonPair.analysis.perfection.atUtc)}
                  </>
                ) : (
                  <span className="text-slate-600">{r.horizonDays} günlük hesaplama ufkunda kesinleşme yok.</span>
                )}
              </Fact>
            )}
            <Fact label="Ay’ın durumu" testId="horary-moon">
              {signGlyph(c.moon.sign)} {sign(c.moon.sign)} · burç değişimi {at(c.moon.ingressUtc)}
              <br />
              {c.moon.voidOfCourse ? (
                <strong className="font-semibold text-amber-800">Ay boşlukta — burç içinde yeni açı yok.</strong>
              ) : (
                c.moon.nextInSign[0] && (
                  <>
                    Sonraki açı: {ASPECT_GLYPH[c.moon.nextInSign[0].angle]} {body(c.moon.nextInSign[0].b)} — {at(c.moon.nextInSign[0].atUtc)}
                  </>
                )
              )}
              {c.moon.last && (
                <span className="block text-sm text-slate-600">
                  Son açı: {ASPECT_GLYPH[c.moon.last.angle]} {body(c.moon.last.b)} — {at(c.moon.last.atUtc)}
                </span>
              )}
            </Fact>
            <Fact label="Klasik şartları sağlanan olaylar" testId="horary-met">
              {g.met.length === 0 ? <span className="block text-slate-600">Hesaplama ufkunda şartları tam sağlanan ışık aktarımı veya toplanması yok.</span> : <EventList rows={g.met} at={at} />}
              {others > 0 && (
                <button type="button" onClick={openCandidates} className="mt-2 flex w-fit max-w-full min-h-[44px] items-center text-left text-sm font-medium text-[#7a5a1e] underline underline-offset-2 hover:text-[#0b1430] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9a54e]" data-testid="horary-others-link">
                  İncelenecek diğer olaylar: {[g.candidate.length > 0 && `${g.candidate.length} aday`, g.incomplete.length > 0 && `${g.incomplete.length} şartı eksik / kesintili`, g.unresolved.length > 0 && `${g.unresolved.length} sınıflandırılamayan`].filter(Boolean).join(" · ")} →
                </button>
              )}
            </Fact>
            <Fact label="Radikallik ve dikkat noktaları" testId="horary-considerations">
              {c.radicality && (
                <span className="block text-sm">
                  Saat yöneticisi {c.radicality.hourRuler ? body(c.radicality.hourRuler) : "—"}, yükselen yöneticisi {body(c.radicality.ascRuler)}: {c.radicality.same ? "aynı gezegen" : c.radicality.hourRulerRulesAscTriplicity ? "aynı üçlü" : "aynı değil, üçlü ortak değil"} <span className="text-slate-500">(CA s. 121)</span>
                </span>
              )}
              {c.considerations.length === 0 ? (
                <span className="text-sm text-slate-600">Lilly’nin dikkat noktalarından (CA s. 121–123) hiçbiri yok.</span>
              ) : (
                <ul className="mt-1 grid gap-0.5">
                  {c.considerations.map((x) => (
                    <li key={x.key} className="text-[14px]">
                      {CONSIDERATION_LABEL[x.key] ?? x.key}
                    </li>
                  ))}
                </ul>
              )}
            </Fact>
          </dl>
        </section>
      </div>

      <section className={`${atlasPanel} min-w-0 px-4 py-4 sm:px-6`} aria-label="Olay çizelgesi" data-testid="horary-timeline">
        <h3 className="text-[15px] font-medium text-[#0b1430]">Olay çizelgesi · sonraki {r.horizonDays} gün</h3>
        <p className="text-xs text-slate-500">Göstergelerle ilgili astronomik olaylar; kesintili ışık aktarımları burada gösterilmez.</p>
        {r.timeline.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Ufuk içinde göstergelerle ilgili olay yok.</p>
        ) : (
          <ol className="mt-2 grid gap-0">
            {r.timeline.map((e) => (
              <li key={`${e.atUtc}${e.bodies.join()}`} className="grid min-w-0 gap-x-3 border-b border-[#efe6d2] py-2 text-[14px] last:border-b-0 sm:grid-cols-[11.5rem_minmax(0,1fr)]">
                <span className="tabular-nums text-slate-600">
                  {at(e.atUtc)} {uncertaintyLabel(e.uncertaintySec) && <span className="text-xs text-slate-400">{uncertaintyLabel(e.uncertaintySec)}</span>}
                </span>
                <span className="min-w-0 break-words">
                  {e.bodies.length === 2 ? (
                    <>
                      {glyph(e.bodies[0])} {body(e.bodies[0])} {e.angle !== null ? ASPECT_GLYPH[e.angle] : "→"} {glyph(e.bodies[1])} {body(e.bodies[1])}
                    </>
                  ) : (
                    <>
                      {glyph(e.bodies[0])} {body(e.bodies[0])}
                    </>
                  )}
                  <span className="text-slate-500">
                    {" · "}
                    {e.tags
                      .map((t) =>
                        t.kind === "station"
                          ? `${TIMELINE_TAG.station} (${t.note === "retrograde" ? "geri" : "düz"})`
                          : t.kind === "ingress" && t.note
                            ? `${TIMELINE_TAG.ingress}: ${t.note.split("→").map(sign).join(" → ")}`
                            : t.kind === "interposition" && t.note
                              ? INTERPOSITION_LABEL[t.note] ?? TIMELINE_TAG.interposition
                              : t.kind === "translation_join" && t.note
                                ? `${TIMELINE_TAG.translation_join} · ${TRANSLATION_STATUS[t.note]}`
                                : TIMELINE_TAG[t.kind],
                      )
                      .join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Section title="Gezegenler · temel ve arızi asalet" hint="Konum, ev, hız, asalet ve puanlar" testId="horary-planets">
        <div className="-mx-1 overflow-x-auto" role="region" aria-label="Gezegen tablosu (yatay kaydırılabilir)" tabIndex={0} data-testid="horary-planets-scroll">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[13.5px]">
            <thead className="text-[11px] uppercase tracking-[0.1em] text-[#8a6a2a]">
              <tr>
                {["Gezegen", "Konum", "Ev", "Hız °/gün", "Temel asalet", "Temel puan", "Arızi puan", "Güneş’e göre"].map((h, i) => (
                  <th key={h} className={`px-2 py-1.5 font-semibold ${i === 0 ? "sticky left-0 bg-[#FBF8F2]" : ""}`} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.planets.map((p) => {
                const e = p.essential;
                const dig = [e.domicile && "ev", e.exaltation && "yücelme", e.triplicity && "üçlü", e.term && "terim", e.face && "yüz", e.detriment && "zarar", e.fall && "düşüş", e.peregrine && "peregrine"].filter(Boolean).join(", ");
                return (
                  <tr key={p.planet} className="align-top">
                    <th scope="row" className="sticky left-0 border-t border-[#efe6d2] bg-[#FBF8F2] px-2 py-2 text-left font-medium">
                      {P(p.planet)}
                    </th>
                    <td className="border-t border-[#efe6d2] px-2 py-2 tabular-nums">
                      {lonLabel(p.lon)}
                      {p.retrograde && (
                        <span className="ml-1 text-rose-700" title="geri">
                          ℞
                        </span>
                      )}
                    </td>
                    <td className="border-t border-[#efe6d2] px-2 py-2">
                      {p.house}
                      {p.houseVirtue?.shifted && <span className="block text-xs text-slate-500">etkisi {p.houseVirtue.virtueHouse}. evde (5° kuralı)</span>}
                    </td>
                    <td className="border-t border-[#efe6d2] px-2 py-2 tabular-nums">{p.speed.toFixed(3)}</td>
                    <td className="border-t border-[#efe6d2] px-2 py-2">{dig || "—"}</td>
                    <td className="border-t border-[#efe6d2] px-2 py-2 tabular-nums">{e.score ?? "—"}</td>
                    <td className="border-t border-[#efe6d2] px-2 py-2 tabular-nums">{p.accidental.total ?? "—"}</td>
                    <td className="border-t border-[#efe6d2] px-2 py-2">{p.solar ? SOLAR_PHASE[p.solar.phase] : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <H4>Arızi puan kalemleri</H4>
        <ul className="grid gap-1">
          {c.planets.map((p) => (
            <li key={p.planet}>
              <details>
                <summary className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c9a54e]">
                  {P(p.planet)} <span className="text-slate-500">· toplam {p.accidental.total ?? "—"}</span>
                </summary>
                <ul className="mb-1 ml-5 grid gap-0.5 text-[13px] text-slate-600">
                  {p.accidental.items.map((i) => (
                    <li key={i.key}>
                      {accidentalLabel(i.key)}: {i.points !== null && i.points > 0 ? "+" : ""}
                      {i.points ?? "—"}
                      {i.note && <span className="text-slate-500"> ({i.note})</span>}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Ev başlangıçları · Regiomontanus" hint="12 ev, Şans Noktası, gündüz/gece, gezegen saati" testId="horary-cusps">
        <ol className="grid gap-x-6 gap-y-1 text-[14px] tabular-nums sm:grid-cols-2 lg:grid-cols-3">
          {c.cusps.map((lon, i) => (
            <li key={i}>
              <span className="inline-block w-12 text-slate-500">{i + 1}. ev</span> {lonLabel(lon)}
            </li>
          ))}
        </ol>
        <ul className="mt-3 grid gap-1 text-[13.5px] text-slate-700">
          <li>
            Şans Noktası: {lonLabel(c.partOfFortune.lon)} ({c.partOfFortune.house}. ev)
          </li>
          <li>
            {c.sect.day ? "Gündüz haritası" : "Gece haritası"} · Güneş irtifası {c.sect.sunAltitude.toFixed(1)}°
          </li>
          {c.planetaryHour && (
            <li>
              Gezegen saati: {body(c.planetaryHour.hourRuler)} · günün yöneticisi {body(c.planetaryHour.dayRuler)}
            </li>
          )}
        </ul>
      </Section>

      <Section title="Kabul ilişkileri ve anlık açılar" hint="Karşılıklı kabul, tek yönlü kabul, orb içindeki açılar" testId="horary-receptions">
        <H4>Karşılıklı kabul</H4>
        {mutual.length === 0 ? (
          <p className="text-sm text-slate-500">Yok.</p>
        ) : (
          <ul className="grid gap-1 text-[14px]">
            {mutual.map((m) => (
              <li key={m.k}>
                {body(m.a)} ↔ {body(m.b)} · {RECEPTION_LABEL[m.by]}
                {m.pts !== null && <span className="text-slate-500"> (+{m.pts} puan, CA s. 115)</span>}
              </li>
            ))}
          </ul>
        )}
        <H4>Tek yönlü kabul (kabul eden → kabul edilen)</H4>
        {hosts.length === 0 ? (
          <p className="text-sm text-slate-500">Yok.</p>
        ) : (
          <ul className="grid gap-1 text-[14px]">
            {hosts.map((h) => (
              <li key={h} className="break-words">
                <strong className="font-medium">{body(h)}</strong> →{" "}
                {c.receptions
                  .filter((x) => x.host === h)
                  .map((x) => `${body(x.guest)} (${x.by.map((k) => RECEPTION_LABEL[k] ?? k).join(", ")})`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        )}
        {(["applying", "separating"] as const).map((kind) => {
          const list = near.filter((a) => (kind === "applying" ? a.applying : !a.applying));
          return (
            <div key={kind}>
              <H4>{kind === "applying" ? "Yaklaşan açılar (orb içinde)" : "Ayrılan açılar (orb içinde)"}</H4>
              {list.length === 0 ? (
                <p className="text-sm text-slate-500">Yok.</p>
              ) : (
                <ul className="grid gap-1 text-[14px]">
                  {list.map((a) => (
                    <li key={`${a.a}${a.b}`}>
                      {body(a.a)} {ASPECT_GLYPH[a.angle]} {body(a.b)} · {ASPECT_LABEL[a.angle]} · {dm(a.orb)}
                      {!a.bySign && <span className="text-slate-500"> · burç dışı</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </Section>

      <Section title="Tüm olaylar ve kanıtları" hint="Şartları sağlanan, aday, eksik/kesintili ve sınıflandırılamayan kayıtlar" id="horary-all-candidates" testId="horary-all-candidates">
        <H4>Klasik şartları sağlanan</H4>
        <EventList rows={g.met} at={at} testId="horary-group-met" />
        <H4>Aday — kaynak tanımına uyan olay (değerlendirme uzmana aittir)</H4>
        <EventList rows={g.candidate} at={at} testId="horary-group-candidate" />
        <H4>Şartı eksik, kesintili veya sırası/hareketi belirsiz — geçerli sonuç değil</H4>
        <EventList rows={g.incomplete} at={at} testId="horary-group-incomplete" />
        <H4>Sınıflandırılamayan — kaynak bu durumu çözmüyor</H4>
        <EventList rows={g.unresolved} at={at} testId="horary-group-unresolved" />
      </Section>

      <Section title="Yöntem ve açık noktalar" hint="Kaynak, ev sistemi, efemeris, eğitmen kararı bekleyen noktalar" testId="horary-method">
        <ul className="grid gap-1.5 text-[13.5px] text-slate-700">
          <li>{c.profile.label}</li>
          <li>Ev sistemi: Regiomontanus · Efemeris: {c.methodology.ephemeris} · Orb: Lilly CA s. 107 birinci sütun</li>
          <li>{r.significators.rule}</li>
          {c.radicality && <li>{c.radicality.note}</li>}
          {c.considerations.map((x) => (
            <li key={x.key}>
              {CONSIDERATION_LABEL[x.key] ?? x.key}: <span className="text-slate-600">{x.evidence}</span>
            </li>
          ))}
        </ul>
        <H4>Açık noktalar</H4>
        <ul className="grid gap-1.5 text-[13.5px] text-slate-600">
          {r.openPoints.map((o) => (
            <li key={o}>{o}</li>
          ))}
          <li>Bu ekran hüküm üretmez; olaylar kaynak tanımıyla ve olay kanıtıyla listelenir.</li>
        </ul>
      </Section>
    </div>
  );
}
