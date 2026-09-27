/**
 * clients.gorusme (son görüşme tarihi) SUNUCU tarafı ilerletmesi.
 *
 * Eskiden istemci "tamamlandı" sonrası danışanı okuyup UTC gününe göre (ve gelecekteki
 * randevuda bile) gorusme'yi PATCH ediyordu. Artık randevu API'si karar verir:
 *  - yalnız randevu anı ≤ şimdi ise,
 *  - aday gün = randevunun İstanbul takvim günü,
 *  - yalnız ileri alınır (nextGorusme) ve eşzamanlı yazıma karşı koşullu UPDATE.
 *
 * Hata durumunda sessizce null döner: gorusme türetilmiş bir özet alanıdır; randevu
 * statü güncellemesi bu yüzden başarısız SAYILMAZ.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInZone } from "@/lib/time/reportTime";
import { isAppointmentInFuture, nextGorusme } from "@/lib/danisan/appointmentRules";

export async function advanceClientGorusme(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  appointmentDate: unknown,
  now: Date = new Date(),
): Promise<string | null> {
  if (!clientId || isAppointmentInFuture(appointmentDate, now)) return null;
  const { data, error } = await db
    .from("clients")
    .select("gorusme")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  const current = ((data as { gorusme?: string | null }).gorusme ?? null) as string | null;
  const next = nextGorusme(current, appointmentDate, todayInZone(undefined, now));
  if (!next) return null;

  let q = db.from("clients").update({ gorusme: next }).eq("id", clientId).eq("tenant_id", tenantId);
  // Koşullu yazım: arada başka bir istek daha yeni tarih yazdıysa ezme.
  q = current === null ? q.is("gorusme", null) : q.eq("gorusme", current);
  const { data: updated, error: updErr } = await q.select("gorusme");
  if (updErr || !Array.isArray(updated) || updated.length === 0) return null;
  return next;
}
