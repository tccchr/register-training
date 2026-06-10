// ─── Date Formatting Utilities ──────────────────────────────────────────
// Format: [Day], [Date]th [Month] [Year]
// Day color theme based on Thai day-of-week colors

const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];

// สีประจำวันในไทย (Tailwind classes)
export const DAY_COLORS = {
  0: 'text-red-500',      // Sunday = แดง
  1: 'text-yellow-500',   // Monday = เหลือง
  2: 'text-pink-500',     // Tuesday = ชมพู
  3: 'text-green-600',    // Wednesday = เขียว
  4: 'text-orange-500',   // Thursday = ส้ม
  5: 'text-blue-600',     // Friday = ฟ้า
  6: 'text-purple-600',   // Saturday = ม่วง
};

// Background color version (สำหรับ badge หรือ pill)
export const DAY_BG_COLORS = {
  0: 'bg-red-50 text-red-600 border-red-200',
  1: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  2: 'bg-pink-50 text-pink-600 border-pink-200',
  3: 'bg-green-50 text-green-700 border-green-200',
  4: 'bg-orange-50 text-orange-600 border-orange-200',
  5: 'bg-blue-50 text-blue-600 border-blue-200',
  6: 'bg-purple-50 text-purple-600 border-purple-200',
};

// แปลง suffix th/st/nd/rd
export function getOrdinalSuffix(day) {
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

// แปลงวันที่ string (YYYY-MM-DD) เป็น object พร้อมข้อมูลครบ
export function parseClassDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  const dayIndex = d.getDay();
  const dayName = DAYS_EN[dayIndex];
  const monthName = MONTHS_EN[d.getMonth()];
  const dayNum = d.getDate();
  const year = d.getFullYear();
  const suffix = getOrdinalSuffix(dayNum);

  return {
    raw: dateStr,
    dateObj: d,
    dayIndex,
    dayName,
    monthName,
    dayNum,
    year,
    suffix,
    color: DAY_COLORS[dayIndex],
    bgColor: DAY_BG_COLORS[dayIndex]
  };
}

// React component-friendly: คืนค่า JSX-friendly elements
// ใช้ใน JSX แบบ: <FormattedDate dateStr={cls.date} />
export function formatDateString(dateStr) {
  const p = parseClassDate(dateStr);
  if (!p) return dateStr || '';
  return `${p.dayName}, ${p.dayNum}${p.suffix} ${p.monthName} ${p.year}`;
}
