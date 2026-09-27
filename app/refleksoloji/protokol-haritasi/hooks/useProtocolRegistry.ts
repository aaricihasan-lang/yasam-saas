"use client";

import { useCallback, useEffect, useState } from "react";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import type { ProtocolFormDraft, SavedProtocol } from "../types";
import {
  draftToSavedProtocol,
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
} from "../lib/protocolStorage";

/**
 * FA-42: kayıt artık gerçek `{ok, error}` sonucu döndürür ve sunucu yanıtını
 * BEKLER (eskiden fire-and-forget: sunucu hatası sessizdi, UI "kaydedildi" diyordu).
 * Sunucu onayı gelmezse yerel kopya `pendingSync` (kirli) olarak saklanır; kullanıcı
 * açık hata mesajı görür ve tekrar deneyebilir.
 */
export type SaveProtocolResult =
  | { ok: true; saved: SavedProtocol; synced: boolean; storageOk: boolean }
  | {
      ok: false;
      saved: SavedProtocol | null;
      kind: "validation" | "storage" | "conflict" | "network";
      error: string;
    };

function userHeaders(): Record<string, string> {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  return {
    "x-user-id": uid ?? "",
    ...(token ? { "x-session-token": token } : {}),
  };
}

// GÜVENLİK (anon kilidi): reflexology_protocols tarayıcıdan doğrudan supabase ile
// yazılmaz. Yazma /api/refleksoloji/protocols (POST) ve by-uid (PUT/DELETE) üzerinden.
const SYNC_ERR =
  "Protokol sunucuya kaydedilemedi. Değişiklikleriniz bu cihazda saklandı; bağlantınızı kontrol edip tekrar kaydedin.";
const CONFLICT_ERR =
  "Protokol başka bir cihazda değiştirilmiş. Değişiklikleriniz bu cihazda saklandı; sayfayı yenileyip güncel hâli üzerinden tekrar deneyin.";

// SavedProtocol → server satır alanları (id/tenant hariç; sunucu üretir/zorlar).
function protocolFields(saved: SavedProtocol): Record<string, unknown> {
  const { pendingSync: _p, baseVersion: _b, ...raw } = saved;
  void _p;
  void _b;
  return {
    title: saved.title,
    target_problem: saved.description || null,
    organs: saved.organs.length > 0 ? saved.organs.join(" | ") : null,
    application_notes: saved.notes || null,
    raw_json: raw as Record<string, unknown>,
  };
}

type SyncResult = { ok: true } | { ok: false; conflict: boolean };

async function readOk(res: Response): Promise<SyncResult> {
  if (res.status === 409) return { ok: false, conflict: true };
  if (!res.ok) return { ok: false, conflict: false };
  const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
  return json?.ok ? { ok: true } : { ok: false, conflict: false };
}

async function syncProtocolCreate(saved: SavedProtocol): Promise<SyncResult> {
  try {
    // Sunucu: tenant_id oturumdan, id/created_at DB default'undan üretir. Aynı
    // source_uid ile tekrar POST idempotenttir (yeniden deneme duplicate üretmez).
    const res = await fetch("/api/refleksoloji/protocols", {
      method: "POST",
      headers: { ...userHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ source_uid: saved.id, ...protocolFields(saved) }),
    });
    return await readOk(res);
  } catch {
    return { ok: false, conflict: false };
  }
}

// P1-2 + FA-42: düzenleme → source_uid ile güncelle; expected_updated_at ile CAS.
async function syncProtocolUpdate(
  saved: SavedProtocol,
  expected: string | null,
): Promise<SyncResult> {
  try {
    const res = await fetch(
      `/api/refleksoloji/protocols/by-uid/${encodeURIComponent(saved.id)}`,
      {
        method: "PUT",
        headers: { ...userHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...protocolFields(saved),
          ...(expected ? { expected_updated_at: expected } : {}),
        }),
      },
    );
    return await readOk(res);
  } catch {
    return { ok: false, conflict: false };
  }
}

