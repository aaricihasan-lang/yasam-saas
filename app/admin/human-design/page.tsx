"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { hdGet } from "./adminHdApi";
import type { HdCanonicalEntityRow } from "@/lib/human-design/admin/centralContentTypes";
import type { HdEntityKind } from "@/lib/human-design/admin/centralContentTypes";

const CATEGORIES: { kind: HdEntityKind; label: string }[] = [
  { kind: "tip", label: "Tip" },
  { kind: "otorite", label: "Otorite" },
  { kind: "kapi", label: "Kapı" },
  { kind: "kanal", label: "Kanal" },
];

/** Türkçe-güvenli arama normalizasyonu (İ/ı dahil). */
function norm(s: string): string {
  return s.toLocaleLowerCase("tr-TR").replace(/i̇/g, "i").trim();
}

export default function HdAdminHome() {
  const [kind, setKind] = useState<HdEntityKind>("tip");
  const [rows, setRows] = useState<HdCanonicalEntityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async (k: HdEntityKind) => {
    setLoading(true);
    setErr(null);
    const r = await hdGet<{ rows: HdCanonicalEntityRow[] }>(`canonical?kind=${k}`);
    if (r.ok) setRows(r.data.rows ?? []);
    else setErr(r.error);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(kind); }, [kind, load]);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return rows;
    return rows.filter((r) => norm(r.name_tr).includes(q) || norm(r.canonical_key).includes(q));
  }, [rows, query]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="mb-1 text-lg font-black text-indigo-800">Human Design — Merkezî İçerik Yönetimi</h1>
      <p className="mb-4 text-xs text-slate-500">
        Merkezî canonical içerik yalnız Admin Panelinden yönetilir; uzmanlara otomatik görünmez.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.kind}
            type="button"
            onClick={() => setKind(c.kind)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
              kind === c.kind ? "bg-indigo-600 text-white" : "border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 px-3">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara (ad veya kanonik anahtar)…"
          className="h-9 w-full bg-transparent text-sm outline-none"
        />
      </div>

      {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…</div>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/human-design/${encodeURIComponent(r.canonical_key)}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span className="font-semibold text-slate-800">{r.name_tr}</span>
                <span className="font-mono text-[11px] text-slate-400">{r.canonical_key}</span>
              </Link>
            </li>
          ))}
          {filtered.length === 0 && <li className="py-6 text-center text-xs text-slate-500">Kayıt yok.</li>}
        </ul>
      )}
    </div>
  );
}
