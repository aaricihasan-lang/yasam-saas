/**
 * HD-0 güvenlik harness — statik değişmez doğrulaması.
 *
 * Ağ/DB/upload YOK. Yeni kaynak dosyalardaki güvenlik değişmezlerini deterministik
 * doğrular. Runtime davranışı (canlı 401/403) gerektiren senaryolar KONTROLLÜ ortama
 * bırakılır (prod'a dokunulmaz) ve aşağıda "runtime-gerekli" olarak işaretlenir.
 *
 * Çalıştır: node scripts/hd0-security-check.mjs   (repo kökünden)
 */
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");

let pass = 0;
let fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${desc}`);
  } else {
    fail++;
    fails.push(desc);
    console.log(`  FAIL  ${desc}`);
  }
}

const upload = read("app/api/hd/upload-chart-image/route.ts");
const del = read("app/api/hd/delete-chart-image/route.ts");
const signed = read("app/api/hd/chart-image-url/route.ts");
const comp = read("app/human-design/danisanlar/components/HdChartImageUpload.tsx");
const lockMig = read("supabase/migrations/20260726000000_lock_human_design_tables_anon.sql");
const bucketMig = read("supabase/migrations/20260726010000_hd_chart_images_bucket_private.sql");

// Yorumları çıkararak yalnız yürütülen kodu değerlendir (yanlış-negatif önleme).
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const stripSql = (s) => s.replace(/^\s*--.*$/gm, "");
const delCode = stripJs(del);
const bucketCode = stripSql(bucketMig);

console.log("── UPLOAD ROUTE ──");
check("verifyUserRequest çağrılır (oturumsuz → 401 guard)", /verifyUserRequest\(req\)/.test(upload) && /if \(!guard\.ok\) return guard\.response/.test(upload));
check("tenantId istekten OKUNMAZ (form.get('tenantId') yok)", !/get\(["']tenantId["']\)/.test(upload));
check("tenant guard'dan alınır (guard.tenantId)", /guard\.tenantId/.test(upload));
check("demo yazma bloğu guard'dan", /guard\.is_demo_account/.test(upload));
check("MIME allow-list (jpeg/png/webp)", /image\/jpeg/.test(upload) && /image\/png/.test(upload) && /image\/webp/.test(upload) && /EXT_BY_MIME\[file\.type\]/.test(upload));
check("5 MB sınırı", /5 \* 1024 \* 1024/.test(upload));
check("dosya adı kullanıcıdan alınmaz — uuid path", /crypto\.randomUUID\(\)/.test(upload) && /\$\{guard\.tenantId\}\/\$\{clientId\}\//.test(upload));
check("DB'ye publicUrl YAZILMAZ (getPublicUrl yok)", !/getPublicUrl/.test(upload));
check("DB'ye storagePath yazılır", /chart_image_url: storagePath/.test(upload));
check("response'ta storagePath DÖNMEZ (yalnız hasImage + signedUrl)", /\{ ok: true, hasImage: true, signedUrl \}/.test(upload) && !/ok: true, storagePath/.test(upload));
check("danışan sahipliği tenant-scoped", /\.eq\("tenant_id", guard\.tenantId\)/.test(upload));
check("eski dosya temizliği paylaşımlı sahiplik-predicate'i ile", /isOwnedChartImagePath\(previousPath, guard\.tenantId, clientId\)/.test(upload));
check("ham hata metni sızmaz (genel mesaj)", /Görsel yüklenemedi/.test(upload) && !/uploadError\.message\s*\}/.test(upload));
check("bucket oluşturma/ayar değişikliği yok (createBucket/updateBucket yok)", !/createBucket|updateBucket/.test(upload));
check("yanıt no-store", /Cache-Control["']\s*:\s*["']no-store/.test(upload));

console.log("── DELETE ROUTE ──");
check("verifyUserRequest çağrılır", /verifyUserRequest\(req\)/.test(del) && /if \(!guard\.ok\) return guard\.response/.test(del));
check("tenantId istekten OKUNMAZ (yalnız guard.tenantId)", !/tenantId/.test(delCode.replace(/guard\.tenantId/g, "")));
check("keyfi storagePath istekten OKUNMAZ (kod)", !/storagePath/.test(delCode));
check("path DB'den okunur (chart_image_url select)", /select\("id, chart_image_url"\)/.test(del));
check("silme yalnız paylaşımlı sahiplik-predicate'i ile", /isOwnedChartImagePath\(currentPath, guard\.tenantId, clientId\)/.test(del));
check("demo bloğu", /guard\.is_demo_account/.test(del));
check("danışan/rapor SİLİNMEZ (yalnız chart_image_url null)", /chart_image_url: null/.test(del) && !/\.delete\(\)/.test(del));
check("ham hata metni sızmaz", !/err.*message.*\}\s*,\s*\{ status/.test(del));

console.log("── SIGNED URL ROUTE ──");
check("verifyUserRequest çağrılır", /verifyUserRequest\(req\)/.test(signed));
check("yalnız clientId alınır (searchParams)", /searchParams\.get\("clientId"\)/.test(signed));
check("istemciden path ALINMAZ (searchParams path yok)", !/searchParams\.get\(["'](path|storagePath|filePath)["']\)/.test(signed));
check("path DB'den okunur + paylaşımlı sahiplik-predicate re-check", /!isOwnedChartImagePath\(path, guard\.tenantId, clientId\)/.test(signed));
check("TTL = 3600", /SIGNED_TTL\s*=\s*3600/.test(signed) && /createSignedUrl\(path, SIGNED_TTL\)/.test(signed));
check("path yoksa güvenli boş sonuç", /hasImage: false/.test(signed));
check("no-store", /no-store/.test(signed));

console.log("── CLIENT COMPONENT ──");
check("auth header'ları eklenir (x-user-id + x-session-token)", /x-user-id/.test(comp) && /x-session-token/.test(comp));
check("upload'ta tenantId GÖNDERİLMEZ", !/append\(["']tenantId["']/.test(comp));
check("FormData'da Content-Type manuel set EDİLMEZ (upload fetch)", !/append\(["']tenantId["']/.test(comp) && !/["']Content-Type["']\s*:\s*["']multipart/.test(comp));
check("silme yalnız clientId gönderir (storagePath yok)", /JSON\.stringify\(\{ clientId \}\)/.test(comp));
check("görsel durumu clientId ile server'dan çözülür (chart-image-url route)", /\/api\/hd\/chart-image-url\?clientId=/.test(comp));
check("upload response'undan storagePath TÜKETİLMEZ (path'e bağımlı değil)", !/json\.storagePath/.test(comp));
check("DB path doğrudan img src DEĞİL (displayUrl state; currentImageUrl src değil)", /src=\{displayUrl\}/.test(comp) && !/src=\{currentImageUrl\}/.test(comp));
check("legacy → güvenli 'eski format' durumu (img src http YOK)", /status === "legacy"/.test(comp) && /Eski görsel formatı algılandı/.test(comp));
check("legacy http URL img src olarak YÜKLENMEZ", !/src=\{[^}]*http/.test(comp) && !/setDisplayUrl\(path\)/.test(comp));

console.log("── PAYLAŞIMLI PATH PREDICATE ──");
const helper = read("lib/human-design/api/chartImagePath.ts");
check("isOwnedChartImagePath export edilir", /export function isOwnedChartImagePath/.test(helper));
check("http(s) legacy → sahiplenilmez (predicate içinde)", /isHttpUrl\(p\)\)?\s*return false/.test(helper) || /if \(isHttpUrl\(p\)\) return false/.test(helper));
check("prefix tam eşleşme ({tenant}/{client}/)", /startsWith\(`\$\{tenantId\}\/\$\{clientId\}\/`\)/.test(helper));
check("3 route da paylaşımlı predicate'i kullanır", /isOwnedChartImagePath/.test(upload) && /isOwnedChartImagePath/.test(del) && /isOwnedChartImagePath/.test(signed));

console.log("── MIGRATION A (tablo kilidi) ──");
check("5 HD tablosu hedeflenir", ["human_design_clients","human_design_charts","human_design_knowledge_records","human_design_reports","human_design_knowledge"].every((t) => lockMig.includes(t)));
check("REVOKE ALL PRIVILEGES FROM anon, authenticated", /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM anon, authenticated/.test(lockMig));
check("kolon-seviyesi SELECT revoke döngüsü", /REVOKE SELECT \(%I\)/.test(lockMig));
check("ENABLE ROW LEVEL SECURITY (FORCE değil)", /ENABLE ROW LEVEL SECURITY/.test(lockMig) && !/FORCE ROW LEVEL SECURITY/.test(lockMig));
check("yeni policy OLUŞTURULMAZ (CREATE POLICY yok)", !/CREATE POLICY/.test(lockMig));
check("tablo/veri SİLİNMEZ (DROP TABLE / DELETE FROM yok)", !/DROP TABLE/i.test(lockMig) && !/DELETE FROM/i.test(lockMig));
check("idempotent — tablo yoksa atla (to_regclass)", /to_regclass/.test(lockMig));

console.log("── MIGRATION B (private bucket) ──");
check("bucket private (public=false)", /'hd-chart-images',\s*\n\s*'hd-chart-images',\s*\n\s*false/.test(bucketMig) || /false,\s*\n\s*5242880/.test(bucketMig));
check("ON CONFLICT DO UPDATE (DO NOTHING DEĞİL)", /ON CONFLICT \(id\) DO UPDATE/.test(bucketCode) && !/DO NOTHING/.test(bucketCode));
check("public=false dayatılır", /public\s*=\s*EXCLUDED\.public/.test(bucketMig));
check("5 MB + mime allow-list", /5242880/.test(bucketMig) && /image\/jpeg/.test(bucketMig) && /image\/webp/.test(bucketMig));
check("anon/authenticated storage policy AÇILMAZ (CREATE POLICY yok)", !/CREATE POLICY/.test(bucketMig));
check("bucket/dosya SİLİNMEZ (DROP/DELETE yok)", !/DROP/i.test(bucketMig) && !/DELETE/i.test(bucketMig));

console.log("\n── RUNTIME-GEREKLİ (bu harness kapsamı dışı; kontrollü ortamda doğrulanır) ──");
console.log("  NOTE  Oturumsuz upload/delete/signed-url → 401 : verifyUserRequest guard'ı ile zorlanır (kod kanıtlandı; canlı HTTP prod'a dokunmamak için ertelendi)");
console.log("  NOTE  Başka tenant danışanı → 403 : tenant-scoped .eq(tenant_id, guard.tenantId) + maybeSingle null → 403 (kod kanıtlandı)");
console.log("  NOTE  Geçerli kullanıcı + kendi danışanı → izin : guard + ownership (kod kanıtlandı)");

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILED:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