// P1-2: silme → source_uid ile server satırını sil (zombie protokol engellenir).
async function syncProtocolDelete(sourceUid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/refleksoloji/protocols/by-uid/${encodeURIComponent(sourceUid)}`,
      { method: "DELETE", headers: userHeaders() },
    );
    const r = await readOk(res);
    return r.ok ? null : SYNC_ERR;
  } catch {
    return SYNC_ERR;
  }
}

function upsertLocal(list: SavedProtocol[], item: SavedProtocol): SavedProtocol[] {
  const idx = list.findIndex((p) => p.id === item.id);
  if (idx < 0) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}

export function useProtocolRegistry() {
  const isDemo = readYasamUser()?.is_demo_account === true;

  const [protocols, setProtocols] = useState<SavedProtocol[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setProtocols(loadProtocolsFromStorage());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: SavedProtocol[]): boolean => {
    const ok = saveProtocolsToStorage(next);
    setProtocols(next);
    return ok;
  }, []);

  /**
   * Kaydet — sunucu sonucunu BEKLER.
   * @param opts.newId   yeni kayıt için form-oturumu başına SABİT kimlik (yeniden
   *                     denemede aynı source_uid → idempotent, duplicate yok)
   * @param opts.baseVersion düzenlemede dayanılan sunucu sürümü (CAS)
   */
  const saveProtocol = useCallback(
    async (
      draft: ProtocolFormDraft,
      editId?: string | null,
      opts?: { newId?: string | null; baseVersion?: string | null },
    ): Promise<SaveProtocolResult> => {
      const list = loadProtocolsFromStorage();
      const previous = editId ? list.find((p) => p.id === editId) : undefined;
      const ids = new Set(list.filter((p) => p.id !== editId).map((p) => p.id));
      const saved = draftToSavedProtocol(draft, {
        id: editId ?? opts?.newId ?? undefined,
        previous,
        existingIds: ids,
      });
      if (!saved) {
        return { ok: false, saved: null, kind: "validation", error: "Kayıt yapılamadı. Alanları kontrol edin." };
      }

      const expected = editId
        ? (opts?.baseVersion ?? previous?.baseVersion ?? null)
        : null;

      // Önce yerel (kirli) kopya — sunucu onayı gelmezse veri kaybolmaz.
      const pendingCopy: SavedProtocol = {
        ...saved,
        ...(isDemo ? {} : { pendingSync: true }),
        ...(expected ? { baseVersion: expected } : {}),
      };
      const storageOk = persist(upsertLocal(list, pendingCopy));

      if (isDemo) {
        if (!storageOk) {
          return { ok: false, saved, kind: "storage", error: "Cihaz depolama alanı dolu; kayıt yapılamadı." };
        }
        return { ok: true, saved, synced: false, storageOk };
      }

      const result = editId ? await syncProtocolUpdate(saved, expected) : await syncProtocolCreate(saved);
      if (!result.ok) {
        return {
          ok: false,
          saved,
          kind: result.conflict ? "conflict" : "network",
          error: result.conflict ? CONFLICT_ERR : SYNC_ERR,
        };
      }

      // Sunucu onayladı → yerel kopya temiz; yeni taban = kaydedilen sürüm.
      const clean: SavedProtocol = { ...saved, baseVersion: saved.updatedAt };
      const cleanOk = persist(upsertLocal(loadProtocolsFromStorage(), clean));
      return { ok: true, saved: clean, synced: true, storageOk: storageOk && cleanOk };
    },
    [persist, isDemo],
  );

  const deleteProtocol = useCallback(
    (id: string): boolean => {
      if (!protocols.some((p) => p.id === id)) return false;
      persist(protocols.filter((p) => p.id !== id));
      // P1-2: server'dan da sil → zombie protokol engellenir.
      if (!isDemo) {
        void syncProtocolDelete(id).then((errMsg) => {
          if (errMsg) setSyncErrorMessage(errMsg);
        });
      }
      return true;
    },
    [protocols, persist, isDemo],
  );

  const clearSyncError = useCallback(() => setSyncErrorMessage(null), []);

  return {
    protocols,
    hydrated,
    saveProtocol,
    deleteProtocol,
    syncErrorMessage,
    clearSyncError,
  };
}
