/**
 * reflexology-organ-identity-harness.ts
 *
 * Refleksoloji "Protokol ↔ Kayıtlı Atlas" organ kimlik/normalizasyon regresyon
 * testi. Prod UAT'ta bulunan bug: "karaciğer" atlas anahtarı NFD, protokolde
 * seçilen "KARACİĞER" NFC olduğunda eşleşme başarısız ("Atlas bulunamadı") ve
 * organ dropdown'ında aynı organ iki kez görünüyordu.
 *
 * Bu harness GERÇEK üretim fonksiyonlarını çağırır (kopya mantık yok):
 *   organKey / dedupeByOrganKey        (merkezi kimlik kontratı)
 *   resolveOrganNameInAtlas / organHasAtlasRegions / getRegionsForOrgan
 *
 * Çalıştır:  npx tsx scripts/reflexology-organ-identity-harness.ts
 */
import { organKey, dedupeByOrganKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import {
  resolveOrganNameInAtlas,
  organHasAtlasRegions,
} from "@/app/refleksoloji/protokol-haritasi/lib/atlasMatch";
import {
  getRegionsForOrgan,
  emptyOrganEntry,
  type AtlasDocument,
  type AtlasOrganEntry,
  type StoredRegion,
} from "@/lib/atlasStorage";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    fail += 1;
    fails.push(name);
    console.log(`  ❌ ${name}`);
  }
}

function oval(id: string): StoredRegion {
  return { id, shape: "oval", cx: 100, cy: 100, rx: 20, ry: 20 };
}

// Bir organ için taban görünümünde `n` bölgeli entry üretir.
function organWithRegions(n: number, view: "taban" | "yan_dis" = "taban"): AtlasOrganEntry {
  const entry = emptyOrganEntry();
  for (let i = 0; i < n; i += 1) {
    entry[view].sol.push(oval(`${view}-${i}`));
  }
  return entry;
}

// KRİTİK FIXTURE: "karaciğer" anahtarı NFD (ğ = g + U+0306) olarak saklanır —
// prod'da eşleşmeyi bozan gerçek durum. Diğerleri NFC.
const KARACIGER_NFD = "karaciğer".normalize("NFD");
const atlas: AtlasDocument = {
  _meta: { version: "1", updated_at: "2026-01-01T00:00:00.000Z" },
  [KARACIGER_NFD]: organWithRegions(2), // taban: 2 bölge
  ["böbrek"]: organWithRegions(2),
  ["kalp"]: organWithRegions(2),
  // Yalnız "yan_dis" görünümünde olan farklı bir organ (çapraz-görünüm testi).
  ["safra kesesi"]: organWithRegions(3, "yan_dis"),
};

// Atlas anahtarının gerçekten NFD saklandığını kanıtla (fixture sağlığı).
console.log("Fixture: karaciğer atlas anahtarı NFD mi?",
  KARACIGER_NFD !== "karaciğer".normalize("NFC"),
  `(len NFD=${KARACIGER_NFD.length} NFC=${"karaciğer".length})`);

// Protokolde bir organın atlas durumu — resolveColoredRegionsForOrgans ile
// AYNI çekirdek mantık (found = eşleşen atlas bölgesi > 0).
function statusFor(input: string, view: "taban" | "yan_dis" = "taban") {
  const atlasKey = resolveOrganNameInAtlas(atlas, input);
  const regions = atlasKey
    ? getRegionsForOrgan(atlas, atlasKey, { view }).filter(
        (r) => r.shape === "oval" || r.shape === "rect",
      )
    : [];
  return { atlasKey, found: regions.length > 0, regionCount: regions.length };
}

console.log("\n=== A) organKey kanonik kontrat ===");
check("1a  organKey NFD==NFC (karaciğer)", organKey(KARACIGER_NFD) === organKey("karaciğer"));
check("1b  organKey büyük/küçük İ/i (KARACİĞER==karaciğer)",
  organKey("KARACİĞER") === organKey("karaciğer"));
check("1c  organKey baş/son boşluk kırpar", organKey("  karaciğer  ") === organKey("karaciğer"));
check("1d  organKey iç boşluk tekiller (safra  kesesi)",
  organKey("safra  kesesi") === organKey("safra kesesi"));
check("1e  organKey boş/whitespace → ''", organKey("   ") === "");
check("1f  farklı organlar farklı key (karaciğer≠kalp)",
  organKey("karaciğer") !== organKey("kalp"));

