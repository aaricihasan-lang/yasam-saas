"use client";
/**
 * Neutral Danışan seçici (module-coupling YOK). /api/clients list'ini kullanır
 * (yeni backend YOK). MemoryPicker'a bağımlı DEĞİL. Beslenme + diğer modüller REUSE edebilir.
 */
import { useEffect, useRef, useState } from "react";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

export type PickerClient = { id: string; ad: string | null; soyad: string | null };

function clientHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return { "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) };
}

export function clientLabel(c: PickerClient): string {
  const raw = `${c.ad ?? ""} ${c.soyad ?? ""}`.trim();
  return raw || "İsimsiz Danışan";
}

export default function ClientPicker({
  onSelect,
  selectedId = null,
  autoFocus = false,
}: {
  onSelect: (c: PickerClient) => void;
  selectedId?: string | null;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PickerClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      const u = new URLSearchParams({ order: "asc", limit: "50" });
      if (q.trim()) u.set("search", q.trim());
      fetch(`/api/clients?${u.toString()}`, { headers: clientHeaders(), cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          const rows = Array.isArray(j?.clients) ? j.clients : [];
          setList(rows as PickerClient[]);
        })
        .catch(() => { if (alive) setError("Danışan listesi alınamadı."); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250);
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Danışan ara (ad/soyad)…"
        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
        aria-label="Danışan ara"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-emerald-100 bg-white">
        {loading && list.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-400">Yükleniyor…</p>
        ) : list.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-400">Danışan bulunamadı.</p>
        ) : (
          <ul className="divide-y divide-emerald-50">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50 ${
                    selectedId === c.id ? "bg-emerald-100 font-semibold" : ""
                  }`}
                >
                  <span>{clientLabel(c)}</span>
                  {selectedId === c.id && <span className="text-emerald-600">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
