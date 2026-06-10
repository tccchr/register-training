import { parseClassDate } from '../utils/dateFormat';

/**
 * แสดงวันที่รูปแบบ: Friday, 19th June 2026
 * โดยชื่อวันมีสีตามสีประจำวันในไทย และ th/st/nd/rd เป็น <sup>
 *
 * Props:
 *   dateStr   - string YYYY-MM-DD
 *   showDay   - แสดงชื่อวัน (default: true)
 *   compact   - mode สั้น สำหรับ card เล็กๆ
 *   className - extra classes
 */
export default function FormattedDate({ dateStr, showDay = true, compact = false, className = '' }) {
  const p = parseClassDate(dateStr);
  if (!p) return <span className={className}>{dateStr || '-'}</span>;

  if (compact) {
    return (
      <span className={className}>
        {showDay && <span className={`font-semibold ${p.color}`}>{p.dayName.slice(0, 3)} </span>}
        <span>
          {p.dayNum}<sup className="text-[0.6em] font-normal">{p.suffix}</sup> {p.monthName.slice(0, 3)} {p.year}
        </span>
      </span>
    );
  }

  return (
    <span className={className}>
      {showDay && <span className={`font-semibold ${p.color}`}>{p.dayName}, </span>}
      <span>
        {p.dayNum}<sup className="text-[0.6em] font-normal">{p.suffix}</sup> {p.monthName} {p.year}
      </span>
    </span>
  );
}
