"use client";

/**
 * AŞAMA 2 / DY-005 · DY-006 — Kayıtlı analizi Danışan Yolculuğu danışanına AÇIKÇA bağlama / ayırma.
 *
 * YALNIZ bağlantı işlevi: analiz içeriği, hesaplama, kayıt üretme ve metodoloji koduna dokunmaz.
 *  - Öneri / otomatik eşleştirme YOK: danışan, uzmanın yazdığı arama metniyle bulunur ve seçilir
 *    (arama kutusu kaydın adıyla ÖN-DOLDURULMAZ).
 *  - Bağı kaldırma iki adımlı onaydır (tarayıcı diyaloğu kullanılmaz); kayıt silinmez.
 *  - Sunucu: /api/numeroloji/analyses/[id]/client-link (Numeroloji + Danışan Yolculuğu izni).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "../helpers/numApiClient";

type ClientOpt = { id: string; ad: string; soyad: string; dogum: string | null };
type LinkState = { clientId: string; client: ClientOpt | null } | null;

const fullName = (c: ClientOpt) => `${c.ad} ${c.soyad}`.replace(/\s+/g, " ").trim() || "—";

export function NumerolojiDanisanBagi({ recordId }: { recordId: string }) {
  const base = `/api/numeroloji/analyses/${recordId}/client-link`;
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [canLink, setCanLink] = useState(false);
  const [link, setLink] = useState<LinkState>(null);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ClientOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { headers: authHeaders(), cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; canLink?: boolean; link?: LinkState };
      if (res.status === 503) { setUnavailable(true); return; }
      if (!res.ok || !j.ok) { setMsg("Danışan bağlantısı okunamadı."); return; }
      setCanLink(j.canLink === true);
      setLink(j.link ?? null);
    } catch {
      setMsg("Ağ hatası. Bağlantını kontrol et.");
    } finally {
      setLoaded(true);
    }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!picking) return;
    const my = ++seq.current;
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`${base}?search=${encodeURIComponent(search)}`, { headers: authHeaders(), cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: ClientOpt[] };
        if (my === seq.current) setRows(res.ok && j.ok && Array.isArray(j.rows) ? j.rows : []);
      } catch {
        if (my === seq.current) setRows([]);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [picking, search, base]);

  const act = async (method: "PUT" | "DELETE", clientId: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(base, { method, headers: authHeaders(), body: JSON.stringify({ clientId }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) setMsg(j.error || "İşlem tamamlanamadı.");
      setPicking(false);
      setConfirmUnlink(false);
      setSearch("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!loaded || unavailable) return null;

  const btn = "inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60";

  return (
    <section aria-label="Danışan bağlantısı" className="rounded-xl border border-violet-200/70 bg-white/80 px-3 py-2.5 text-xs text-slate-700 md:px-4">
      {link ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-violet-800">Bağlı danışan:</span>
          {link.client ? (
            <Link href={`/dashboard/clients/${link.clientId}`} className="font-bold text-slate-900 underline decoration-violet-300 underline-offset-2">
              {fullName(link.client)}
            </Link>
          ) : (
            <span className="font-semibold text-slate-600">Bir danışana bağlı</span>
          )}
          {canLink && !confirmUnlink ? (
            <button type="button" disabled={busy} onClick={() => setConfirmUnlink(true)} className={`${btn} ml-auto border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
              Bağlantıyı kaldır
            </button>
          ) : null}
          {canLink && confirmUnlink ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-600">Analiz silinmez; yalnız danışan bağlantısı kalkar.</span>
              <button type="button" disabled={busy} onClick={() => void act("DELETE", link.clientId)} className={`${btn} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}>
                {busy ? "Kaldırılıyor…" : "Evet, kaldır"}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirmUnlink(false)} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
                Vazgeç
              </button>
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-600">Bu analiz bir danışana bağlı değil.</span>
          {canLink && !picking ? (
            <button type="button" onClick={() => setPicking(true)} className={`${btn} ml-auto border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100`}>
              Danışana Bağla
            </button>
          ) : null}
          {!canLink ? <span className="text-slate-500">Bağlamak için Danışan Yolculuğu yetkisi gerekir.</span> : null}
        </div>
      )}

      {picking && !link ? (
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className="mb-1 block font-bold text-slate-700">Danışan ara</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Danışan adı veya soyadı"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              autoFocus
            />
          </label>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                  {fullName(c)}{c.dogum ? <span className="font-normal text-slate-500"> · {c.dogum}</span> : null}
                </span>
                <button type="button" disabled={busy} onClick={() => void act("PUT", c.id)} className={`${btn} border-violet-200 bg-white text-violet-800 hover:bg-violet-50`}>
                  Bağla
                </button>
              </li>
            ))}
            {rows.length === 0 ? <li className="px-1 text-slate-500">Danışan bulunamadı.</li> : null}
          </ul>
          <button type="button" onClick={() => { setPicking(false); setSearch(""); }} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
            Vazgeç
          </button>
        </div>
      ) : null}

      {msg ? <p role="alert" className="mt-1.5 font-semibold text-rose-700">{msg}</p> : null}
    </section>
  );
}
