/**
 * GEÇİCİ TANILAMA — resmî Android uygulamasını diğer WebView'lerden ayırt edecek, uygulamanın
 * HALİHAZIRDA gönderdiği bir sinyal var mı? (native kaynak olmadan kanıt toplama)
 *
 * Yalnız UA'sında Android WebView işareti (`; wv)`) bulunan isteklerde, kişisel veri İÇERMEYEN tek
 * satır Vercel fonksiyon loguna yazılır:
 *   - x-requested-with: yalnız Android paket adı biçimindeyse değeri (ör. com.example.app), aksi halde
 *     "absent" / "other"
 *   - referer: yalnız köken (scheme+host) veya "android-app://<paket>" biçimi
 *   - sec-ch-ua marka adları (sürüm yok)
 * Kullanıcı kimliği, token, IP, ham UA LOGLANMAZ. Hiçbir yetki/oturum kararı bu fonksiyona bağlı DEĞİL.
 * Kanıt toplandıktan sonra kaldırılacak.
 */
const WEBVIEW_MARK = /;\s*wv\)/i;
const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,6}$/i;

function refererSummary(raw: string | null): string {
  if (!raw) return "absent";
  if (raw.startsWith("android-app://")) {
    const pkg = raw.slice("android-app://".length).split("/")[0] ?? "";
    return PACKAGE_RE.test(pkg) ? `android-app://${pkg}` : "android-app://other";
  }
  try {
    return new URL(raw).origin;
  } catch {
    return "other";
  }
}

export function logAppSignalDiag(route: string, headers: Headers): void {
  try {
    const ua = headers.get("user-agent") ?? "";
    if (!WEBVIEW_MARK.test(ua)) return;
    const xrw = (headers.get("x-requested-with") ?? "").trim();
    const brands = (headers.get("sec-ch-ua") ?? "")
      .split(",")
      .map((b) => (b.match(/"([^"]{1,40})"/)?.[1] ?? "").trim())
      .filter(Boolean)
      .slice(0, 5);
    console.info(
      "[app-signal-diag]",
      JSON.stringify({
        route,
        xrw: xrw ? (PACKAGE_RE.test(xrw) ? xrw : "other") : "absent",
        referer: refererSummary(headers.get("referer")),
        brands,
        yasamClient: headers.get("x-yasam-client") ? "present" : "absent",
        suffix: /\bYasamSistemiAndroid\//.test(ua),
      }),
    );
  } catch {
    /* tanılama asla isteği etkilemez */
  }
}
