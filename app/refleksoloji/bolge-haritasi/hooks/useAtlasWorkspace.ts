"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ATLAS_CHANGED_EVENT,
  atlasHasRegionId,
  buildDisplayRegions,
  isAtlasStorageKey,
  hydrateAndMergeAtlas,
  listOrganNamesFromAtlas,
  loadAtlas,
  loadOrganList,
  mergeDraftIntoAtlas,
  saveAtlas,
  saveOrganList,
} from "@/lib/atlasStorage";
import { mergeOrganListsWithTombstones } from "@/lib/refleksoloji/atlasMerge";
import type { FootSide, FootView, Region } from "../types";
import { dedupeByOrganKey, organKey } from "../utils/organUtils";

/** W08: Organ Ekle sonucu — yeni eklendi / zaten vardı (mevcut organ seçildi) / geçersiz ad. */
export type AddOrganResult = { status: "added" | "existing"; organ: string } | { status: "invalid" };

function mergeOrganLists(atlasOrgans: string[], sessionOrgans: string[]): string[] {
  // Oturum organları önce (kanonik kimlikte ilk-görülen etiket kazanır),
  // ardından Türkçe sıralama.
  return dedupeByOrganKey([...sessionOrgans, ...atlasOrgans]).sort((a, b) =>
    a.localeCompare(b, "tr"),
  );
}

