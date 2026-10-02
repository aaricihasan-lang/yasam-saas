"use client";

import { useState, useSyncExternalStore } from "react";
import { adoptServerAtlasVersion, pushLocalAtlasVersion } from "@/lib/atlasStorage";
import {
  ATLAS_CONFLICT_MESSAGE,
  getAtlasConflict,
  subscribeAtlasConflict,
} from "@/lib/refleksolojiAtlasSync";

const getServerSnapshot = () => null;

/**
 * P1-5: atlas çakışması — aynı organ iki cihazda farklı değiştirildiğinde gösterilir.
 * Bu cihazdaki sürüm KORUNUR; otomatik gönderim YOKTUR. Kullanıcı açıkça seçer:
 *   - "Benim sürümümü gönder" → çakışan organlarda bu cihazın sürümü sunucuya yazılır
 *   - "Sunucu sürümünü al"   → çakışan organlarda diğer cihazın sürümü buraya alınır
 */
export function AtlasConflictBanner() {
  const conflict = useSyncExternalStore(subscribeAtlasConflict, getAtlasConflict, getServerSnapshot);
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;

  const run = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const organs = conflict.organs.slice(0, 6).join(", ");
  const more = conflict.organs.length > 6 ? ` +${conflict.organs.length - 6}` : "";

  return (
    <div
      role="alert"
      className="mb-1 flex shrink-0 flex-col gap-1.5 rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="min-w-0">
        {ATLAS_CONFLICT_MESSAGE}
        {organs ? (
          <span className="block font-medium text-amber-900/90">
            Çakışan organlar: {organs}
            {more}
          </span>
        ) : null}
      </p>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(pushLocalAtlasVersion)}
          className="btn-primary rounded-md px-2.5 py-1 text-[11px] font-bold disabled:opacity-60"
        >
          Benim sürümümü gönder
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(adoptServerAtlasVersion)}
          className="btn-secondary rounded-md px-2.5 py-1 text-[11px] font-bold disabled:opacity-60"
        >
          Sunucu sürümünü al
        </button>
      </div>
    </div>
  );
}
