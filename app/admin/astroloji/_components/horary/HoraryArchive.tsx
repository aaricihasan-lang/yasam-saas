"use client";

/**
 * Analiz Arşivi → "Horary Soruları": uzmanın KENDİ William Lilly Horary kayıtları (sunucu tenant + uzman ile süzer).
 * Arama (başlık), tarih aralığı (sorunun yerel tarihi), danışan filtresi, sayfalama ("Daha fazla göster"; COUNT yok).
 * Satır → kayıtlı harita (#horary-lilly/kayit/<id>; anlık görüntüden açılır, yeniden hesap yok). Silme YOK.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, FolderOpen, MapPin, Search } from "lucide-react";
import { astroFetch } from "../../_lib/api";
import { ap } from "../atlas/premium/AtlasPremium";
import HoraryClientPick, { type PickedClient } from "./HoraryClientPick";

type Rec = { id: string; title: string; clientId: string | null; clientLabel: string | null; localDate: string; localTime: string; place: string; quesitedHouse: number; methodologyVersion: string; isDemo: boolean };
const PAGE = 20;
const day = (d: string) => d.split("-").reverse().join(".");

export function openHoraryRecord(id: string) {
  window.location.hash = `horary-lilly/kayit/${id}`;
}

export default function HoraryArchive() {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [client, setClient] = useState<PickedClient | null>(null);
  const [items, setItems] = useState<Rec[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const my = ++gen.current;
      setLoading(true);
      setError(null);
      const sp = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (q.trim()) sp.set("q", q.trim());
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      if (client) sp.set("clientId", client.id);
      const r = await astroFetch<{ records: Rec[]; hasMore: boolean }>(`/api/admin/astroloji/horary/western/records?${sp.toString()}`);
      if (my !== gen.current) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.status >= 500 || r.status === 0 ? "Horary kayıtları yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin." : r.error);
        return;
      }
      setItems((cur) => (offset === 0 ? r.data.records : [...cur, ...r.data.records]));
      setHasMore(r.data.hasMore);
    },
    [q, from, to, client],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(0), 250);
    return () => clearTimeout(t);
  }, [load]);

  const filtered = !!(q.trim() || from || to || client);
  return (
    <section className={`${ap.surface} flex min-w-0 flex-col overflow-hidden`} aria-label="Horary soruları" data-testid="horary-archive">
      <div className={`${ap.toolbar} flex-wrap`}>
        <label className={`${ap.field} min-w-[200px] flex-1`}>
          <Search className={`h-4 w-4 shrink-0 ${ap.muted}`} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} placeholder="Başlıkta ara" aria-label="Horary kayıtlarında ara" className={`${ap.fieldInput} min-h-[40px]`} data-testid="horary-archive-q" />
        </label>
        {/* Dar ekranda (< 380 px) tarih alanları alt alta: yerel tarih denetimi metni kesilmez. */}
        <div className={`grid w-full min-w-0 grid-cols-1 items-center gap-2 text-xs min-[380px]:grid-cols-2 sm:flex sm:w-auto ${ap.muted}`}>
          <CalendarDays className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Başlangıç tarihi" title="Başlangıç tarihi" className={`${ap.select} min-h-[44px] w-full min-w-0 sm:w-auto`} data-testid="horary-archive-from" />
          <span className="hidden sm:inline" aria-hidden="true">
            –
          </span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Bitiş tarihi" title="Bitiş tarihi" className={`${ap.select} min-h-[44px] w-full min-w-0 sm:w-auto`} data-testid="horary-archive-to" />
        </div>
        <div className="min-w-0 basis-full sm:basis-auto sm:min-w-[260px]">
          <HoraryClientPick value={client} onChange={setClient} testId="horary-archive-client" />
        </div>
      </div>
      {error && (
        <p className={`${ap.noteDanger} mx-4 mb-3 flex flex-wrap items-center gap-2`} role="alert" data-testid="horary-archive-error">
          {error}
          <button type="button" className={`${ap.link} font-semibold`} onClick={() => void load(0)}>
            Tekrar dene
          </button>
        </p>
      )}
      {loading && items.length === 0 ? (
        <div className="flex flex-col gap-2 p-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-12 animate-pulse rounded-xl ${ap.skeleton} motion-reduce:animate-none`} />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <p className={`px-6 py-10 text-center text-sm ${ap.muted}`} data-testid="horary-archive-empty">
          {filtered ? "Bu filtrelere uyan Horary kaydı yok." : "Henüz kayıtlı Horary sorusu yok. Horary ekranında haritayı oluşturup “Kaydet”e basın."}
        </p>
      ) : (
        <>
          <div className={`${ap.tableHead} hidden grid-cols-[minmax(0,2.4fr)_8.5rem_minmax(0,1.4fr)_5rem_minmax(0,1.3fr)_auto] items-center gap-3 px-4 py-2.5 md:grid`}>
            <span>Soru başlığı</span>
            <span>Soru anı</span>
            <span>Konum</span>
            <span>Ev</span>
            <span>Danışan</span>
            <span className="sr-only">Aç</span>
          </div>
          <ul className={ap.rows} data-testid="horary-archive-rows">
            {items.map((r) => (
              <li key={r.id} className={`${ap.row} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-sm md:grid-cols-[minmax(0,2.4fr)_8.5rem_minmax(0,1.4fr)_5rem_minmax(0,1.3fr)_auto]`}>
                <button type="button" onClick={() => openHoraryRecord(r.id)} className="min-w-0 text-left" data-horary-open={r.id}>
                  <span className={`block break-words font-semibold ${ap.ink} hover:underline`}>
                    {r.title}
                    {r.isDemo && <span className={`${ap.chipWarn} ml-1.5 align-middle !text-[10px]`}>DEMO</span>}
                  </span>
                  <span className={`mt-0.5 block text-[11px] ${ap.faint}`}>William Lilly · {r.methodologyVersion}</span>
                  <span className={`mt-0.5 block text-xs ${ap.muted} md:hidden`}>
                    {day(r.localDate)} {r.localTime} · {r.place} · {r.quesitedHouse}. ev{r.clientLabel ? ` · ${r.clientLabel}` : ""}
                  </span>
                </button>
                <span className={`hidden tabular-nums ${ap.text} md:block`}>
                  {day(r.localDate)} {r.localTime}
                </span>
                <span className={`hidden min-w-0 items-center gap-1.5 ${ap.text} md:flex`}>
                  <MapPin className={`h-3.5 w-3.5 shrink-0 ${ap.iconLav}`} aria-hidden="true" />
                  <span className="truncate">{r.place}</span>
                </span>
                <span className={`hidden ${ap.text} md:block`}>{r.quesitedHouse}. ev</span>
                <span className={`hidden min-w-0 truncate ${r.clientLabel ? "text-emerald-700" : ap.faint} md:block`}>{r.clientLabel ?? (r.clientId ? "erişilemiyor" : "—")}</span>
                <span className="flex items-center justify-end gap-1.5">
                  <button type="button" onClick={() => openHoraryRecord(r.id)} aria-label={`${r.title} kaydını aç`} title="Kayıtlı haritayı aç" className={`${ap.iconBtn} min-h-[44px] min-w-[44px]`}>
                    <FolderOpen className="h-4 w-4" />
                  </button>
                  <ChevronRight className={`hidden h-4 w-4 ${ap.faint} lg:block`} aria-hidden="true" />
                </span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="flex justify-center p-4">
              <button type="button" className={`${ap.btnLight} min-h-[44px]`} disabled={loading} onClick={() => void load(items.length)} data-testid="horary-archive-more">
                {loading ? "Yükleniyor…" : "Daha fazla göster"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
