import { useState } from 'react';
import FormattedDate from './FormattedDate';
import ClassDetailModal from './ClassDetailModal';
import { normalizeUrl } from '../utils/url';
import { isClassFinished } from '../utils/courseStatus';

/**
 * MyReservationModal — แสดงรายละเอียดการลงทะเบียนของผู้ใช้
 *
 * ใช้ใน EmployeePortal และ UserCalendar — Detail ที่เห็นเหมือนกัน 100%
 *
 * Props:
 *   isOpen          — boolean
 *   course          — course object (มี title, description, selection_mode, classes)
 *   currentCls      — class object ที่ user ลงทะเบียนปัจจุบัน
 *   reservations    — array reservations ทั้งหมด (สำหรับนับและดึง members)
 *   allEmployees    — object/map ของพนักงานทั้งหมด (สำหรับแสดงรายชื่อ)
 *   onChangeClass   — callback (targetCls) => void
 *   onCancel        — callback () => void  (ยกเลิกการจอง)
 *   onClose         — callback () => void  (ปิด modal)
 *   canModifyReservation — boolean (ถ้า false จะปิดการย้าย/ยกเลิก)
 *   modificationLockedMessage — string ข้อความแจ้งเหตุผลที่แก้ไขไม่ได้
 */
export default function MyReservationModal({
  isOpen,
  course,
  currentCls,
  reservations = [],
  allEmployees = {},
  onChangeClass,
  onCancel,
  onClose,
  canModifyReservation = true,
  modificationLockedMessage = 'ไม่สามารถเปลี่ยนคลาสหรือยกเลิกการลงทะเบียนได้แล้ว'
}) {
  const [viewMembersFor, setViewMembersFor] = useState(null);   // class object ที่กำลังดูรายชื่อ

  if (!isOpen || !course || !currentCls) return null;

  const isApproverManaged = course.selection_mode === 'approver';

  // helpers
  const empMap = Array.isArray(allEmployees)
    ? allEmployees.reduce((acc, e) => { acc[e.id] = e; return acc; }, {})
    : allEmployees;

  const getMembers = (classId) =>
    reservations
      .filter(r => r.class_id === classId && !r.is_deleted)
      .map(r => empMap[r.emp_id])
      .filter(Boolean);

  const currentMembers = getMembers(currentCls.id);
  const otherClasses = (course.classes || []).filter(c => c.id !== currentCls.id);

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4 bg-gray-900/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 flex justify-between items-start bg-blue-50/30">
            <div className="min-w-0 flex-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{course.title}</h3>
              <p className="text-sm font-medium text-blue-600 mt-1 truncate">{currentCls.name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full flex-shrink-0 ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="ปิด"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Body */}
          <div className="overflow-auto p-4 sm:p-6 flex-1 space-y-5">

            {/* วัตถุประสงค์ */}
            {course.description && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-xs font-bold text-yellow-800 mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  วัตถุประสงค์ในการอบรม
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{course.description}</p>
              </div>
            )}

            {/* Info: วันที่ / เวลา / สถานที่ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4 sm:p-5 border border-gray-100">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">วันที่อบรม</p>
                <p className="font-medium text-gray-900">
                  <FormattedDate dateStr={currentCls.date} />
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">เวลา</p>
                <p className="font-medium text-gray-900">{currentCls.start_time} - {currentCls.end_time}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">สถานที่</p>
                <p className="font-medium text-gray-900">{currentCls.location || '-'}</p>
                {currentCls.location_url && (
                  <a
                    href={normalizeUrl(currentCls.location_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-full min-h-[40px] shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
                    </svg>
                    ดูแผนที่
                  </a>
                )}
              </div>
              {currentCls.instructor && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">วิทยากร</p>
                  <p className="font-medium text-gray-900">{currentCls.instructor}</p>
                </div>
              )}
            </div>

            {/* Approver-managed notice */}
            {isApproverManaged && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div>
                  <p className="text-sm font-bold text-orange-800">หลักสูตรนี้ถูกกำหนดโดยผู้บังคับบัญชา</p>
                  <p className="text-xs text-orange-700 mt-1">คุณไม่สามารถเปลี่ยนคลาสหรือยกเลิกการลงทะเบียนได้ด้วยตัวเอง หากต้องการเปลี่ยนแปลง กรุณาติดต่อหัวหน้าของคุณ</p>
                </div>
              </div>
            )}

            {!isApproverManaged && !canModifyReservation && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                  <p className="text-sm font-bold text-gray-800">ปิดการเปลี่ยนแปลงรายการนี้แล้ว</p>
                  <p className="text-xs text-gray-600 mt-1">{modificationLockedMessage}</p>
                </div>
              </div>
            )}

            {/* รายชื่อเพื่อนร่วมคลาส */}
            <div>
              <h4 className="font-bold text-gray-900 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                รายชื่อผู้เข้าร่วม ({currentMembers.length} คน)
              </h4>
              {currentMembers.length === 0 ? (
                <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-lg text-center border border-gray-100">ยังไม่มีผู้เข้าร่วมในคลาสนี้</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {currentMembers.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm uppercase flex-shrink-0">
                        {(m.id || '').substring(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.id}</p>
                        <p className="text-xs text-gray-500 truncate">{m.division || 'ไม่ระบุ Division'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Change Class Section — ซ่อนถ้า approver mode */}
            {!isApproverManaged && otherClasses.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-900 mb-3 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                  ต้องการเปลี่ยนคลาสหรือไม่?
                </h4>
                <div className="space-y-3">
                  {otherClasses.map(cls => {
                    const members = getMembers(cls.id);
                    const booked = members.length;
                    const isFull = booked >= cls.max_seats;
                    const isPastClass = isClassFinished(cls);
                    return (
                      <div key={cls.id} className="p-4 rounded-xl border border-gray-200 bg-white hover:border-orange-300 transition-colors">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-gray-900">{cls.name}</p>
                            <p className="text-sm text-gray-600 mt-1">
                              <FormattedDate dateStr={cls.date} compact /> • {cls.start_time} - {cls.end_time}
                            </p>
                            {cls.location && <p className="text-xs text-gray-500 mt-1">📍 {cls.location}</p>}
                          </div>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-md flex-shrink-0 ${isFull ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {booked}/{cls.max_seats}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => setViewMembersFor(cls)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 min-h-[40px]"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            ดูรายชื่อ ({booked})
                          </button>
                          <button
                            onClick={() => onChangeClass && onChangeClass(cls)}
                            disabled={isFull || isPastClass || !canModifyReservation}
                            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-bold rounded-lg transition-colors shadow-sm min-h-[40px] ${
                              isFull || isPastClass || !canModifyReservation ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-orange-50 text-orange-700 hover:bg-orange-600 hover:text-white border border-orange-200 hover:border-orange-600'
                            }`}
                          >
                            {isPastClass ? 'สิ้นสุดแล้ว' : 'ย้าย'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-2 flex-wrap">
            {isApproverManaged ? (
              <span className="text-xs text-gray-400 italic">หัวหน้าเป็นผู้กำหนดคลาส</span>
            ) : (
              <button
                onClick={onCancel}
                disabled={!canModifyReservation}
                className={`font-medium text-sm transition-colors min-h-[40px] px-2 ${canModifyReservation ? 'text-red-600 hover:underline hover:text-red-800' : 'text-gray-400 cursor-not-allowed'}`}
              >
                ยกเลิกการลงทะเบียน
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 min-h-[40px]"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>

      {/* Nested modal: ดูรายชื่อของคลาสอื่น */}
      {viewMembersFor && (
        <ClassDetailModal
          cls={viewMembersFor}
          course={course}
          members={getMembers(viewMembersFor.id)}
          onClose={() => setViewMembersFor(null)}
        />
      )}
    </>
  );
}
