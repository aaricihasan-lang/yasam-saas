"use client";

import { useCallback, useEffect, useState } from "react";
import type { DetailResult } from "@/lib/aromaterapi/readClient";

/**
 * Aromaterapi V2 — C3C detay ekranları için tek-atış okuma hook'u.
 * AbortController ile stale/yarış koruması; 404 (notFound) ayrı ele alınır.
 * loading TÜRETİLİR (effect içinde senkron setState YOK → cascading render yok).
 */
export function useAromaterapiDetail<T>(
  fetcher: (signal: AbortSignal) => Promise<DetailResult<T>>,
  id: string | null | undefined,
): {
  data: T | null;
  loading: boolean;
  notFound: boolean;
  errorCode: string | null;
  retry: () => void;
} {
  const [state, setState] = useState<{
    data: T | null;
    notFound: boolean;
    errorCode: string | null;
    fetchedKey: string;
  }>({ data: null, notFound: false, errorCode: null, fetchedKey: "" });
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((t) => t + 1), []);

  const currentKey = `${id ?? ""}#${tick}`;
  const loading = Boolean(id) && state.fetchedKey !== currentKey;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetcher(controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok) {
        setState({ data: res.data, notFound: false, errorCode: null, fetchedKey: currentKey });
      } else if (res.notFound) {
        setState({ data: null, notFound: true, errorCode: null, fetchedKey: currentKey });
      } else if (res.errorCode === null) {
        // abort → durumu değiştirme
      } else {
        setState({ data: null, notFound: false, errorCode: res.errorCode, fetchedKey: currentKey });
      }
    });
    return () => controller.abort();
  }, [fetcher, id, currentKey]);

  if (!id) {
    return { data: null, loading: false, notFound: true, errorCode: null, retry };
  }
  return {
    data: state.data,
    loading,
    notFound: state.notFound,
    errorCode: state.errorCode,
    retry,
  };
}
