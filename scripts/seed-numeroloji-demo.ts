/**
 * Numeroloji Demo Seed Script
 *
 * Demo hesaba (is_demo_account = true) 20 örnek numeroloji analizi ekler.
 * İdempotent: analysis_data içinde { _demo_seed: true } bayrağı ile takip edilir.
 * DB migration gerektirmez — tüm bilgi JSONB analysis_data içinde taşınır.
 *
 * Kullanım (proje kökünde):
 *   npx tsx scripts/seed-numeroloji-demo.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// .env.local yükle
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, "..", ".env.local") });

// Motor — relative import, @ alias gerekmez
import { hesaplaNumeroloji } from "../lib/numeroloji/numerolojiMotor";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY env değişkenleri gerekli.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type MotorOut = ReturnType<typeof hesaplaNumeroloji>;

function buildSummary(out: MotorOut): string {
  const d = (r: { display: string }) => (r.display || "—").trim() || "—";
  const pin = out.pinKodu;
  const pinStr = `[${pin.k1}][${pin.k2}][${pin.k3}][${pin.k4}] [${pin.k5}][${pin.k6}][${pin.k7}] [${pin.k8}][${pin.k9}]`;
  return [
    `Ana kulvar: ${d(out.anaKulvar)}`,
    `Yan kulvar: ${d(out.yanKulvar)}`,
    `İfade: ${d(out.ifadeSayisi)}`,
    `Hayat yolu: ${d(out.hayatYolu)}`,
    `PIN: ${pinStr}`,
  ].join(" · ");
}

// 20 demo kişi — danışan listesi demo kişilerinden farklı isimler
const DEMO_PEOPLE: Array<{
  name: string;
  surname: string;
  birthDate: string; // DD.MM.YYYY
  createdAt: string; // ISO timestamp
}> = [
  { name: "Ayşe",    surname: "Demir",    birthDate: "15.03.1985", createdAt: "2026-02-01T09:00:00Z" },
  { name: "Mehmet",  surname: "Şahin",    birthDate: "22.07.1990", createdAt: "2026-02-05T10:30:00Z" },
  { name: "Fatma",   surname: "Çelik",    birthDate: "05.11.1978", createdAt: "2026-02-10T11:00:00Z" },
  { name: "Ali",     surname: "Öztürk",   birthDate: "30.04.1988", createdAt: "2026-02-15T09:30:00Z" },
  { name: "Zeynep",  surname: "Arslan",   birthDate: "12.09.1995", createdAt: "2026-02-20T14:00:00Z" },
  { name: "Mustafa", surname: "Kaya",     birthDate: "28.01.1982", createdAt: "2026-02-25T10:00:00Z" },
  { name: "Hatice",  surname: "Doğan",    birthDate: "17.06.1975", createdAt: "2026-03-01T11:30:00Z" },
  { name: "İbrahim", surname: "Aydın",    birthDate: "03.12.1992", createdAt: "2026-03-05T09:00:00Z" },
  { name: "Elif",    surname: "Yıldız",   birthDate: "25.08.1987", createdAt: "2026-03-10T14:30:00Z" },
  { name: "Ahmet",   surname: "Koç",      birthDate: "14.02.1980", createdAt: "2026-03-15T10:00:00Z" },
  { name: "Meryem",  surname: "Çetin",    birthDate: "09.05.1993", createdAt: "2026-03-20T11:00:00Z" },
  { name: "Hüseyin", surname: "Polat",    birthDate: "31.10.1970", createdAt: "2026-03-25T13:30:00Z" },
  { name: "Büşra",   surname: "Güneş",    birthDate: "08.07.1997", createdAt: "2026-04-01T09:00:00Z" },
  { name: "Ömer",    surname: "Güler",    birthDate: "21.03.1985", createdAt: "2026-04-05T10:30:00Z" },
  { name: "Selin",   surname: "Aktaş",    birthDate: "16.09.1991", createdAt: "2026-04-10T11:00:00Z" },
  { name: "Kadir",   surname: "Bulut",    birthDate: "07.12.1983", createdAt: "2026-04-15T09:30:00Z" },
  { name: "Merve",   surname: "Özdemir",  birthDate: "19.04.1994", createdAt: "2026-04-20T14:00:00Z" },
  { name: "Yusuf",   surname: "Erdoğan",  birthDate: "02.08.1979", createdAt: "2026-05-01T10:00:00Z" },
  { name: "Ece",     surname: "Karaca",   birthDate: "25.01.1996", createdAt: "2026-05-10T11:30:00Z" },
  { name: "Taner",   surname: "Şimşek",   birthDate: "11.06.1988", createdAt: "2026-05-20T09:00:00Z" },
];

async function main() {
  console.log("🔍 Demo hesap aranıyor...");

  const { data: demoUser, error: userError } = await supabase
    .from("users")
    .select("tenant_id, email")
    .eq("is_demo_account", true)
    .single();

  if (userError || !demoUser?.tenant_id) {
    console.error("❌ Demo hesap bulunamadı:", userError?.message ?? "tenant_id yok");
    process.exit(1);
  }

  const tenantId = demoUser.tenant_id as string;
  console.log(`✓ Demo hesap bulundu: ${demoUser.email as string} (tenant: ${tenantId})`);

  // Mevcut tüm kayıtları çek — demo seed olanları tespit et
  const { data: allRecords, error: listError } = await supabase
    .from("numerology_records")
    .select("name, surname, analysis_data")
    .eq("tenant_id", tenantId);

  if (listError) {
    console.error("❌ Kayıtlar okunamadı:", listError.message);
    process.exit(1);
  }

  // Zaten seed edilmiş olanları bul (_demo_seed: true bayrağı ile)
  const existingDemoKeys = new Set<string>(
    (allRecords ?? [])
      .filter((r) => {
        const ad = r.analysis_data as Record<string, unknown> | null;
        return ad?._demo_seed === true;
      })
      .map((r) => `${r.name}|${r.surname}`)
  );

  console.log(`\n📋 ${DEMO_PEOPLE.length} kişi kontrol ediliyor...\n`);

  let inserted = 0;
  let skipped = 0;

  for (const person of DEMO_PEOPLE) {
    const key = `${person.name}|${person.surname}`;

    if (existingDemoKeys.has(key)) {
      console.log(`⏭  ${person.name} ${person.surname} zaten mevcut, atlanıyor.`);
      skipped++;
      continue;
    }

    // Motor hesaplama — gerçek numeroloji motoru kullanılır
    const motor = hesaplaNumeroloji({
      firstName: person.name,
      lastName: person.surname,
      birthDate: person.birthDate,
    });

    const analysis_data = {
      version: 1,
      motor,
      summary: buildSummary(motor),
      _demo_seed: true, // idempotent takip bayrağı — migration gerekmez
    };

    const { error: insertError } = await supabase
      .from("numerology_records")
      .insert({
        tenant_id: tenantId,
        name: person.name,
        surname: person.surname,
        birth_date: person.birthDate,
        analysis_data,
        created_at: person.createdAt,
      });

    if (insertError) {
      console.error(`❌ ${person.name} ${person.surname} eklenemedi:`, insertError.message);
    } else {
      console.log(`✓  ${person.name} ${person.surname} eklendi.`);
      inserted++;
    }
  }

  console.log(`\n✅ Tamamlandı: ${inserted} eklendi, ${skipped} atlandı.`);
}

main().catch((err: unknown) => {
  console.error("Beklenmeyen hata:", err);
  process.exit(1);
});
