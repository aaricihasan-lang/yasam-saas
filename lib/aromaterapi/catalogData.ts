import {
  getDetail,
  getList,
  getRawDetail,
  type DetailResult,
  type ListResult,
} from "@/lib/aromaterapi/readClient";
import type {
  PlantTaxonDetail,
  PlantTaxonListItem,
  PreparationDetail,
  PreparationListItem,
} from "@/lib/aromaterapi/readTypes";

export type PlantTaxonDetailResult = {
  taxon: PlantTaxonDetail;
  preparations: PreparationListItem[];
};

/**
 * Aromaterapi V2 — C3C Katalog istemci veri sarmalayıcısı.
 * Route URL'lerini tek yerde toplar; UI bileşenleri fetch/parsing kopyalamaz.
 */

export function fetchPlantTaxaList(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<ListResult<PlantTaxonListItem>> {
  return getList<PlantTaxonListItem>(`/api/aromaterapi/plant-taxa?${params.toString()}`, signal);
}

export async function fetchPlantTaxon(
  id: string,
  signal?: AbortSignal,
): Promise<DetailResult<PlantTaxonDetailResult>> {
  // İki anahtarlı yanıt (taxon + preparations) → tek nesnede topla.
  const r = await getRawDetail(`/api/aromaterapi/plant-taxa/${id}`, signal);
  if (!r.ok) {
    return { ok: false, data: null, notFound: r.notFound, errorCode: r.errorCode };
  }
  return {
    ok: true,
    data: {
      taxon: r.json.taxon as PlantTaxonDetail,
      preparations: (r.json.preparations as PreparationListItem[]) ?? [],
    },
    notFound: false,
    errorCode: null,
  };
}

export function fetchPreparationList(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<ListResult<PreparationListItem>> {
  return getList<PreparationListItem>(`/api/aromaterapi/preparations?${params.toString()}`, signal);
}

export function fetchPreparation(
  id: string,
  signal?: AbortSignal,
): Promise<DetailResult<PreparationDetail>> {
  return getDetail<PreparationDetail>(
    `/api/aromaterapi/preparations/${id}`,
    "preparation",
    signal,
  );
}
