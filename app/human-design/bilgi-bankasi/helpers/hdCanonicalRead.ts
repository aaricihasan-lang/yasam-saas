"use client";

/**
 * NORMAL UZMAN — canonical Bilgi Bankası salt-okuma client'ı.
 * /api/hd/bilgi-bankasi (requireModuleAccess) hattına x-user-id + x-session-token
 * ile GET atar. YALNIZ okuma; mutation fonksiyonu YOK. service_role tarayıcıya gelmez.
 * Auth deseni hdBilgiKayit.ts (chartsClient) ile aynıdır.
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type {
  HdEntityKind,
  HdKnowledgeEntityDetail,
  HdKnowledgeGroupItem,
} from "@/lib/human-design/knowledge/expertReadTypes";

function authHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "x-user-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

export type GroupsResult =
  | { ok: true; items: HdKnowledgeGroupItem[] }
  | { ok: false; locked: boolean; error: string };

export type EntityResult =
  | { ok: true; detail: HdKnowledgeEntityDetail }
  | { ok: false; locked: boolean; notFound: boolean; error: string };

export async function fetchCanonicalGroups(kind: HdEntityKind): Promise<GroupsResult> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/bilgi-bankasi?resource=groups&kind=${encodeURIComponent(kind)}`, {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    });
  } catch {
    return { ok: false, locked: false, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && Array.isArray(j.items)) {
    return { ok: true, items: j.items as HdKnowledgeGroupItem[] };
  }
  return {
    ok: false,
    locked: res.status === 401 || res.status === 403,
    error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
  };
}

export async function fetchCanonicalEntity(canonicalKey: string): Promise<EntityResult> {
  let res: Response;
  try {
    res = await fetch(`/api/hd/bilgi-bankasi?resource=entity&key=${encodeURIComponent(canonicalKey)}`, {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    });
  } catch {
    return { ok: false, locked: false, notFound: false, error: "Ağ hatası. Bağlantını kontrol et." };
  }
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && j.ok === true && j.entity && typeof j.entity === "object") {
    return { ok: true, detail: j as unknown as HdKnowledgeEntityDetail };
  }
  return {
    ok: false,
    locked: res.status === 401 || res.status === 403,
    notFound: res.status === 404,
    error: typeof j.error === "string" ? j.error : `HTTP ${res.status}`,
  };
}
