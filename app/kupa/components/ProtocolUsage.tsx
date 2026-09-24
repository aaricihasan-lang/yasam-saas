"use client";

import { useEffect, useState } from "react";
import { listPointProtocols, listSafetyProtocols, type CuppingProtocolRef } from "../lib/api";

/**
 * KUPA & HACAMAT — K11 "Kullanıldığı Protokoller" (READ-ONLY).
 *
 * Nokta/Güvenlik master'ının hangi protokollerde kullanıldığını gösterir. Teknik detayındaki
 * aynı görünürlüğü noktalara/güvenliğe taşır (data-loss farkındalığı). Silme SEMANTİĞİNİ
 * değiştirmez: kullanımdaki master DB RESTRICT nedeniyle silinemez (server 409 döndürür); bu
 * panel kullanıcıyı ÖNCEDEN bilgilendirir ("önce şu protokollerden çıkarın").
 */
export function CuppingProtocolUsage({
  entity,
  entityId,
}: {
  entity: "point" | "safety";
  entityId: string;
}) {
  const [protocols, setProtocols] = useState<CuppingProtocolRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list =
          entity === "point"
            ? await listPointProtocols(entityId)
            : await listSafetyProtocols(entityId);
        if (!cancelled) setProtocols(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Kullanım bilgisi yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, entityId]);

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Kullanıldığı Protokoller
      </h4>
      {error ? (
        <p className="text-[11px] font-medium text-rose-600">{error}</p>
      ) : loading ? (
        <p className="text-[11px] text-slate-400">Yükleniyor…</p>
      ) : protocols.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          Bu kayıt henüz bir protokolde kullanılmıyor. (Silinebilir.)
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {protocols.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
              >
                <span className="truncate font-semibold">{p.title}</span>
                {p.category ? (
                  <span className="truncate text-[10px] text-slate-400">· {p.category}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-amber-700">
            Bu kayıt {protocols.length} protokolde kullanılıyor; silmeden önce bu protokollerden çıkarın.
          </p>
        </>
      )}
    </div>
  );
}
