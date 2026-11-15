/**
 * Astroloji harness'ları — CSS modülü yükleyicisi (yalnız test; `node --require`). Next.js derlemesinde `*.module.css` sınıf adı
 * nesnesine çevrilir; tsx/Node bunu yapamaz ve UI bileşeni içe aktaran harness'lar "SyntaxError: Unexpected token '.'" ile çöker
 * (ilk örnek: app/admin/astroloji/_components/proTechnique.module.css, #644). Bu yükleyici CSS içeriğini çalıştırmaz; sınıf adı
 * erişiminde anahtarın kendisini döndürür (s.root === "root"). Ürün kodu ve stil davranışı etkilenmez.
 */
"use strict";
const stub = (m) => {
  m.exports = new Proxy({}, { get: (_t, k) => (k === "__esModule" ? false : k === "default" ? m.exports : typeof k === "string" ? k : undefined) });
};
require.extensions[".css"] = stub;
