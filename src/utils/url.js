// ─── URL Utilities ─────────────────────────────────────────────────
// Normalize URL ที่ผู้ใช้ป้อน — เติม https:// ถ้าไม่มี protocol
// เพื่อป้องกัน browser มอง URL เป็น relative path

export function normalizeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';

  // ถ้ามี protocol อยู่แล้ว ใช้ตามนั้น
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  // ถ้าเป็น protocol-relative (//example.com) → เติม https:
  if (trimmed.startsWith('//')) return 'https:' + trimmed;

  // ตัด leading slash (กรณีผู้ใช้พิมพ์ /example.com)
  const cleaned = trimmed.replace(/^\/+/, '');

  return 'https://' + cleaned;
}
