"use client";

// HD doğum yeri seçici (otomatik hesaplama için).
//
//   • Anında (kredisiz): Türkiye 81 il (TR_LOCATIONS) + dünya şehirleri (/api/location/search, GeoNames)
//   • İlçe / küçük yerleşim: "Genişletilmiş arama" düğmesi → /api/hd/location/search (RoxyAPI
//     Location, sunucu tarafı, önbellekli). Typeahead DEĞİL → her tuşta Roxy kredisi harcanmaz.
// Bileşen yalnız seçilen konumun KİMLİĞİNİ bildirir (yerel id | sunucu imzalı ref | chart:<id>).
// Saat dilimi + koordinat SUNUCUDA bu kimlikten çözülür; serbest metin seçim sayılmaz.

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { searchLocations, type Location } from "@/lib/location";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

export type HdPickedLocation = { id: string; label: string; tz: string };
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
  const [query, setQuery] = useState(value?.label ?? initialText ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [local, setLocal] = useState<Item[]>([]);
  const [remote, setRemote] = useState<Item[] | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteMsg, setRemoteMsg] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dış seçim → görünen metin senkronu
    if (value) setQuery(value.label);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const my = ++seq.current;
    const tr = q ? searchLocations(q, { dataset: TR_LOCATIONS, limit: 6 }).map(toItem) : [];
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
    setRemoteBusy(true);
    setRemoteMsg(null);
    const u = readYasamUser();
    const t = readSessionToken();
    try {
      const res = await fetch(`/api/hd/location/search?q=${encodeURIComponent(q)}`, {
        headers: { "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) },
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; results?: { ref: string; label: string; tz: string }[]; error?: string };
      if (res.ok && j.ok && Array.isArray(j.results)) {
        setRemote(j.results.map((r) => ({ id: r.ref, label: r.label, tz: r.tz, source: "roxy" as const })));
        if (j.results.length === 0) setRemoteMsg("Bu isimle yerleşim bulunamadı.");
        setOpen(true);
      } else {
        setRemoteMsg(j.error ?? "Genişletilmiş arama yapılamadı.");
      }
    } catch {
      setRemoteMsg("Ağ hatası. Bağlantınızı kontrol edin.");
    } finally {
      setRemoteBusy(false);
    }
  }

  function choose(it: Item) {
    onChange({ id: it.id, label: it.label, tz: it.tz });
    setQuery(it.label);
    setOpen(false);
    setActive(-1);
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

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
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
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (items.length > 0 || canExtend) ? (
        <div
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-lg"
          onMouseDown={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {items.length > 0 ? (
            <ul id={listboxId} role="listbox" className="m-0 max-h-64 list-none overflow-auto p-0 py-1">
              {items.map((it, i) => (
                <li
                  key={`${it.source}:${it.id}`}
                  id={`${listboxId}-${i}`}
                  role="option"
                  aria-selected={i === active}
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
      {remoteMsg ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{remoteMsg}</p> : null}
    </div>
  );
}
