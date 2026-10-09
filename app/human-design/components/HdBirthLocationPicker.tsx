"use client";

// HD doğum yeri seçici (otomatik hesaplama için).
//
//   • Anında (kredisiz): Türkiye 81 il (TR_LOCATIONS) + HD 973 resmî ilçe dizini (yerel, koordinatsız)
//     + dünya şehirleri (/api/location/search, GeoNames)
//   • İlçe / küçük yerleşim: "İlçe / şehir ara" → /api/hd/location/search (RoxyAPI Location, sunucu,
//     önbellekli). Typeahead DEĞİL → her tuşta Roxy kredisi harcanmaz.
// Bileşen yalnız seçilen konumun KİMLİĞİNİ bildirir (yerel id | sunucu imzalı ref | client/chart).
// Saat dilimi + koordinat SUNUCUDA çözülür; serbest metin seçim sayılmaz.
//
// HOTFIX (prod): liste input blur'unda 150 ms zamanlayıcıyla kapanıyordu. "İlçe / şehir ara"ya
// tıklamak input'u blur ediyor → Roxy sonucu geldikten sonra zamanlayıcı listeyi KAPATIYORDU
// (sonuç görünmüyor/seçilemiyordu). Artık standart combobox deseni: liste içindeki mousedown odağı
// input'tan almaz (preventDefault); liste yalnız odak bileşen DIŞINA çıkınca veya Esc ile kapanır.

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { searchLocations, type Location } from "@/lib/location";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { searchTrDistricts } from "@/lib/human-design/location/trDistrictIndex";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

export type HdPickedLocation = { id: string; label: string; tz: string; locationId?: string | null };
type Item = HdPickedLocation & { source: "local" | "roxy" };

const inputCls =
  "h-9 w-full rounded-xl border border-indigo-200/90 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";

/** Sunucunun doğum yeri etiketiyle BİREBİR aynı biçim (eşleştirme için). */
export function labelOf(l: Location): string {
  const region = l.adminRegion && l.adminRegion !== l.name ? `${l.adminRegion}, ` : "";
  return `${l.name}, ${region}${l.country}`;
}
const toItem = (l: Location): Item => ({ id: l.id, label: labelOf(l), tz: l.tz, source: "local" });

