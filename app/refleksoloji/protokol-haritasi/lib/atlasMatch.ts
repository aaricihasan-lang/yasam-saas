import type { AtlasDocument } from "@/lib/atlasStorage";
import { getRegionsForOrgan, listOrganNamesFromAtlas } from "@/lib/atlasStorage";
import type { ProtocolFootView } from "../types";

function normalizeOrganName(name: string): string {
  return name.trim().toLocaleLowerCase("tr");
}

/** Atlas anahtarıyla büyük/küçük harf duyarsız eşleşme */
export function resolveOrganNameInAtlas(atlas: AtlasDocument, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const target = normalizeOrganName(trimmed);
  const names = listOrganNamesFromAtlas(atlas);
  return names.find((n) => normalizeOrganName(n) === target) ?? null;
}

export function organHasAtlasRegions(
  atlas: AtlasDocument,
  name: string,
  view?: ProtocolFootView,
): boolean {
  const key = resolveOrganNameInAtlas(atlas, name);
  if (!key) return false;
  const regions = getRegionsForOrgan(atlas, key, view ? { view } : undefined);
  return regions.some((r) => r.shape === "oval" || r.shape === "rect");
}
