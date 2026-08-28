import { NextRequest, NextResponse } from "next/server";
import { requireStoreAdmin } from "@/lib/store/adminStoreGuard";
import {
  storeError,
  invalidBody,
  asPlainObject,
  onlyAllowedKeys,
} from "@/lib/store/adminHttp";
import { normalizeWhatsappNumber } from "@/lib/store/whatsapp";

export const runtime = "nodejs";

/**
 * /api/admin/magaza/settings — OWNER-ONLY mağaza ayarı (WhatsApp).
 *   - GET: singleton ayar.
 *   - PATCH: {whatsapp_number?, whatsapp_enabled?}. Numara normalize edilir (yalnız rakam).
 *     Aktifken numara zorunlu (broken CTA engeli).
 */

const PATCH_KEYS = ["whatsapp_number", "whatsapp_enabled"] as const;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { data, error } = await db
    .from("store_settings")
    .select("whatsapp_number, whatsapp_enabled")
    .eq("id", true)
    .maybeSingle();
  if (error) return storeError("Ayar alınamadı.", "STORE_SETTINGS_GET_FAILED", 500);

  return NextResponse.json({
    ok: true,
    row: {
      whatsapp_number: data?.whatsapp_number ?? null,
      whatsapp_enabled: data?.whatsapp_enabled === true,
    },
  });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireStoreAdmin(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return invalidBody();
  }
  const obj = asPlainObject(raw);
  if (!obj || !onlyAllowedKeys(obj, PATCH_KEYS)) return invalidBody();

  // Mevcut ayarı oku (yalnız toggle edilirken numarayı korumak için).
  const { data: current } = await db
    .from("store_settings")
    .select("whatsapp_number, whatsapp_enabled")
    .eq("id", true)
    .maybeSingle();

  let nextNumber: string | null = current?.whatsapp_number ?? null;
  if ("whatsapp_number" in obj) {
    if (obj.whatsapp_number === null || obj.whatsapp_number === "") {
      nextNumber = null;
    } else {
      const normalized = normalizeWhatsappNumber(obj.whatsapp_number);
      if (!normalized) {
        return storeError("Geçersiz WhatsApp numarası.", "STORE_WHATSAPP_INVALID", 400);
      }
      nextNumber = normalized;
    }
  }

  let nextEnabled: boolean = current?.whatsapp_enabled === true;
  if ("whatsapp_enabled" in obj) {
    if (typeof obj.whatsapp_enabled !== "boolean") return invalidBody();
    nextEnabled = obj.whatsapp_enabled;
  }

  // Aktifken numara zorunlu.
  if (nextEnabled && !nextNumber) {
    return storeError(
      "WhatsApp'ı aktif etmek için geçerli bir numara girmelisiniz.",
      "STORE_WHATSAPP_NUMBER_REQUIRED",
      400,
    );
  }

  const { data, error } = await db
    .from("store_settings")
    .update({ whatsapp_number: nextNumber, whatsapp_enabled: nextEnabled })
    .eq("id", true)
    .select("whatsapp_number, whatsapp_enabled")
    .maybeSingle();

  if (error) return storeError("Ayar güncellenemedi.", "STORE_SETTINGS_UPDATE_FAILED", 500);
  if (!data) {
    // Singleton satır yoksa oluştur (savunma; migration seed'i normalde garanti eder).
    const { data: inserted, error: insErr } = await db
      .from("store_settings")
      .insert({ id: true, whatsapp_number: nextNumber, whatsapp_enabled: nextEnabled })
      .select("whatsapp_number, whatsapp_enabled")
      .single();
    if (insErr) return storeError("Ayar güncellenemedi.", "STORE_SETTINGS_UPDATE_FAILED", 500);
    return NextResponse.json({ ok: true, row: inserted });
  }

  return NextResponse.json({ ok: true, row: data });
}
