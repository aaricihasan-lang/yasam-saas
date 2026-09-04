"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getProtocol,
  listProtocolPoints,
  listProtocolTechniques,
  listProtocolSafety,
  listProtocolSteps,
  listProtocolEntries,
  listProtocolSources,
  listPoints,
  listTechniques,
  listSafety,
  listSources,
  type CuppingProtocol,
  type CuppingProtocolPoint,
  type CuppingProtocolTechnique,
  type CuppingProtocolSafety,
  type CuppingProtocolStep,
  type CuppingProtocolEntry,
  type CuppingProtocolSourceLink,
  type CuppingPoint,
  type CuppingTechnique,
  type CuppingSafetyNote,
  type CuppingSource,
} from "@/app/kupa/lib/api";

const NOT_FOUND_MSG = "Kayıt bu hesaba ait değil veya bulunamadı.";

/**
 * Protokol dosyasının TÜM bölümlerini yükler. Master listeleri (points/techniques/
 * safety/sources) BİR KEZ çekilir → Map ile isim çözümü. Kart/relation loop içinde
 * ASLA master GET yapılmaz (N+1 YASAK). Mutasyon sonrası ilgili slice yeniden çekilir
 * (server canonical; optimistic YOK).
 */
export function useProtocolDocument(id: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [protocol, setProtocol] = useState<CuppingProtocol | null>(null);
  const [points, setPoints] = useState<CuppingProtocolPoint[]>([]);
  const [techniques, setTechniques] = useState<CuppingProtocolTechnique[]>([]);
  const [safety, setSafety] = useState<CuppingProtocolSafety[]>([]);
  const [steps, setSteps] = useState<CuppingProtocolStep[]>([]);
  const [entries, setEntries] = useState<CuppingProtocolEntry[]>([]);
  const [sources, setSources] = useState<CuppingProtocolSourceLink[]>([]);

  const [masterPoints, setMasterPoints] = useState<CuppingPoint[]>([]);
  const [masterTechniques, setMasterTechniques] = useState<CuppingTechnique[]>([]);
  const [masterSafety, setMasterSafety] = useState<CuppingSafetyNote[]>([]);
  const [masterSources, setMasterSources] = useState<CuppingSource[]>([]);

  const reloadProtocol = useCallback(async () => setProtocol(await getProtocol(id)), [id]);
  const reloadPoints = useCallback(async () => setPoints(await listProtocolPoints(id)), [id]);
  const reloadTechniques = useCallback(async () => setTechniques(await listProtocolTechniques(id)), [id]);
  const reloadSafety = useCallback(async () => setSafety(await listProtocolSafety(id)), [id]);
  const reloadSteps = useCallback(async () => setSteps(await listProtocolSteps(id)), [id]);
  const reloadEntries = useCallback(async () => setEntries(await listProtocolEntries(id)), [id]);
  const reloadSources = useCallback(async () => setSources(await listProtocolSources(id)), [id]);

  // Master listeleri için HEDEFLİ yeniden çekim (quick-create sonrası yeni master picker'da
  // görünür olsun). Tek GET; loop-içi/section-içi master fetch YOK (N+1 YASAK).
  const reloadMasterTechniques = useCallback(async () => setMasterTechniques(await listTechniques()), []);
  const reloadMasterSafety = useCallback(async () => setMasterSafety(await listSafety()), []);
  const reloadMasterSources = useCallback(async () => setMasterSources(await listSources()), []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const prot = await getProtocol(id); // 404 → notFound
      setProtocol(prot);
      const [pRel, tRel, sRel, stp, ent, src, mp, mt, msaf, msrc] = await Promise.all([
        listProtocolPoints(id),
        listProtocolTechniques(id),
        listProtocolSafety(id),
        listProtocolSteps(id),
        listProtocolEntries(id),
        listProtocolSources(id),
        listPoints(),
        listTechniques(),
        listSafety(),
        listSources(),
      ]);
      setPoints(pRel);
      setTechniques(tRel);
      setSafety(sRel);
      setSteps(stp);
      setEntries(ent);
      setSources(src);
      setMasterPoints(mp);
      setMasterTechniques(mt);
      setMasterSafety(msaf);
      setMasterSources(msrc);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Yüklenemedi.";
      if (msg === NOT_FOUND_MSG) setNotFound(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Mount yüklemesi: setState'ler inline async gövdede + cancelled guard (sync effect
  // setState → cascading-render lint'i). loadAll (reload.all) yalnız event-handler'dan çağrılır.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
        setNotFound(false);
      }
      try {
        const prot = await getProtocol(id); // 404 → notFound
        if (cancelled) return;
        setProtocol(prot);
        const [pRel, tRel, sRel, stp, ent, src, mp, mt, msaf, msrc] = await Promise.all([
          listProtocolPoints(id),
          listProtocolTechniques(id),
          listProtocolSafety(id),
          listProtocolSteps(id),
          listProtocolEntries(id),
          listProtocolSources(id),
          listPoints(),
          listTechniques(),
          listSafety(),
          listSources(),
        ]);
        if (cancelled) return;
        setPoints(pRel);
        setTechniques(tRel);
        setSafety(sRel);
        setSteps(stp);
        setEntries(ent);
        setSources(src);
        setMasterPoints(mp);
        setMasterTechniques(mt);
        setMasterSafety(msaf);
        setMasterSources(msrc);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Yüklenemedi.";
        if (msg === NOT_FOUND_MSG) setNotFound(true);
        else setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Master isim çözümleri (Map; loop-içi GET YOK) ──
  const pointMap = useMemo(() => new Map(masterPoints.map((p) => [p.id, p])), [masterPoints]);
  const techniqueMap = useMemo(() => new Map(masterTechniques.map((t) => [t.id, t])), [masterTechniques]);
  const safetyMap = useMemo(() => new Map(masterSafety.map((s) => [s.id, s])), [masterSafety]);
  const sourceMap = useMemo(() => new Map(masterSources.map((s) => [s.id, s])), [masterSources]);

  const pointName = useCallback((pid: string) => pointMap.get(pid)?.name ?? "Bilinmeyen bölge", [pointMap]);
  const techniqueName = useCallback((tid: string) => techniqueMap.get(tid)?.name ?? "Bilinmeyen teknik", [techniqueMap]);
  const safetyTitle = useCallback((sid: string) => safetyMap.get(sid)?.title ?? "Bilinmeyen madde", [safetyMap]);
  const sourceName = useCallback((sid: string) => sourceMap.get(sid)?.source_name ?? "Bilinmeyen kaynak", [sourceMap]);

  return {
    loading,
    error,
    notFound,
    protocol,
    points,
    techniques,
    safety,
    steps,
    entries,
    sources,
    masterPoints,
    masterTechniques,
    masterSafety,
    masterSources,
    pointMap,
    techniqueMap,
    safetyMap,
    sourceMap,
    pointName,
    techniqueName,
    safetyTitle,
    sourceName,
    reload: {
      protocol: reloadProtocol,
      points: reloadPoints,
      techniques: reloadTechniques,
      safety: reloadSafety,
      steps: reloadSteps,
      entries: reloadEntries,
      sources: reloadSources,
      masterTechniques: reloadMasterTechniques,
      masterSafety: reloadMasterSafety,
      masterSources: reloadMasterSources,
      all: loadAll,
    },
    setProtocol,
  };
}

export type ProtocolDocument = ReturnType<typeof useProtocolDocument>;
