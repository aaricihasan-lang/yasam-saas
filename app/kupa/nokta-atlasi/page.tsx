"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BodyMapCanvas, type BodyMark, type MarkGeometry, type MarkToolMode } from "@/lib/bodymap";
import {
  CUPPING_BODY_MAPS,
  CUPPING_MAP_GROUP_LABELS,
  DEFAULT_CUPPING_MAP_KEY,
  getCuppingMap,
  type CuppingMapGroup,
} from "@/lib/cupping/maps";
import { KupaShell, kupaBtnGhost, kupaBtnPrimary, kupaCard, kupaInput } from "../components/KupaShell";
import { BodySilhouette } from "../maps/Silhouettes";
import {
  createPlacement,
  createPoint,
  deletePlacement,
  listPlacements,
  listPoints,
  updatePlacement,
  type CuppingPlacement,
  type CuppingPoint,
} from "../lib/api";

const GROUP_ORDER: CuppingMapGroup[] = ["govde", "bas", "bacak"];

export default function NoktaAtlasiPage() {
  const [mapKey, setMapKey] = useState<string>(DEFAULT_CUPPING_MAP_KEY);
  const [points, setPoints] = useState<CuppingPoint[]>([]);
  const [placements, setPlacements] = useState<CuppingPlacement[]>([]);
  const [activePointId, setActivePointId] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<MarkToolMode>("add");
  const [drawShape, setDrawShape] = useState<"oval" | "rect">("oval");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPointName, setNewPointName] = useState("");
  const [busy, setBusy] = useState(false);

  const mapDef = getCuppingMap(mapKey);
  const pointName = useCallback(
    (id: string) => points.find((p) => p.id === id)?.name ?? "?",
    [points],
  );

  const loadPoints = useCallback(async () => {
    const list = await listPoints();
    setPoints(list);
    setActivePointId((cur) => cur || list[0]?.id || "");
  }, []);

  const loadPlacements = useCallback(async (mk: string) => {
    const list = await listPlacements({ mapKey: mk });
    setPlacements(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadPoints();
        if (!cancelled) await loadPlacements(mapKey);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yükleme hatası.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Harita değişince yerleşimleri yükle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setSelectedId(null);
        const list = await listPlacements({ mapKey });
        if (!cancelled) setPlacements(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yükleme hatası.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapKey]);

  const marks: BodyMark[] = useMemo(
    () =>
      placements.map((p) => ({
        id: p.id,
        label: pointName(p.point_id),
        mapKey: p.map_key,
        shape: p.shape,
        cx: p.cx,
        cy: p.cy,
        rx: p.rx,
        ry: p.ry,
        angle: p.angle ?? 0,
        color: p.color ?? undefined,
        meta: { pointId: p.point_id },
      })),
    [placements, pointName],
  );

  const handleCreate = useCallback(
    async (geom: MarkGeometry) => {
      if (!activePointId) {
        setError("Önce sol panelden bir nokta seçin (yeni yerleşim bu noktaya bağlanır).");
        return;
      }
      const samePoint = placements.filter((p) => p.point_id === activePointId);
      const nextNo = samePoint.reduce((m, p) => Math.max(m, p.placement_no ?? 0), 0) + 1;
      try {
        const created = await createPlacement({
          point_id: activePointId,
          map_key: mapKey,
          shape: geom.shape,
          cx: geom.cx,
          cy: geom.cy,
          rx: geom.rx,
          ry: geom.ry,
          angle: geom.angle ?? 0,
          placement_no: nextNo,
        });
        setPlacements((cur) => [...cur, created]);
        setSelectedId(created.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Yerleşim eklenemedi.");
      }
    },
    [activePointId, mapKey, placements],
  );

  const handleUpdate = useCallback(async (id: string, patch: Partial<BodyMark>) => {
    // İyimser güncelle + kalıcı yaz.
    setPlacements((cur) =>
      cur.map((p) => (p.id === id ? { ...p, ...patch } as CuppingPlacement : p)),
    );
    try {
      await updatePlacement(id, {
        cx: patch.cx,
        cy: patch.cy,
        rx: patch.rx,
        ry: patch.ry,
        angle: patch.angle,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Güncellenemedi.");
    }
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedId) return;
    const id = selectedId;
    try {
      await deletePlacement(id);
      setPlacements((cur) => cur.filter((p) => p.id !== id));
      setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi.");
    }
  }, [selectedId]);

  const handleQuickAddPoint = useCallback(async () => {
    const name = newPointName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await createPoint({ name });
      setPoints((cur) => [...cur, created]);
      setActivePointId(created.id);
      setNewPointName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nokta eklenemedi.");
    } finally {
      setBusy(false);
    }
  }, [newPointName]);

  const placementsForActivePoint = placements.filter((p) => p.point_id === activePointId).length;

  return (
    <KupaShell
      title="Vücut & Nokta Atlası"
      subtitle="Harita seç → nokta seç → haritaya işaretle → taşı/boyutlandır/döndür → kaydet."
      breadcrumb={[{ label: "Vücut & Nokta Atlası" }]}
    >
      {error ? (
        <div className="mb-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
        {/* SOL PANEL */}
        <div className="flex flex-col gap-3">
          <div className={kupaCard}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Harita</h3>
            <div className="flex flex-col gap-2">
              {GROUP_ORDER.map((g) => (
                <div key={g}>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                    {CUPPING_MAP_GROUP_LABELS[g]}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {CUPPING_BODY_MAPS.filter((m) => m.group === g).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setMapKey(m.key)}
                        className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                          mapKey === m.key
                            ? "border-amber-400/50 bg-amber-500/25 text-amber-100"
                            : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={kupaCard}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Aktif Nokta
            </h3>
            <select
              value={activePointId}
              onChange={(e) => setActivePointId(e.target.value)}
              className={kupaInput}
            >
              <option value="">— nokta seçin —</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.code ? ` (${p.code})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] text-slate-500">
              Yeni yerleşim bu noktaya bağlanır. Bu noktanın bu haritada {placementsForActivePoint} yerleşimi var.
            </p>
            <div className="mt-2 flex gap-1.5">
              <input
                value={newPointName}
                onChange={(e) => setNewPointName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleQuickAddPoint();
                }}
                placeholder="Hızlı nokta ekle…"
                className={kupaInput}
              />
              <button
                type="button"
                onClick={handleQuickAddPoint}
                disabled={busy || !newPointName.trim()}
                className={kupaBtnPrimary}
              >
                +
              </button>
            </div>
          </div>

          <div className={kupaCard}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Araç</h3>
            <div className="flex flex-wrap gap-1.5">
              {(["add", "select", "move"] as MarkToolMode[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setToolMode(t)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                    toolMode === t
                      ? "border-amber-400/50 bg-amber-500/25 text-amber-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                  }`}
                >
                  {t === "add" ? "İşaretle" : t === "select" ? "Seç" : "Taşı/Düzenle"}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["oval", "rect"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDrawShape(s)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                    drawShape === s
                      ? "border-amber-400/50 bg-amber-500/25 text-amber-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                  }`}
                >
                  {s === "oval" ? "Nokta (oval)" : "Kutu"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={!selectedId}
              className={`${kupaBtnGhost} mt-2 w-full justify-center disabled:opacity-40`}
            >
              Seçili yerleşimi sil
            </button>
          </div>
        </div>

        {/* HARİTA */}
        <div className={`${kupaCard} min-h-[60vh]`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">{mapDef?.label ?? mapKey}</p>
            <p className="text-[11px] text-slate-500">{placements.length} yerleşim</p>
          </div>
          <div
            className="relative w-full rounded-xl border border-white/10 bg-[#0b1330]"
            style={{ height: "min(70vh, 640px)" }}
          >
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Yükleniyor…
              </div>
            ) : (
              <BodyMapCanvas
                mapKey={mapKey}
                marks={marks}
                background={<BodySilhouette mapKey={mapKey} />}
                contentWidth={mapDef?.contentWidth ?? 480}
                contentHeight={mapDef?.contentHeight ?? 800}
                toolMode={toolMode}
                drawShape={drawShape}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onCreate={handleCreate}
                onUpdate={handleUpdate}
              />
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            İşaretle modunda haritaya tıkla/sürükle → aktif noktaya yerleşim eklenir. Aynı nokta
            farklı haritalarda farklı yerleşimler taşıyabilir (nokta ≠ yerleşim).
          </p>
        </div>
      </div>
    </KupaShell>
  );
}
