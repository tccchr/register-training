import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';
import ClassDetailModal from '../components/ClassDetailModal';
import { ActionSummary, EmptyState, NavTab } from '../components/LayoutPrimitives';
import { isClassFinished } from '../utils/courseStatus';

export default function AdminCalendar() {
  const { employee, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState({});
  const [reservations, setReservations] = useState([]);
  const [employees, setEmployees] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [summaryFilter, setSummaryFilter] = useState('wait');
  const [selectedClass, setSelectedClass] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadCalendar = async () => {
      setLoading(true);
      try {
        const [
          { data: coursesData },
          { data: classesData },
          { data: reservationsData },
          { data: employeesData }
        ] = await Promise.all([
          supabase.from('courses').select('*').eq('is_deleted', false),
          supabase.from('classes').select('*').eq('is_deleted', false).order('date'),
          supabase.from('reservations').select('*').eq('is_deleted', false),
          supabase.rpc('get_employees_list')
        ]);

        if (cancelled) return;

        const courseMap = {};
        (coursesData || []).forEach(course => { courseMap[course.id] = course; });

        const employeeMap = {};
        (employeesData || []).forEach(emp => { employeeMap[emp.id] = emp; });

        setCourses(courseMap);
        setEmployees(employeeMap);
        setReservations(reservationsData || []);
        setClasses((classesData || [])
          .filter(cls => courseMap[cls.course_id])
          .map(cls => ({
            ...cls,
            courseTitle: courseMap[cls.course_id]?.title || '-',
            isFinished: isClassFinished(cls)
          }))
          .sort((a, b) => new Date(`${a.date || '9999-12-31'}T${a.start_time || '00:00'}`) - new Date(`${b.date || '9999-12-31'}T${b.start_time || '00:00'}`)));
      } catch (err) {
        console.error('AdminCalendar load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCalendar();
    return () => { cancelled = true; };
  }, []);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const todayKey = new Date().toDateString();

  const seatCounts = {};
  reservations.forEach(res => {
    seatCounts[res.class_id] = (seatCounts[res.class_id] || 0) + 1;
  });

  const classesByDate = {};
  classes.forEach(cls => {
    if (!cls.date) return;
    const dateObj = new Date(cls.date);
    if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month) return;
    const day = dateObj.getDate();
    if (!classesByDate[day]) classesByDate[day] = [];
    classesByDate[day].push(cls);
  });

  const waitingClasses = classes.filter(cls => !cls.isFinished);
  const finishedClasses = classes.filter(cls => cls.isFinished);
  const summaryItems = summaryFilter === 'finish' ? finishedClasses : waitingClasses;

  const getMembers = (classId) => reservations
    .filter(res => res.class_id === classId)
    .map(res => employees[res.emp_id] || { id: res.emp_id, division: '-' });

  const openClass = (cls) => {
    setSelectedClass({
      cls,
      course: courses[cls.course_id],
      members: getMembers(cls.id)
    });
  };

  if (!employee) return null;

  return (
    <div className="min-h-screen bg-transparent pb-12 relative">
      <header className="app-header bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          <div className="flex justify-between items-center py-3 sm:py-4 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <BrandLogo className="h-9 sm:h-10 w-auto flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="font-display text-base sm:text-xl font-bold text-gray-900 truncate">Admin Class Calendar</h1>
                <p className="text-xs sm:text-sm font-medium text-blue-600 truncate">เห็นทุกคลาสอบรมในระบบ</p>
              </div>
            </div>
            <button
              onClick={async () => { await signOut(); navigate('/login'); }}
              className="text-xs sm:text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors flex-shrink-0 min-h-[44px] px-2"
            >
              ออกจากระบบ
            </button>
          </div>
          <div className="mobile-tab-rail flex overflow-x-auto -mb-px">
            <NavTab to="/portal" current={location.pathname} label="หลักสูตรของฉัน" />
            <NavTab to="/calendar" current={location.pathname} label="ปฏิทินอบรม" />
            <NavTab to="/admin/calendar" current={location.pathname} label="ปฏิทินคลาสทั้งหมด (Admin)" />
            <NavTab to="/admin/manage-classes" current={location.pathname} label="จัดคลาสให้พนักงาน (Admin)" />
            <NavTab to="/admin" current={location.pathname} label="จัดการระบบ (Admin)" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 mt-6 sm:mt-8 space-y-6">
        {loading ? (
          <div className="loading-state text-center py-12 text-gray-500">กำลังโหลดปฏิทินคลาสทั้งหมด...</div>
        ) : classes.length === 0 ? (
          <EmptyState message="ยังไม่มีคลาสอบรมในระบบ" />
        ) : (
          <>
            <ActionSummary
              eyebrow="Admin calendar"
              title="ภาพรวมคลาสอบรมทั้งหมด"
              description="สีฟ้าคือคลาสที่ยังไม่เกิดขึ้น สีเทาคือคลาสที่อบรมไปแล้ว กดที่รายการในปฏิทินเพื่อดูรายละเอียดและรายชื่อผู้เข้าร่วม"
              items={[
                { label: 'คลาสทั้งหมด', value: classes.length, tone: 'blue', hint: 'ทุกหลักสูตรในระบบ' },
                { label: 'รออบรม', value: waitingClasses.length, tone: waitingClasses.length > 0 ? 'amber' : 'green', hint: 'ยังไม่ถึงเวลาสิ้นสุดคลาส' },
                { label: 'อบรมแล้ว', value: finishedClasses.length, tone: 'gray', hint: 'สิ้นสุดตามวันและเวลา' },
                { label: 'การลงทะเบียน', value: reservations.length, tone: 'green', hint: 'รายการจองทั้งหมด' }
              ]}
            />

            <div className="app-card rounded-2xl overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3 bg-gray-50/50">
                <h2 className="font-display text-lg sm:text-2xl font-bold text-gray-900">
                  ตารางคลาส เดือน {monthNames[month]} {year}
                </h2>
                <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                  <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-2 hover:bg-gray-100 rounded text-gray-600 transition-colors" aria-label="เดือนก่อนหน้า">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="font-medium px-4 text-gray-700 select-none min-w-[140px] text-center">
                    {monthNames[month]} {year}
                  </span>
                  <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-2 hover:bg-gray-100 rounded text-gray-600 transition-colors" aria-label="เดือนถัดไป">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap gap-3 text-xs font-medium">
                  <span className="inline-flex items-center gap-1.5 text-blue-700"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> รออบรม</span>
                  <span className="inline-flex items-center gap-1.5 text-gray-600"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> อบรมแล้ว</span>
                </div>
                <div className="grid grid-cols-7 mb-2">
                  {dayNames.map((day, idx) => (
                    <div key={idx} className={`text-center font-bold text-sm py-2 ${idx === 0 || idx === 6 ? 'text-orange-500' : 'text-gray-500'}`}>
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-gray-50/50 min-h-[92px] sm:min-h-[136px] p-1 sm:p-2" />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dayClasses = classesByDate[day] || [];
                    const isToday = todayKey === new Date(year, month, day).toDateString();

                    return (
                      <div key={day} className={`bg-white min-h-[92px] sm:min-h-[136px] p-1 sm:p-2 flex flex-col transition-colors hover:bg-blue-50/30 ${isToday ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/10' : ''}`}>
                        <div className={`text-right text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                          {isToday ? <span className="bg-blue-600 text-white rounded-full w-6 h-6 inline-flex items-center justify-center">{day}</span> : day}
                        </div>
                        <div className="flex-1 space-y-1 overflow-y-auto max-h-[72px] sm:max-h-[112px]">
                          {dayClasses.map(cls => {
                            const current = seatCounts[cls.id] || 0;
                            return (
                              <button
                                key={cls.id}
                                type="button"
                                onClick={() => openClass(cls)}
                                className={`w-full text-left text-[10px] sm:text-xs p-1 sm:p-1.5 rounded truncate shadow-sm transition-colors border ${
                                  cls.isFinished
                                    ? 'bg-white hover:bg-gray-50 text-gray-500 border-gray-200 opacity-70'
                                    : 'bg-blue-100 hover:bg-blue-200 text-blue-800 border-blue-200'
                                }`}
                                title={`${cls.courseTitle} ${cls.start_time || ''}`}
                              >
                                <div className="font-bold truncate">{cls.courseTitle}</div>
                                <div className={cls.isFinished ? 'text-gray-400' : 'text-blue-600'}>
                                  {cls.start_time || '--:--'} • {current}/{cls.max_seats || 0}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {Array.from({ length: (42 - (firstDay + daysInMonth)) % 7 }).map((_, i) => (
                    <div key={`empty-end-${i}`} className="bg-gray-50/50 min-h-[92px] sm:min-h-[136px] p-1 sm:p-2" />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-bold text-gray-900">สรุปรายการคลาส</h3>
                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSummaryFilter('wait')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${summaryFilter === 'wait' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    รออบรม ({waitingClasses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSummaryFilter('finish')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${summaryFilter === 'finish' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    อบรมแล้ว ({finishedClasses.length})
                  </button>
                </div>
              </div>
              {summaryItems.length === 0 ? (
                <EmptyState message={summaryFilter === 'finish' ? 'ยังไม่มีคลาสที่อบรมแล้ว' : 'ไม่มีคลาสที่รออบรม'} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {summaryItems.map(cls => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => openClass(cls)}
                      className={`app-card surface-hover rounded-2xl p-4 text-left ${
                        cls.isFinished ? 'opacity-75 grayscale-[0.2]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{cls.courseTitle}</p>
                          <p className="text-xs text-gray-500 mt-1">{cls.name}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${cls.isFinished ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-700'}`}>
                          {cls.isFinished ? 'อบรมแล้ว' : 'รออบรม'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
                        <span>{cls.date || '-'} • {cls.start_time || '--:--'} - {cls.end_time || '--:--'}</span>
                        <span>{seatCounts[cls.id] || 0}/{cls.max_seats || 0} คน</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {selectedClass && (
        <ClassDetailModal
          cls={selectedClass.cls}
          course={selectedClass.course}
          members={selectedClass.members}
          onClose={() => setSelectedClass(null)}
        />
      )}
    </div>
  );
}
