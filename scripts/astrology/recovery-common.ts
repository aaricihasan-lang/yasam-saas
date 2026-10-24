/**
 * GA-P2-05 — owner kurtarma betiklerinin ortak yardımcıları (YALNIZ SUNUCU / owner terminali; istemci paketine GİRMEZ).
 *
 * quarantine-recover.ts ve interp-backfill.ts:
 *   • varsayılan DRY-RUN (yazım YOK); yalnız `--apply` ile yazar,
 *   • sağlayıcıyı ASLA çağırmaz (Roxy istemcisi import edilmez → 0 ücretli istek),
 *   • çıktıya yalnız kimlik / teknik / hash öneki / durum yazar (ham yanıt, gövde, doğum verisi YAZILMAZ),
 *   • production'da owner kararıyla ve yedekten sonra çalıştırılır (bu PR'da ÇALIŞTIRILMADI).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalcUnit, TechniqueDefinition } from "@/lib/astrology/engine/techniques";
import { getTechnique } from "@/lib/astrology/engine/techniques";

export type TechniqueResolver = (id: string) => TechniqueDefinition | null | undefined;
export const defaultResolver: TechniqueResolver = (id) => getTechnique(id);

export type CliArgs = { apply: boolean; tenantId: string | null; limit: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCliArgs(argv: string[]): CliArgs {
  const at = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  const tenant = at("--tenant");
  if (tenant !== null && !UUID_RE.test(tenant)) throw new Error("--tenant geçerli bir uuid olmalı");
  const lim = Number(at("--limit") ?? 200);
  if (!Number.isInteger(lim) || lim < 1 || lim > 5000) throw new Error("--limit 1..5000 olmalı");
  return { apply: argv.includes("--apply"), tenantId: tenant, limit: lim };
}

/** Owner terminali: service_role istemcisi (anahtar ASLA yazdırılmaz). */
export async function cliDb(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ortamda yok");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Anahtarları sıralı JSON (jsonb ↔ JS karşılaştırması için). */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Karantina bağlamındaki birimi doğrular (hash + adaptör sürümü satırla aynı olmalı). */
export function unitFromContext(ctx: unknown, inputHash: string, adapterVersion: string): { unit: CalcUnit; options: Record<string, unknown>; selectionTechnique: string } | null {
  if (!isObj(ctx) || !isObj(ctx.unit) || !isObj(ctx.options) || typeof ctx.selectionTechnique !== "string") return null;
  const u = ctx.unit;
  if (u.inputHash !== inputHash || u.adapterVersion !== adapterVersion || !isObj(u.body) || typeof u.endpoint !== "string" || typeof u.lang !== "string") return null;
  const unit = { covers: [], timeDependent: false, part: 0, ...u } as unknown as CalcUnit;
  return { unit, options: ctx.options, selectionTechnique: ctx.selectionTechnique };
}

/** Sonuç satırının `input` kolonundan (gövde + lang + query) birim kimliği. */
export function unitFromResultRow(r: {
  technique: string;
  provider: string;
  provider_api_version: string;
  adapter_version: string;
  endpoint: string;
  input_hash: string;
  input: unknown;
}): CalcUnit | null {
  if (!isObj(r.input) || typeof r.input.lang !== "string") return null;
  const { lang, query, ...body } = r.input as Record<string, unknown>;
  const unit: Record<string, unknown> = {
    technique: r.technique,
    provider: r.provider,
    providerApiVersion: r.provider_api_version,
    adapterVersion: r.adapter_version,
    endpoint: r.endpoint,
    lang,
    body,
    inputHash: r.input_hash,
    covers: [],
    timeDependent: false,
    part: 0,
  };
  if (isObj(query)) unit.query = query;
  return unit as unknown as CalcUnit;
}

export const short = (h: string) => String(h).slice(0, 8);
