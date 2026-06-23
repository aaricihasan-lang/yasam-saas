// Demo fixture verisi — yalnızca is_demo_account=true hesabında devreye girer. DB'ye yazılmaz.

import type { ReflexologyProtocolRecord } from "@/app/refleksoloji/kayitli-protokoller/types";
import type { SavedProtocol } from "@/app/refleksoloji/protokol-haritasi/types";

export const DEMO_FIXTURE_PROTO_PREFIX = "demo-fixture-proto-";
export const DEMO_USER_LOCAL_PREFIX = "user-local-";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

// ─── Fixture Protokoller ──────────────────────────────────────────────────────

export const DEMO_SEED_PROTOCOLS: ReflexologyProtocolRecord[] = [
  {
    id: "demo-fixture-proto-1",
    tenant_id: "demo-tenant",
    source_uid: null,
    title: "Stres & Anksiyete Protokolü",
    target_problem: "Kronik stres, anksiyete ve uyku bozukluğu. Sempatik sinir sistemi aktivasyonunu dengelemek.",
    organs: "Güneş Sinir Ağı | Hipofiz | Böbrekler | Adrenal Bezler | Diyafram | Tiroid",
    application_notes: "Seans başına 5 dakika ısınma ile başlayın. Her organı 2-3 dakika çalışın. Güneş sinir ağına özellikle dikkat edin. Seans sonunda genel rahatlama tekniklerini uygulayın. Haftada 2-3 seans önerilir.",
    raw_json: { demo_seed: true },
    created_at: daysAgo(12),
  },
  {
    id: "demo-fixture-proto-2",
    tenant_id: "demo-tenant",
    source_uid: null,
    title: "Sindirim Sistemi Desteği",
    target_problem: "İrritabl bağırsak sendromu, hazımsızlık ve abdominal kramp yakınmaları.",
    organs: "Mide | İnce Bağırsak | Kalın Bağırsak | Karaciğer | Pankreas | Dalak",
    application_notes: "Seans öncesi hafif ısınma yapılır. Karaciğer ve pankreas noktaları 3 dakika çalışılır. Bağırsak bölgelerine saat yönünde hafif baskı uygulanır. Seans sonrası bol su içilmesi önerilir.",
    raw_json: { demo_seed: true },
    created_at: daysAgo(25),
  },
  {
    id: "demo-fixture-proto-3",
    tenant_id: "demo-tenant",
    source_uid: null,
    title: "Uyku Düzenleyici Protokol",
    target_problem: "Kronik uyku bozukluğu, uykuya dalmada güçlük ve gece uyanma sorunları.",
    organs: "Pineal Bez | Hipofiz | Güneş Sinir Ağı | Böbrekler | Tiroid | Servikal Vertebralar",
    application_notes: "Akşam saatlerinde uygulanması tercih edilir. Pineal bez ve hipofiz noktaları çok hafif baskı ile çalışılır. Servikal vertebra bölgesi gerginlik giderici tekniklerle desteklenir. Seans 45 dakika olarak planlanır.",
    raw_json: { demo_seed: true },
    created_at: daysAgo(38),
  },
  {
    id: "demo-fixture-proto-4",
    tenant_id: "demo-tenant",
    source_uid: null,
    title: "Bağışıklık Sistemi Güçlendirici",
    target_problem: "Sık tekrarlayan enfeksiyon, grip ve bağışıklık sistemi zayıflığı.",
    organs: "Timus | Dalak | Lenf Bezleri | Böbrekler | Adrenal Bezler | Akciğerler",
    application_notes: "Akut enfeksiyon döneminde uygulanmaz. Timus noktasına 5 dakika orta baskı uygulanır. Lenf bölgeleri boyundan ayağa doğru çalışılır. Haftada 1-2 seans önerilir. 6 haftalık program.",
    raw_json: { demo_seed: true },
    created_at: daysAgo(50),
  },
  {
    id: "demo-fixture-proto-5",
    tenant_id: "demo-tenant",
    source_uid: null,
    title: "Baş & Boyun Gerilimi Protokolü",
    target_problem: "Gerilim tipi baş ağrısı, boyun sertliği ve servikal disk problemleri.",
    organs: "Servikal Vertebralar | Kafa Derisi | Boyun Kasları | Omuzlar | Sinüsler | Göz Çevresi",
    application_notes: "Başparmak tekniği ile servikal bölge çalışılır. Her vertebra noktasına 60-90 saniye baskı uygulanır. Kafa derisi refleks noktaları döngüsel hareketle aktive edilir. Günlük uygulamaya uygundur.",
    raw_json: { demo_seed: true },
    created_at: daysAgo(65),
  },
];

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

export function isDemoFixtureProtocol(id: string): boolean {
  return id.startsWith(DEMO_FIXTURE_PROTO_PREFIX);
}

export function isUserLocalProtocol(id: string): boolean {
  return id.startsWith(DEMO_USER_LOCAL_PREFIX);
}

export function savedProtocolToRecord(p: SavedProtocol): ReflexologyProtocolRecord {
  return {
    id: `${DEMO_USER_LOCAL_PREFIX}${p.id}`,
    tenant_id: "demo-tenant",
    source_uid: p.id,
    title: p.title,
    target_problem: p.description || null,
    organs: p.organs.length > 0 ? p.organs.join(" | ") : null,
    application_notes: p.notes || null,
    raw_json: p as unknown as Record<string, unknown>,
    created_at: p.createdAt,
  };
}

// ─── Demo refleksoloji localStorage temizleme (logout'ta çağrılır) ────────────

export function clearDemoRefleksoloji(): void {
  if (typeof window === "undefined") return;
  const keys = [
    "yasam-refleksoloji-atlas-v1",
    "yasam-refleksoloji-organs-v1",
    "yasam-refleksoloji-protokoller-v1",
    "yasam-refleksoloji-notlar-v1",
  ];
  keys.forEach((k) => localStorage.removeItem(k));
}