export function HdBirthLocationPicker({
  id,
  value,
  onChange,
  disabled,
  initialText,
  placeholder = "İl, ilçe veya şehir… (ör. Selçuklu, Berlin)",
}: {
  id?: string;
  value: HdPickedLocation | null;
  onChange: (loc: HdPickedLocation | null) => void;
  disabled?: boolean;
  /** Seçim yokken ilk görünen metin (ör. kayıtlı serbest metin doğum yeri; seçim SAYILMAZ). */
  initialText?: string;
  placeholder?: string;
}) {
  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.label ?? initialText ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [local, setLocal] = useState<Item[]>([]);
  const [remote, setRemote] = useState<Item[] | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteMsg, setRemoteMsg] = useState<string | null>(null);
  const seq = useRef(0);
  const remoteSeq = useRef(0);
  const lastRemoteQ = useRef("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dış seçim → görünen metin senkronu
    if (value) setQuery(value.label);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const my = ++seq.current;
    const provinces = q ? searchLocations(q, { dataset: TR_LOCATIONS, limit: 6 }).map(toItem) : [];
    const districts = searchTrDistricts(q, Math.max(2, 8 - provinces.length)).map((d): Item => ({ id: d.id, label: d.label, tz: d.tz, source: "local" }));
    const tr = [...provinces, ...districts];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TR sonuçları anında
    setLocal(tr);
    if (q.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/location/search?q=${encodeURIComponent(q)}&limit=6`, { signal: ac.signal })
        .then((r) => r.json())
        .then((j: { ok?: boolean; results?: Location[] }) => {
          if (my !== seq.current) return;
          const world = j.ok && Array.isArray(j.results) ? j.results.map(toItem) : [];
          // Yalnız kredisiz kaynaklar (il + dünya şehirleri). RoxyAPI ilçe/şehir araması yazarken
          // OTOMATİK başlamaz; yalnız "İlçe / şehir ara" düğmesi (ya da onun Enter kısayolu) ile.
          setLocal([...tr, ...world].slice(0, 10));
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, open]);

  const items: Item[] = [...(remote ?? []), ...local.filter((l) => !(remote ?? []).some((r) => r.label === l.label))];

  async function extendedSearch() {
    const q = query.trim();
    if (q.length < 3 || remoteBusy) return;
    if (value && value.label === q) return; // zaten seçili yer
    if (remote && remoteSeq.current > 0 && lastRemoteQ.current === q) return; // aynı sorgu zaten arandı
    lastRemoteQ.current = q;
    const my = ++remoteSeq.current;
    setOpen(true);
    setRemoteBusy(true);
    setRemoteMsg(null);
    const u = readYasamUser();
    const t = readSessionToken();
    try {
      const res = await fetch(`/api/hd/location/search?q=${encodeURIComponent(q)}`, {
        headers: { "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) },
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; results?: { ref: string; label: string; tz: string }[]; error?: string };
      if (my !== remoteSeq.current) return; // daha yeni bir arama başladı
      if (res.ok && j.ok && Array.isArray(j.results)) {
        setRemote(j.results.map((r) => ({ id: r.ref, label: r.label, tz: r.tz, source: "roxy" as const })));
        setRemoteMsg(j.results.length === 0 ? "Bu isimle yerleşim bulunamadı. Yazımı kontrol edin veya il seçin." : null);
        setActive(j.results.length > 0 ? 0 : -1);
        setOpen(true);
      } else {
        // Teknik JSON gösterilmez; sunucu zaten anlaşılır Türkçe mesaj döner.
        setRemoteMsg(typeof j.error === "string" && j.error.length < 160 ? j.error : "Konum araması şu anda yapılamadı. Lütfen tekrar deneyin.");
      }
    } catch {
      if (my === remoteSeq.current) setRemoteMsg("Ağ hatası. Bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      if (my === remoteSeq.current) setRemoteBusy(false);
    }
  }

  function choose(it: Item) {
    onChange({ id: it.id, label: it.label, tz: it.tz });
    setQuery(it.label);
    setOpen(false);
    setActive(-1);
    setRemoteMsg(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && active < items.length) choose(items[active]!);
      else void extendedSearch();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  // Yazılan metin mevcut seçimden farklıysa (yeni yer aranıyor) genişletilmiş arama sunulur.
  const canExtend = query.trim().length >= 3 && (!value || value.label !== query.trim());
  const showPanel = open && (items.length > 0 || canExtend || remoteBusy || !!remoteMsg);
  const unselected = !open && !value && query.trim().length > 0 && !disabled;

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listboxId}-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        className={`${inputCls} disabled:opacity-60`}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
          setRemote(null);
          setRemoteMsg(null);
          if (value) onChange(null); // metin değişti → önceki seçim geçersiz
        }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          // Yalnız odak bileşenin DIŞINA çıkınca kapat (liste içi tıklamalar blur üretmez).
          if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        onKeyDown={onKeyDown}
      />
      {showPanel ? (
        <div
          data-hd-location-panel
          className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-lg"
          // Liste/düğme tıklaması input'un odağını ALMAZ → liste blur ile kapanmaz.
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.length > 0 ? (
            <ul id={listboxId} role="listbox" className="m-0 max-h-64 list-none overflow-auto p-0 py-1">
              {items.map((it, i) => (
                <li
                  key={`${it.source}:${it.id}`}
                  id={`${listboxId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  data-hd-location-source={it.source}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                    i === active ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-indigo-50/60"
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(it)}
                >
                  <span className="min-w-0 truncate font-medium">{it.label}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{it.tz}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {remoteMsg ? <p className="m-0 border-t border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{remoteMsg}</p> : null}
          {canExtend ? (
            <button
              type="button"
              onClick={() => void extendedSearch()}
              disabled={remoteBusy}
              className="flex w-full items-center justify-between gap-2 border-t border-indigo-100 bg-indigo-50/50 px-3 py-2 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
            >
              <span className="min-w-0 truncate">{remoteBusy ? "Aranıyor…" : `İlçe / şehir ara: “${query.trim()}”`}</span>
              <span className="shrink-0 text-[10px] font-semibold text-indigo-500">Enter</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {unselected ? (
        <p className="mt-1 text-[11px] font-semibold text-amber-700">Listeden bir yer seçin; seçilmeyen metin doğum yeri olarak kullanılmaz.</p>
      ) : null}
    </div>
  );
}
