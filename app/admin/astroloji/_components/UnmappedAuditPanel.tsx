"use client";

/**
 * Eşlenmemiş sağlayıcı alanları — YALNIZ alan yolları (değer asla gösterilmez/saklanmaz).
 * Sınıflandırma bir kayıttır; alanın teknik/yorum katmanına girmesi yalnız adaptör kod değişikliğiyle olur.
 */

import { useEffect, useState } from "react";
import { astroFetch } from "../_lib/api";

type Field = {
  id: string;
  provider: string;
  endpoint: string;
  fieldPath: string;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  classification: string;
  classificationLabel: string;
};

const CLASSES: [string, string][] = [
  ["unclassified", "Sınıflandırılmadı"],
  ["technical", "Teknik"],
  ["interpretation", "Roxy yorumu"],
  ["ignored", "Gereksiz"],
  ["unverified", "Doğrulanamadı"],
];

export default function UnmappedAuditPanel() {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    void astroFetch<{ fields: Field[] }>("/api/admin/astroloji/unmapped").then((r) => {
      if (!alive) return;
      setFields(r.ok ? r.data.fields : []);
      setError(r.ok ? null : r.error);
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  async function classify(id: string, classification: string) {
    const r = await astroFetch("/api/admin/astroloji/unmapped", { method: "PATCH", body: { id, classification } });
    if (r.ok) setReload((n) => n + 1);
    else setError(r.error);
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[#e7dcc3] bg-[#FBF8F2] p-4 text-slate-800">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Eşlenmemiş sağlayıcı alanları</h2>
        <p className="text-xs text-slate-500">
          Yalnız alan YOLLARI listelenir; değerler hiçbir zaman saklanmaz. Bilinmeyen alanlar varsayılan olarak hiçbir katmana geçmez (fail-closed);
          sınıflandırma yalnız kayıt amaçlıdır.
        </p>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {fields === null ? (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      ) : fields.length === 0 ? (
        <p className="text-sm text-slate-500">Eşlenmemiş alan görülmedi.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1">Endpoint</th>
                <th className="px-2 py-1">Alan yolu</th>
                <th className="px-2 py-1">İlk görülme</th>
                <th className="px-2 py-1">Son görülme</th>
                <th className="px-2 py-1">Sayı</th>
                <th className="px-2 py-1">Sınıflandırma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map((f) => (
                <tr key={f.id}>
                  <td className="px-2 py-1 font-mono text-xs">{f.endpoint}</td>
                  <td className="px-2 py-1 font-mono text-xs">{f.fieldPath}</td>
                  <td className="px-2 py-1 text-xs">{new Date(f.firstSeenAt).toLocaleString("tr-TR")}</td>
                  <td className="px-2 py-1 text-xs">{new Date(f.lastSeenAt).toLocaleString("tr-TR")}</td>
                  <td className="px-2 py-1 tabular-nums">{f.seenCount}</td>
                  <td className="px-2 py-1">
                    <select className="rounded border border-slate-300 px-1 py-0.5 text-xs" value={f.classification} onChange={(e) => void classify(f.id, e.target.value)}>
                      {CLASSES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
