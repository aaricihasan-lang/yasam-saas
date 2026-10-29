/**
 * TEST-ONLY sahte normalize katmanı (lib/numeroloji-klasik/normalize/index.ts ile aynı imza).
 * Sağlayıcı metni içermez; yalnız sentetik yapı üretir. routes.harness.ts modül çözümlemesiyle enjekte eder.
 */
import type { ClassicEndpointId } from "../../../../lib/numeroloji-klasik/endpoints";

export function normalizeEndpointResponse(id: ClassicEndpointId, raw: unknown): { ok: true; data: unknown } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "nesne değil" };
  if ((raw as { __reject?: unknown }).__reject === true) return { ok: false, reason: "sentetik red" };
  const base: Record<string, unknown> = { endpoint: id, synthetic: true };
  if (id === "chart") {
    base.profile = { name: "Sentetik", birthdate: "1987-02-14" };
    base.core = { lifePath: { value: 1, type: "single" }, expression: { value: 6, type: "single", meaning: { title: "Sentetik başlık", keywords: ["k1"] } } };
  }
  if (id === "chaldean") {
    base.name = "Sentetik";
    base.destiny = { value: 6, type: "single", total: 42, compound: 42, root: 6, compoundMeaning: null };
    base.numberMeaning = { number: 6, planet: "Venus", title: "Sentetik Kalde", keywords: [], caution: false, meaning: "" };
    base.caution = false;
  }
  return { ok: true, data: base };
}

export function verifyWithOracle(_id: ClassicEndpointId, _input: unknown, normalized: unknown): unknown {
  if (!normalized || typeof normalized !== "object") return normalized;
  return { ...(normalized as Record<string, unknown>), verification: { status: "match" } };
}
