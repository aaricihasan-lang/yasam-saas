// I18N rapor golden (grup A+B) — Usage360 yazımı yerine no-op (DB'ye SIFIR yazma).
"use strict";
exports.trackUsage = async () => {};
exports.trackUsageLater = () => {};
exports.usageErrorClassForStatus = () => null;
exports.IDEM_WINDOW_SECONDS = 60;
exports.resolveUsageHashSecret = () => "zz-rapor-ab";
exports.buildUsageIdemHash = () => "zz";
