export const STORAGE_QUOTA_ERROR_MESSAGE =
  "Tarayıcı depolama alanı doldu. Ekleri/fotoğrafları küçültün veya bazı kayıtları silin.";

export function safeLocalStorageSetItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
