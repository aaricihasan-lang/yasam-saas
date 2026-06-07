import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// .env.local ve .env dosyalarını yükle (dotenv gerekmez)
function loadEnvFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // dosya yoksa sessizce geç
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

// -------------------------------------------------------
// Tip tanımları
// -------------------------------------------------------

interface RawKayit {
  id?: string;
  kategori: string;
  baslik: string;
  kod: string;
  anahtarlar?: unknown[];
  icerik?: string;
  aktif?: boolean;
  olusturma_tarihi?: string;
  guncelleme_tarihi?: string;
}

interface ImportJson {
  kayitlar: RawKayit[];
}

interface KnowledgeRow {
  tenant_id: null;
  source_id: string | null;
  kategori: string;
  baslik: string;
  kod: string;
  anahtarlar: unknown[];
  icerik: string;
  aktif: boolean;
  desktop_created_at: string | null;
  desktop_updated_at: string | null;
}

// -------------------------------------------------------
// Yardımcı: batch
// -------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// -------------------------------------------------------
// Ana fonksiyon
// -------------------------------------------------------

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Kullanım: npm run import:hd-knowledge -- <dosya.json>");
    process.exit(1);
  }

  const absPath = resolve(process.cwd(), filePath);
  console.log(`Dosya okunuyor: ${absPath}`);

  let raw: string;
  try {
    raw = readFileSync(absPath, "utf-8");
  } catch (err) {
    console.error(`Dosya okunamadı: ${absPath}`);
    console.error(err);
    process.exit(1);
  }

  let parsed: ImportJson;
  try {
    parsed = JSON.parse(raw) as ImportJson;
  } catch (err) {
    console.error("JSON parse hatası:", err);
    process.exit(1);
  }

  if (!Array.isArray(parsed.kayitlar)) {
    console.error('Hata: JSON içinde "kayitlar" adında bir dizi bulunamadı.');
    process.exit(1);
  }

  const kayitlar = parsed.kayitlar;
  console.log(`Toplam kayıt: ${kayitlar.length}`);

  // Supabase bağlantısı
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Hata: NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil.",
    );
    console.error(".env.local dosyasını kontrol edin.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Map
  const rows: KnowledgeRow[] = kayitlar.map((k) => ({
    tenant_id: null,
    source_id: k.id ?? null,
    kategori: k.kategori,
    baslik: k.baslik,
    kod: k.kod,
    anahtarlar: Array.isArray(k.anahtarlar) ? k.anahtarlar : [],
    icerik: k.icerik ?? "",
    aktif: k.aktif !== false,
    desktop_created_at: k.olusturma_tarihi ?? null,
    desktop_updated_at: k.guncelleme_tarihi ?? null,
  }));

  // Batch upsert
  const BATCH_SIZE = 100;
  const batches = chunk(rows, BATCH_SIZE);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNum = i + 1;

    const { error } = await supabase
      .from("human_design_knowledge")
      .upsert(batch, { onConflict: "kod" });

    if (error) {
      console.error(`Batch ${batchNum}/${batches.length} HATA:`, error.message);
      errorCount += batch.length;
    } else {
      successCount += batch.length;
      console.log(
        `Batch ${batchNum}/${batches.length} tamamlandı (${batch.length} kayıt)`,
      );
    }
  }

  console.log("\n--- Sonuç ---");
  console.log(`Toplam   : ${kayitlar.length}`);
  console.log(`Başarılı : ${successCount}`);
  console.log(`Hatalı   : ${errorCount}`);

  if (errorCount > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error("Beklenmeyen hata:", err);
  process.exit(1);
});
