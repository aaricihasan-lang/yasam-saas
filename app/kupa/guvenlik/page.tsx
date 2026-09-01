import { redirect } from "next/navigation";

/**
 * FAZ 4 — UX kararı (owner FINAL): bağımsız Güvenlik & Kontrendikasyonlar CRUD
 * çalışma alanı normal kullanıcı akışından KALDIRILDI. Teknikte güvenlik artık
 * yalnız `cupping_techniques.safety_note` serbest alanıyla girilir; protokol
 * güvenliği kendi QuickCreate akışında yönetilir. Bu rota artık doğrudan URL ile
 * gizli bir CRUD paneli açmaz — Kupa ana sayfasına yönlendirir.
 *
 * NOT: Backend güvenlik master altyapısı (/api/kupa/safety, cupping_safety_notes)
 * protokol QuickCreate için AYNEN korunur; burada yalnız standalone UI kaldırıldı.
 */
export default function GuvenlikPage() {
  redirect("/kupa");
}
