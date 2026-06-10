import FormattedDate from './FormattedDate';
import { normalizeUrl } from '../utils/url';

/**
 * Class Detail Modal — แสดงรายละเอียดของคลาส:
 *   - วัตถุประสงค์ (description)
 *   - สถานที่ + แผนที่ Google Maps
 *   - รายชื่อสมาชิก
 *
 * Props:
 *   cls       — class object (มี name, date, start_time, end_time, location, location_url)
 *   course    — course object (ใช้ title และ description)
 *   members   — array ของ employee objects ที่ลงทะเบียนคลาสนี้
 *   onClose   — callback
 */
export default function ClassDetailModal({ cls, course, members = [], onClose }) {
  if (!cls) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-start bg-blue-50/40">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-gray-900 truncate">{cls.name}</h3>
            {course?.title && <p className="text-sm text-blue-600 mt-1 truncate">{course.title}</p>}
            <p className="text-sm text-gray-600 mt-2">
              <FormattedDate dateStr={cls.date} /> • {cls.start_time} - {cls.end_time}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full flex-shrink-0 ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="ปิด"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-auto p-5 flex-1 space-y-5">
          {/* วัตถุประสงค์ */}
          {course?.description && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-xs font-bold text-yellow-800 mb-2 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                วัตถุประสงค์ในการอบรม
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{course.description}</p>
            </div>
          )}

          {/* สถานที่ + แผนที่ */}
          {(cls.location || cls.location_url) && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">สถานที่อบรม</p>
              <p className="text-sm font-medium text-gray-900">{cls.location || '-'}</p>
              {cls.location_url && (
                <a
                  href={normalizeUrl(cls.location_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-full transition-colors min-h-[40px] shadow-sm"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
                  </svg>
                  ดูแผนที่
                </a>
              )}
            </div>
          )}

          {/* วิทยากร */}
          {cls.instructor && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">วิทยากร</p>
              <p className="text-sm font-medium text-gray-900">{cls.instructor}</p>
            </div>
          )}

          {/* รายชื่อสมาชิก */}
          <div>
            <p className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              รายชื่อผู้เข้าร่วม ({members.length} คน)
            </p>
            {members.length === 0 ? (
              <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-lg text-center border">
                ยังไม่มีผู้ลงทะเบียนในคลาสนี้
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {members.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-white">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {(m.id || '').substring(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.id}</p>
                      <p className="text-xs text-gray-500 truncate">{m.division || 'ไม่ระบุ Division'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 min-h-[40px]">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