export function useAtlasWorkspace(initialOrgan?: string | null) {
  const [atlas, setAtlas] = useState(() => loadAtlas());
  const [organs, setOrgans] = useState<string[]>([]);
  const [selectedOrgans, setSelectedOrgans] = useState<string[]>([]);
  const [activeOrgan, setActiveOrgan] = useState<string | null>(null);
  const [draftRegions, setDraftRegions] = useState<Region[]>([]);
  const [deletedRegionIds, setDeletedRegionIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // DL-007: sahibi belirsiz eski cihaz atlası (karar Kayıtlı Atlas'ta verilir).
  const [quarantineCount, setQuarantineCount] = useState(0);
  // P1-5: senkron birleştirmesi (409 çözümü / hidrasyon / çakışma kararı) yereli
  // değiştirdiğinde artar → bağımlı paneller (bölge sayıları) tazelenir.
  const [atlasRevision, setAtlasRevision] = useState(0);
  // W08: bu oturumda kullanıcının "Ekle" ile eklediği organlar. Daha önce silinmiş (mezar taşlı) bir
  // organ yeniden eklendiğinde senkron/olay yeniden yüklemesi onu listeden DÜŞÜRMESİN (bölgesi
  // kaydedilince organ zaten canlı sayılır). Yalnız ekran listesi; depolama/veri biçimi değişmez.
  const sessionAddedRef = useRef<Map<string, string>>(new Map());
  const withSessionAdded = useCallback(
    (list: string[]) => mergeOrganLists(list, [...sessionAddedRef.current.values()]),
    [],
  );

  const [selectedView, setSelectedView] = useState<FootView>("taban");
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  useEffect(() => {
    const doc = loadAtlas();
    const sessionOrgans = loadOrganList();
    setAtlas(doc);
    setOrgans(mergeOrganLists(listOrganNamesFromAtlas(doc), sessionOrgans));

    if (initialOrgan) {
      setSelectedOrgans([initialOrgan]);
      setActiveOrgan(initialOrgan);
    }

    setHydrated(true);

    // P1-1: sunucudan atlas hydrate + tombstone-farkında birleştirme (TEK merkez).
    // FA-13: açılışta/"migrate" OTOMATİK PUT YOK; organ listesi de açılışta yazılmaz
    // (eskiden koşulsuz saveOrganList her açılışta PUT tetikliyordu). Yalnız kullanıcı
    // eylemi (organ ekle / kaydet) gönderir; hidrasyon bitmeden PUT gitmez.
    let cancelled = false;
    void hydrateAndMergeAtlas().then((r) => {
      if (cancelled || !r) return;
      setQuarantineCount(r.quarantineCount);
      const merged = loadAtlas();
      setAtlas(merged);
      setOrgans(withSessionAdded(mergeOrganLists(listOrganNamesFromAtlas(merged), loadOrganList())));
    });
    return () => {
      cancelled = true;
    };
  }, [initialOrgan, withSessionAdded]);

  // P1-5 + RF-02: atlas yerelde senkron tarafından (sunucu-only organlar, çakışma çözümü,
  // 3-yollu birleştirme) VEYA başka sekmede (storage olayı) değiştirildi → state'i depodan
  // yeniden yükle. Bayat state ile kaydetme diğer değişiklikleri DÜŞÜRMESİN (handleSave
  // ayrıca depodan okur). Kaydedilmemiş taslak bölgeler (draftRegions) korunur.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChanged = () => {
      const doc = loadAtlas();
      setAtlas(doc);
      setOrgans((prev) =>
        withSessionAdded(
          mergeOrganLists(
            listOrganNamesFromAtlas(doc),
            mergeOrganListsWithTombstones(loadOrganList(), prev, doc._meta),
          ),
        ),
      );
      setAtlasRevision((v) => v + 1);
    };
    const onStorage = (e: StorageEvent) => {
      if (isAtlasStorageKey(e.key)) onChanged();
    };
    window.addEventListener(ATLAS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ATLAS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [withSessionAdded]);

  // Görsellerde iki taraf yan yana durur → seçili görünümün HER İKİ tarafındaki bölgeler birlikte gösterilir
  // (eski "Sol/Sağ" seçicisiyle kaydedilmiş bölgelerin hiçbiri gizlenmez; veri ve kayıt biçimi aynı).
  const displayRegions = useMemo(
    () =>
      (["left", "right"] as const satisfies readonly FootSide[]).flatMap((foot) =>
        buildDisplayRegions(atlas, draftRegions, deletedRegionIds, selectedOrgans, foot, selectedView),
      ),
    [atlas, draftRegions, deletedRegionIds, selectedOrgans, selectedView],
  );

  const handleToggleOrgan = useCallback((organ: string) => {
    setSelectedOrgans((prev) => {
      const exists = prev.includes(organ);
      if (exists) {
        const next = prev.filter((o) => o !== organ);
        setActiveOrgan((current) => (current === organ ? next[next.length - 1] ?? null : current));
        return next;
      }
      setActiveOrgan(organ);
      return [...prev, organ];
    });
    setSelectedRegionId(null);
  }, []);

  const handleAddOrgan = useCallback(
    (name: string): AddOrganResult => {
      const trimmed = name.trim();
      const key = organKey(trimmed);
      if (!trimmed || !key) return { status: "invalid" };
      // W08: aynı organ (kanonik kimlik) tekrar EKLENMEZ — mevcut organ seçilir.
      const existing = organs.find((o) => organKey(o) === key);
      if (existing) {
        setSelectedOrgans([existing]);
        setActiveOrgan(existing);
        setSelectedRegionId(null);
        return { status: "existing", organ: existing };
      }
      sessionAddedRef.current.set(key, trimmed);

      // P1-5: depodaki güncel liste ∪ ekrandaki liste (senkronla gelen adlar düşmesin).
      const nextOrgans = mergeOrganLists(
        [trimmed],
        mergeOrganListsWithTombstones(loadOrganList(), organs, loadAtlas()._meta),
      );
      setOrgans(nextOrgans);
      // Kullanıcı eylemi → organ listesini kalıcılaştır (+ senkron planla).
      saveOrganList(nextOrgans);
      setSelectedOrgans([trimmed]);
      setActiveOrgan(trimmed);
      setSelectedRegionId(null);
      return { status: "added", organ: trimmed };
    },
    [organs],
  );

  const handleUpsertRegion = useCallback((region: Region) => {
    setDraftRegions((prev) => {
      const idx = prev.findIndex((r) => r.id === region.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = region;
        return next;
      }
      return [...prev, region];
    });
  }, []);

  const handleDeleteRegion = useCallback(
    (regionId: string) => {
      setDraftRegions((prev) => prev.filter((r) => r.id !== regionId));
      if (atlasHasRegionId(atlas, regionId)) {
        setDeletedRegionIds((prev) => (prev.includes(regionId) ? prev : [...prev, regionId]));
      }
      setSelectedRegionId(null);
    },
    [atlas],
  );

  const handleSave = useCallback((): boolean => {
    // P1-5 / RF-02: taslak, hook state'ine DEĞİL depodaki GÜNCEL atlasa uygulanır — arka
    // planda senkronla gelen veya başka sekmede kaydedilen değişiklikler ezilmez.
    const next = mergeDraftIntoAtlas(loadAtlas(), draftRegions, deletedRegionIds);
    const ok = saveAtlas(next);
    if (!ok) return false;
    setAtlas(next);
    setDraftRegions([]);
    setDeletedRegionIds([]);
    // Kaydet sonrası UX: SEÇİMİ KORU → kaydedilen bölgeler haritada görünür kalır
    // ("kaydetmedi mi?" algısı ortadan kalkar). Yalnız taslak/silinen durum sıfırlanır.
    // Seçili organlar hâlâ atlasta mevcut mu (silinmediyse) koru; değilse temizle.
    const survivingOrgans = new Set(listOrganNamesFromAtlas(next));
    setSelectedOrgans((prev) => prev.filter((o) => survivingOrgans.has(o)));
    setActiveOrgan((cur) => (cur && survivingOrgans.has(cur) ? cur : null));
    setSelectedRegionId(null);
    // Organ listesi de depodaki güncel liste ∪ ekrandaki liste (silinenler hariç).
    const nextOrgans = withSessionAdded(
      mergeOrganLists(
        listOrganNamesFromAtlas(next),
        mergeOrganListsWithTombstones(loadOrganList(), organs, next._meta),
      ),
    );
    setOrgans(nextOrgans);
    saveOrganList(nextOrgans);
    return true;
  }, [draftRegions, deletedRegionIds, organs, withSessionAdded]);

  // DY-06: Kaydet + sunucu eşitlemesi doğrulandıktan sonra çalışma alanı seçimini temizler
  // (organ / çizim seçimi). Atlas verisine ve taslaklara DOKUNMAZ — yalnız ekran seçimi.
  const clearSelection = useCallback(() => {
    setSelectedOrgans([]);
    setActiveOrgan(null);
    setSelectedRegionId(null);
  }, []);

  // W09: kaydedilmemiş (taslakta bekleyen) bölgeler — yalnız başarılı Kaydet taslağı boşaltır.
  const unsavedRegionIds = useMemo(() => new Set(draftRegions.map((r) => r.id)), [draftRegions]);

  const handleDeleteSelectedDrawing = useCallback(() => {
    if (!selectedRegionId) {
      console.warn("Silmek için önce bir çizim seçiniz.");
      return;
    }
    handleDeleteRegion(selectedRegionId);
  }, [selectedRegionId, handleDeleteRegion]);

  const handleClear = useCallback(() => {
    handleDeleteSelectedDrawing();
  }, [handleDeleteSelectedDrawing]);

  return {
    hydrated,
    quarantineCount,
    atlasRevision,
    organs,
    selectedOrgans,
    activeOrgan,
    selectedView,
    setSelectedView,
    selectedRegionId,
    setSelectedRegionId,
    displayRegions,
    unsavedRegionIds,
    handleToggleOrgan,
    handleAddOrgan,
    handleDeleteSelectedDrawing,
    handleUpsertRegion,
    handleSave,
    handleClear,
    clearSelection,
  };
}