console.log("\n=== B/D) Atlas lookup — kanonik eşleşme ===");
const s1 = statusFor("karaciğer");
check("2  atlas=karaciğer(NFD), input='karaciğer'(NFC) → MATCH 2 bölge",
  s1.found && s1.regionCount === 2);
const s2 = statusFor("KARACİĞER");
check("3  atlas=karaciğer(NFD), input='KARACİĞER' → MATCH 2 bölge",
  s2.found && s2.regionCount === 2);
const s2b = statusFor("  Karaciğer ");
check("3b atlas=karaciğer, input='  Karaciğer '(boşluk+karışık) → MATCH",
  s2b.found && s2b.regionCount === 2);
const sB = statusFor("BÖBREK");
check("5  böbrek mevcut davranış (BÖBREK→2 bölge) PASS", sB.found && sB.regionCount === 2);
const sK = statusFor("Kalp");
check("6  kalp mevcut davranış (Kalp→2 bölge) PASS", sK.found && sK.regionCount === 2);

console.log("\n=== C) Dropdown dedupe (kanonik) ===");
// Atlas anahtarı NFD + organ listesi NFC/uppercase → iki kaynak, tek organ.
const fromAtlas = [KARACIGER_NFD, "böbrek", "kalp"];
const fromList = ["KARACİĞER", "karaciğer", "  karaciğer  ", "böbrek"];
const merged = dedupeByOrganKey([...fromAtlas, ...fromList]);
const karacigerCount = merged.filter((n) => organKey(n) === organKey("karaciğer")).length;
check("3c casing/NFD/NFC farkı dropdown'da tek karaciğer üretir", karacigerCount === 1);
check("4  leading/trailing whitespace duplicate üretmez",
  merged.filter((n) => organKey(n) === organKey("böbrek")).length === 1);
check("3d dropdown toplam benzersiz organ sayısı = 3 (karaciğer,böbrek,kalp)",
  merged.length === 3);

console.log("\n=== 7) Olmayan organ → Atlas bulunamadı ===");
const sNone = statusFor("dalak");
check("7  gerçekte olmayan organ (dalak) → found=false", !sNone.found && sNone.atlasKey === null);
const sEmpty = statusFor("   ");
check("7b boş girdi → found=false", !sEmpty.found && sEmpty.atlasKey === null);

console.log("\n=== 8) Bölge sayısı doğru ===");
check("8  karaciğer bölge sayısı tam olarak 2", statusFor("karaciğer").regionCount === 2);
check("8b safra kesesi (yan) bölge sayısı tam olarak 3",
  statusFor("safra kesesi", "yan_dis").regionCount === 3);

console.log("\n=== 9) Görünüm (Taban/Yan) çapraz-eşleşme yok ===");
// safra kesesi yalnız YAN'da; TABAN görünümünde 0 bölge dönmeli.
const sSafraTaban = statusFor("safra kesesi", "taban");
check("9a safra kesesi TABAN görünümünde 0 bölge (yanlış görünüm sızmaz)",
  sSafraTaban.atlasKey !== null && sSafraTaban.regionCount === 0);
// karaciğer TABAN'da var; YAN görünümünde 0 bölge (organ eşleşse de görünüm ayrı).
check("9b karaciğer YAN görünümünde 0 bölge",
  statusFor("karaciğer", "yan_dis").regionCount === 0);
// Farklı organın bölgeleri karaciğer'e sızmaz: resolveOrganNameInAtlas doğru anahtar.
check("9c karaciğer resolve → karaciğer anahtarı (kalp/böbrek değil)",
  organKey(resolveOrganNameInAtlas(atlas, "KARACİĞER") ?? "") === organKey("karaciğer"));

console.log("\n=== organHasAtlasRegions (matching helper) ===");
check("h1 organHasAtlasRegions(KARACİĞER, taban) = true",
  organHasAtlasRegions(atlas, "KARACİĞER", "taban"));
check("h2 organHasAtlasRegions(dalak) = false", !organHasAtlasRegions(atlas, "dalak"));
check("h3 organHasAtlasRegions(safra kesesi, taban) = false (yalnız yan)",
  !organHasAtlasRegions(atlas, "safra kesesi", "taban"));

console.log(`\n──────── SONUÇ: ${pass}/${pass + fail} PASS ────────`);
if (fail > 0) {
  console.log("BAŞARISIZ:", fails.join(" | "));
  process.exit(1);
}
console.log("✅ Tüm organ kimlik regresyon testleri geçti.");
