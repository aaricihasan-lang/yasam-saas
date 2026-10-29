/** Klasik Numeroloji — normalize/doğrulama sözleşme tipleri (saf; normalize/index.ts ile aynı imza). */
import type { ClassicEndpointId } from "../endpoints";

export type NormalizeFn = (id: ClassicEndpointId, raw: unknown) => { ok: true; data: unknown } | { ok: false; reason: string };
export type VerifyFn = (id: ClassicEndpointId, input: unknown, normalized: unknown) => unknown;
