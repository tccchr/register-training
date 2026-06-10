import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import FormattedDate from '../components/FormattedDate';
import BrandLogo from '../components/BrandLogo';
import { EmptyState, NavTab, PageIntro } from '../components/LayoutPrimitives';
import { canManageCourse, getManageableParticipants } from '../utils/approvalScope';
import { normalizeUrl } from '../utils/url';
import MyReservationModal from '../components/MyReservationModal';
import { getClosingSortValue, isClassFinished, isCourseFinished } from '../utils/courseStatus';

// ─── Countdown Hook ───────────────────────────────────────────────────────────
function useCountdown(closingDate, closingTime) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!closingDate || !closingTime) return;
    const closing = new Date(`${closingDate}T${closingTime}`);
    const tick = () => {
      const diff = closing - new Date();
      if (diff <= 0) { setTimeLeft(null); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft({ d, h, m, s, diff });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closingDate, closingTime]);
  return timeLeft;
}

// ─── Countdown Bar ────────────────────────────────────────────────────────────
function CountdownBar({ closingDate, closingTime }) {
  const timeLeft = useCountdown(closingDate, closingTime);
  if (!timeLeft) return null;
  const { d, h, m, s, diff } = timeLeft;
  const isUrgent = diff < 86400000 * 2;
  const units = d > 0
    ? [{ v: d, l: 'วัน' }, { v: h, l: 'ชั่วโมง' }, { v: m, l: 'นาที' }, { v: s, l: 'วินาที' }]
    : [{ v: h, l: 'ชั่วโมง' }, { v: m, l: 'นาที' }, { v: s, l: 'วินาที' }];
  return (
    <div className={`px-5 py-3 border-t ${isUrgent ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
      <p className={`text-xs font-medium mb-2 ${isUrgent ? 'text-red-500' : 'text-gray-400'}`}>
        {isUrgent ? '⚠️ ใกล้ปิดรับสมัคร' : '⏱ เวลาที่เหลือ'}
      </p>
      <div className="flex items-center gap-2">
        {units.map(({ v, l }, i) => (
          <div key={l} className="flex items-center gap-2">
            <div className={`flex flex-col items-center px-2 py-1 rounded-lg min-w-[40px] ${isUrgent ? 'bg-red-100' : 'bg-white border border-gray-200'}`}>
              <span className={`text-lg font-bold tabular-nums leading-tight ${isUrgent ? 'text-red-600' : 'text-gray-800'}`}>
                {String(v).padStart(2, '0')}
              </span>
              <span className={`text-[9px] font-medium uppercase tracking-wide ${isUrgent ? 'text-red-400' : 'text-gray-400'}`}>
                {l}
              </span>
            </div>
            {i < units.length - 1 && (
              <span className={`text-sm font-bold mb-2 ${isUrgent ? 'text-red-300' : 'text-gray-300'}`}>:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Class Members Modal (Feature 1) ─────────────────────────────────────────
function ClassMembersModal({ cls, course, members, onClose }) {
  if (!cls) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-start bg-blue-50/30">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-gray-900 truncate">{cls.name}</h3>
            <p className="text-sm text-blue-600 mt-1">{course?.title}</p>
            <p className="text-sm text-gray-500 mt-2">
              <FormattedDate dateStr={cls.date} /> • {cls.start_time} - {cls.end_time}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full flex-shrink-0 ml-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-auto p-5 flex-1 space-y-5">
          {/* วัตถุประสงค์ */}
          {course?.description && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-xs font-bold text-yellow-800 mb-1">วัตถุประสงค์ในการอบรม</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{course.description}</p>
            </div>
          )}

          {/* สถานที่ + แผนที่ */}
          {cls.location && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">สถานที่อบรม</p>
              <p className="text-sm font-medium text-gray-900">{cls.location}</p>
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

          {/* รายชื่อสมาชิก */}
          <div>
            <p className="text-sm font-bold text-gray-900 mb-3">
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
                      <p className="text-sm font-medium text-gray-900 truncate">รหัส: {m.id}</p>
                      <p className="text-xs text-gray-500 truncate">{m.dept || m.division || '-'}</p>
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EmployeePortal() {
  const { employee, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [courses, setCourses] = useState([]);
  const [allCourses, setAllCourses] = useState([]); // เก็บทุก course สำหรับ approver
  const [allEmployees, setAllEmployees] = useState([]);
  const [allReservations, setAllReservations] = useState([]);
  const [bookedState, setBookedState] = useState({});
  const [seatCounts, setSeatCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const [selectedCourse, setSelectedCourse] = useState(null);
  const [viewMembersClass, setViewMembersClass] = useState(null);
  const [viewMembersInfo, setViewMembersInfo] = useState(null);
  const [myReservationFor, setMyReservationFor] = useState(null);   // course object ที่ user ลงทะเบียนไว้ — เปิด MyReservationModal
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

  const channelRef = useRef(null);

  const calcSeatCounts = (reservations, empId) => {
    const counts = {};
    const bookings = {};
    reservations.forEach(r => {
      if (!r.is_deleted) {
        counts[r.class_id] = (counts[r.class_id] || 0) + 1;
        if (r.emp_id === empId) bookings[r.course_id] = { classId: r.class_id, resId: r.id };
      }
    });
    return { counts, bookings };
  };

  useEffect(() => {
    if (!employee) return;
    const emp = employee;

    const loadData = async () => {
      try {
        const [
          { data: coursesData },
          { data: classesData },
          { data: reservationsData },
          { data: employeesData }
        ] = await Promise.all([
          supabase.from('courses').select('*').eq('is_deleted', false),
          supabase.from('classes').select('*').eq('is_deleted', false),
          supabase.from('reservations').select('*'),
          supabase.rpc('get_employees_list')   // ดึงผ่าน RPC — email ถูกปกปิดสำหรับ non-admin
        ]);

        const { counts, bookings } = calcSeatCounts(reservationsData || [], emp.id);
        setSeatCounts(counts);
        setBookedState(bookings);
        setAllEmployees(employeesData || []);
        setAllReservations((reservationsData || []).filter(r => !r.is_deleted));
        setAllCourses(coursesData || []);

        const available = [];
        (coursesData || []).forEach(c => {
          let canSee = false, isMandatory = false;
          if (c.mandatory_list?.includes(emp.id)) {
            canSee = true; isMandatory = true;
          } else if (c.allow_request && c.target_conditions) {
            const tc = c.target_conditions;
            const match =
              (!tc.site?.length || tc.site.includes(emp.site)) &&
              (!tc.division?.length || tc.division.includes(emp.division)) &&
              (!tc.dept?.length || tc.dept.includes(emp.dept)) &&
              (!tc.section?.length || tc.section.includes(emp.section)) &&
              (!tc.level?.length || tc.level.includes(emp.level));
            if (match) canSee = true;
          }
          if (canSee) {
            available.push({
              ...c,
              isMandatory,
              classes: (classesData || []).filter(cls => cls.course_id === c.id)
            });
          }
        });
        setCourses(available);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    // ปิด channel เก่าก่อนเสมอ กัน subscription ซ้อนกันเวลาสลับหน้าบ่อยๆ
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // ตั้งชื่อ channel ให้ไม่ซ้ำกัน (ผูกกับ employee.id) — กัน channel ชนกัน
    const channel = supabase
      .channel(`reservations-realtime-${employee.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' },
        async () => {
          const { data } = await supabase.from('reservations').select('*');
          if (data) {
            const { counts, bookings } = calcSeatCounts(data, employee.id);
            setSeatCounts(counts);
            setBookedState(bookings);
            setAllReservations(data.filter(r => !r.is_deleted));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [employee]);

  const isCourseClosed = (course) => {
    if (!course.closing_date || !course.closing_time) return false;
    return new Date() > new Date(`${course.closing_date}T${course.closing_time}`);
  };

  const isReservationLocked = (course, cls) => {
    return isCourseClosed(course) || isClassFinished(cls);
  };

  const lockedReason = (course, cls) => {
    if (isClassFinished(cls)) return 'คลาสนี้สิ้นสุดการอบรมแล้ว จึงไม่สามารถเปลี่ยนหรือยกเลิกได้';
    if (isCourseClosed(course)) return 'หลักสูตรนี้ปิดรับสมัครแล้ว จึงไม่สามารถเปลี่ยนหรือยกเลิกได้';
    return 'ไม่สามารถเปลี่ยนคลาสหรือยกเลิกการลงทะเบียนได้แล้ว';
  };

  // ─── Badge: unselected courses (Feature 6) ─────────────────
  const unselectedCount = useMemo(() => {
    return courses.filter(c => !bookedState[c.id] && !isCourseClosed(c) && !isCourseFinished(c) && c.selection_mode !== 'approver').length;
  }, [courses, bookedState]);

  // ─── Badge: pending subordinates (สำหรับหัวหน้า) ────────────
  const pendingApprovalCount = useMemo(() => {
    if (!employee) return 0;
    let total = 0;
    allCourses.forEach(c => {
      if (canManageCourse(employee, c, false)) {
        const subs = getManageableParticipants(employee, allEmployees, c, false);
        subs.forEach(sub => {
          const hasRes = allReservations.some(r => r.emp_id === sub.id && r.course_id === c.id);
          if (!hasRes) total++;
        });
      }
    });
    return total;
  }, [employee, allCourses, allEmployees, allReservations]);

  const isApprover = useMemo(() => {
    if (!employee) return false;
    return allCourses.some(c => canManageCourse(employee, c, false));
  }, [employee, allCourses]);

  const orderedCourses = [...courses]
    .filter(course => !isCourseFinished(course))
    .sort((a, b) => getClosingSortValue(a) - getClosingSortValue(b));
  const bookedCourses = orderedCourses.filter(course => bookedState[course.id]);
  const unbookedCourses = orderedCourses.filter(course => !bookedState[course.id] && !isCourseClosed(course));
  const courseSections = [
    { key: 'booked', title: 'ลงทะเบียนแล้ว', courses: bookedCourses },
    { key: 'unbooked', title: 'ยังไม่ได้ลงทะเบียน', courses: unbookedCourses }
  ];
  const visibleCourseCount = bookedCourses.length + unbookedCourses.length;

  const handleLogout = async () => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    await signOut();
    navigate('/login');
  };

  const handleBook = (course, cls) => {
    if (isCourseClosed(course)) {
      alert('หลักสูตรนี้ปิดรับสมัครแล้ว');
      return;
    }
    if (isClassFinished(cls)) {
      alert('คลาสนี้สิ้นสุดการอบรมแล้ว');
      return;
    }

    setSelectedCourse(null);
    setConfirmConfig({
      isOpen: true,
      type: 'info',
      title: 'ยืนยันการลงทะเบียน',
      message: `คุณต้องการลงทะเบียนคลาส "${cls.name}"\nหลักสูตร: ${course.title}\nวันที่: ${cls.date} ${cls.start_time}\nสถานที่: ${cls.location}\nใช่หรือไม่?`,
      confirmText: 'ลงทะเบียน',
      onConfirm: async () => {
        setConfirmConfig({ isOpen: false });
        const { data, error } = await supabase.rpc('book_class', {
          p_emp_id: employee.id,
          p_course_id: course.id,
          p_class_id: cls.id,
          p_in_plan: course.isMandatory
        });

        if (error) { alert('เกิดข้อผิดพลาดในการจอง'); console.error(error); return; }
        if (!data.ok) {
          if (data.error === 'FULL') alert('ขออภัย ที่นั่งในคลาสนี้เพิ่งถูกจองเต็มแล้ว');
          else if (data.error === 'ALREADY_BOOKED') alert('คุณได้ลงทะเบียนหลักสูตรนี้ไปแล้ว');
          else if (data.error === 'COURSE_CLOSED') alert('หลักสูตรนี้ปิดรับสมัครแล้ว');
          else if (data.error === 'NOT_AUTHENTICATED') alert('กรุณาเข้าสู่ระบบใหม่');
          else alert(`ไม่สามารถจองได้: ${data.error}`);
          return;
        }
        alert('✓ ลงทะเบียนสำเร็จ');
      },
      onCancel: () => { setConfirmConfig({ isOpen: false }); setSelectedCourse(course); }
    });
  };

  const handleCancelBook = (courseId) => {
    const booking = bookedState[courseId];
    const resId = booking ? booking.resId : `${courseId}_${employee.id}`;
    const course = courses.find(c => c.id === courseId);
    const currentCls = course?.classes?.find(c => c.id === booking?.classId);

    if (course && currentCls && isReservationLocked(course, currentCls)) {
      alert(lockedReason(course, currentCls));
      return;
    }

    setConfirmConfig({
      isOpen: true,
      type: 'danger',
      title: 'ยกเลิกการลงทะเบียน',
      message: 'คุณต้องการยกเลิกการลงทะเบียนหลักสูตรนี้ใช่หรือไม่?',
      confirmText: 'ยกเลิกการจอง',
      onConfirm: async () => {
        setConfirmConfig({ isOpen: false });
        const { data, error } = await supabase.rpc('cancel_reservation', {
          p_res_id: resId, p_emp_id: employee.id
        });
        if (error) { alert('เกิดข้อผิดพลาดในการยกเลิก'); console.error(error); return; }
        if (!data?.ok) {
          alert('ยกเลิกไม่สำเร็จ: ' + (data?.error || 'unknown'));
          return;
        }
        alert('ยกเลิกการลงทะเบียนเรียบร้อยแล้ว');
      },
      onCancel: () => setConfirmConfig({ isOpen: false })
    });
  };

  // ─── เปลี่ยนคลาสจาก MyReservationModal ─────────────────────
  const handleChangeClassInternal = (course, oldClassId, newCls) => {
    const currentCls = course.classes.find(c => c.id === oldClassId);
    if (currentCls && isReservationLocked(course, currentCls)) {
      alert(lockedReason(course, currentCls));
      return;
    }
    if (isClassFinished(newCls)) {
      alert('คลาสที่เลือกสิ้นสุดการอบรมแล้ว');
      return;
    }

    if (newCls.id === oldClassId) return;
    const seats = seatCounts[newCls.id] || 0;
    if (seats >= newCls.max_seats) {
      alert('คลาสนี้เต็มแล้ว');
      return;
    }

    setConfirmConfig({
      isOpen: true,
      type: 'warning',
      title: 'ยืนยันการเปลี่ยนคลาส',
      message: `คุณต้องการย้ายไปคลาส "${newCls.name}" วันที่ ${newCls.date} เวลา ${newCls.start_time} ใช่หรือไม่?`,
      confirmText: 'ยืนยันการเปลี่ยน',
      onConfirm: async () => {
        setConfirmConfig({ isOpen: false });
        const booking = bookedState[course.id];
        const oldResId = booking?.resId;

        // 1. cancel เก่า
        const { data: cancelRes } = await supabase.rpc('cancel_reservation', {
          p_res_id: oldResId, p_emp_id: employee.id
        });
        if (cancelRes && !cancelRes.ok) {
          alert('ยกเลิกการจองเดิมไม่สำเร็จ: ' + cancelRes.error);
          return;
        }

        // 2. book ใหม่
        const { data: bookRes } = await supabase.rpc('book_class', {
          p_emp_id: employee.id,
          p_course_id: course.id,
          p_class_id: newCls.id,
          p_in_plan: course.isMandatory
        });
        if (bookRes && !bookRes.ok) {
          const errMap = { FULL: 'ที่นั่งเต็มแล้ว', ALREADY_BOOKED: 'คุณลงทะเบียนรุ่นนี้แล้ว', COURSE_CLOSED: 'หลักสูตรปิดรับสมัครแล้ว' };
          alert('เปลี่ยนรุ่นไม่สำเร็จ: ' + (errMap[bookRes.error] || bookRes.error));
          return;
        }

        setMyReservationFor(null);
        alert('✓ เปลี่ยนคลาสเรียบร้อยแล้ว');
      },
      onCancel: () => setConfirmConfig({ isOpen: false })
    });
  };

  const getClassMembers = (classId) => {
    const empMap = {};
    allEmployees.forEach(e => { empMap[e.id] = e; });
    return allReservations
      .filter(r => r.class_id === classId)
      .map(r => empMap[r.emp_id])
      .filter(Boolean);
  };

  if (!employee) return null;

  return (
    <div className="min-h-screen bg-transparent pb-12 relative">
      <header className="app-header bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-3 sm:px-4">
          <div className="flex justify-between items-center py-3 sm:py-4 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <BrandLogo className="h-9 sm:h-10 w-auto flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="font-display text-base sm:text-xl font-bold text-gray-900 truncate">ระบบจองคลาสเรียน</h1>
                <p className="text-xs sm:text-sm font-medium text-blue-600 truncate">รหัสพนักงาน: {employee.id}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="text-xs sm:text-sm font-medium text-gray-500 hover:text-gray-900 flex-shrink-0 min-h-[44px] px-2">ออกจากระบบ</button>
          </div>
          <div className="mobile-tab-rail flex overflow-x-auto -mb-px">
            <NavTab to="/portal" current={location.pathname} label="หลักสูตรของฉัน" badge={unselectedCount} />
            <NavTab to="/calendar" current={location.pathname} label="ปฏิทินอบรม" />
            {isApprover && <NavTab to="/approve" current={location.pathname} label="จัดการพนักงานในสายงาน" badge={pendingApprovalCount} />}
            {isAdmin && <NavTab to="/admin/manage-classes" current={location.pathname} label="จัดคลาสให้พนักงาน (Admin)" />}
            {isAdmin && <NavTab to="/admin" current={location.pathname} label="จัดการระบบ (Admin)" />}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 mt-8 sm:mt-10">
        <PageIntro
          className="mb-7 sm:mb-9"
          eyebrow="Training Portal"
          title="รายการฝึกอบรมของคุณ"
          description="เลือกหลักสูตรที่ต้องเข้าอบรม ดูคลาสที่หัวหน้ากำหนดให้ หรือจัดการคลาสที่คุณลงทะเบียนไว้"
        />
        {loading ? (
          <div className="loading-state text-center py-12 text-gray-500">กำลังโหลดหลักสูตรของคุณ...</div>
        ) : courses.length === 0 ? (
          <EmptyState message="ไม่มีหลักสูตรที่เปิดให้คุณลงทะเบียนในขณะนี้" />
        ) : visibleCourseCount === 0 ? (
          <EmptyState message="ไม่มีหลักสูตรที่เปิดให้คุณจัดการในขณะนี้" />
        ) : (
          <div className="space-y-10 sm:space-y-12">
            {courseSections.filter(section => section.courses.length > 0).map(section => (
              <section key={section.key} className="space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{section.title}</h3>
                    <p className="mt-1 text-sm text-gray-500">หลักสูตรในกลุ่มนี้เรียงตามสถานะที่ควรจัดการก่อน</p>
                  </div>
                  <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
                    {section.courses.length} หลักสูตร
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 auto-rows-fr">
            {section.courses.map((course, courseIndex) => {
              const bookedClassData = bookedState[course.id];
              const isBooked = !!bookedClassData;
              const isApproverMode = course.selection_mode === 'approver';
              const isFeatureCard = courseIndex === 0 && section.courses.length > 1;
              return (
                <div
                  key={course.id}
                  className={`app-card surface-hover rounded-2xl overflow-hidden flex flex-col transition-all duration-200 ${
                    isFeatureCard ? 'md:col-span-2 lg:col-span-2' : ''
                  } ${
                    isBooked ? 'border-green-300 ring-1 ring-green-300'
                    : isCourseClosed(course) ? 'border-gray-200 opacity-75'
                    : isApproverMode ? 'border-orange-200'
                    : 'border-gray-200 hover:border-blue-400 hover:shadow-md'
                  }`}
                >
                  <div className={`${isFeatureCard ? 'p-5 sm:p-6' : 'p-5'} flex-1 ${isBooked ? 'bg-green-50/30' : ''}`}>
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <div className="flex flex-wrap gap-1">
                        {course.isMandatory
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-100">หลักสูตรบังคับ</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">สามารถขอเข้าร่วมได้</span>
                        }
                        {isApproverMode && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700 border border-orange-100">หัวหน้าเลือกคลาส</span>
                        )}
                      </div>
                      {isBooked && (
                        <span className="inline-flex items-center text-green-600 bg-green-100 p-1 rounded-full flex-shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </span>
                      )}
                    </div>
                    <h3 className={`${isFeatureCard ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'} font-bold mb-2 text-gray-900`}>{course.title}</h3>
                    <p className={`text-sm text-gray-500 ${isFeatureCard ? 'line-clamp-3 max-w-3xl' : 'line-clamp-2'}`}>{course.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>

                    {/* แสดงคลาสที่หัวหน้าเลือกให้ */}
                    {isApproverMode && isBooked && (() => {
                      const myCls = course.classes.find(c => c.id === bookedClassData.classId);
                      if (!myCls) return null;
                      return (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setViewMembersInfo({ cls: myCls, course }); }}
                          className="mt-3 w-full text-left p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 hover:border-orange-300 transition-colors group cursor-pointer"
                        >
                          <p className="text-xs text-orange-700 font-medium mb-1">หัวหน้ากำหนดให้คุณเข้า:</p>
                          <p className="text-sm font-bold text-gray-900">{myCls.name}</p>
                          <p className="text-xs text-gray-600">
                            <FormattedDate dateStr={myCls.date} compact /> • {myCls.start_time} - {myCls.end_time}
                          </p>
                          <p className="text-[10px] text-orange-600 font-medium mt-2 flex items-center gap-1 group-hover:underline">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            ดูรายละเอียดคลาส
                          </p>
                        </button>
                      );
                    })()}

                    {/* รอหัวหน้าระบุคลาส */}
                    {isApproverMode && !isBooked && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm font-medium text-yellow-800 flex items-center">
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          รอผู้บังคับบัญชาระบุคลาส
                        </p>
                      </div>
                    )}
                  </div>

                  {isBooked && !isApproverMode ? (() => {
                    const myCls = course.classes.find(c => c.id === bookedClassData.classId);
                    const isLocked = myCls && isReservationLocked(course, myCls);
                    return (
                      <div className="border-t border-green-100">
                        {/* คลาสปัจจุบัน — กดเพื่อเปิด MyReservationModal */}
                        {myCls && (
                          <button
                            type="button"
                            onClick={() => setMyReservationFor(course)}
                            className="w-full text-left p-4 bg-green-50/70 hover:bg-green-100 transition-colors"
                          >
                            <p className="text-xs text-green-700 font-medium mb-1">คุณลงทะเบียนคลาส:</p>
                            <p className="text-sm font-bold text-gray-900">{myCls.name}</p>
                            <p className="text-xs text-gray-600">
                              <FormattedDate dateStr={myCls.date} compact /> • {myCls.start_time} - {myCls.end_time}
                            </p>
                            <p className="text-[10px] text-green-600 font-medium mt-2 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              ดูรายละเอียดคลาส
                            </p>
                          </button>
                        )}
                        {/* ปุ่มเปลี่ยนคลาส / ยกเลิก */}
                        <div className="px-5 py-3 bg-green-50 flex gap-3 items-center justify-between text-sm border-t border-green-100">
                          <button
                            onClick={() => setMyReservationFor(course)}
                            disabled={course.classes.length <= 1 || isLocked}
                            className={`font-medium ${course.classes.length <= 1 || isLocked ? 'text-gray-400 cursor-not-allowed' : 'text-orange-600 hover:text-orange-800 hover:underline'}`}
                          >
                            🔄 เปลี่ยนคลาส
                          </button>
                          <button
                            onClick={() => handleCancelBook(course.id)}
                            disabled={isLocked}
                            className={`font-medium ${isLocked ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:text-red-800 hover:underline'}`}
                          >
                            ยกเลิกการจอง
                          </button>
                        </div>
                      </div>
                    );
                  })() : isCourseClosed(course) ? (
                    <div className="px-5 py-3 border-t border-red-100 bg-red-50 flex justify-between items-center text-sm text-red-600">
                      <span className="font-medium">ปิดรับสมัครแล้ว</span>
                      <span className="text-red-500 text-xs">({course.closing_date} {course.closing_time})</span>
                    </div>
                  ) : isApproverMode ? (
                    <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-center text-gray-500">
                      หัวหน้าระดับ {course.approver_level || '-'} เป็นผู้เลือกคลาสให้
                    </div>
                  ) : (
                    <div className="border-t border-gray-100">
                      <CountdownBar closingDate={course.closing_date} closingTime={course.closing_time} />
                      <button
                        onClick={() => setSelectedCourse(course)}
                        className="w-full px-5 py-3 bg-gray-50 hover:bg-blue-50 flex justify-between items-center text-sm text-gray-600 transition-colors min-h-[48px]"
                      >
                        <span>มีให้เลือก {course.classes.length} รุ่น</span>
                        <span className="text-blue-600 font-medium flex items-center">เลือกคลาส
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Select Class Modal */}
      {selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 truncate">เลือกรุ่นที่ต้องการอบรม</h3>
                <p className="text-sm text-gray-500 mt-1 truncate">{selectedCourse.title}</p>
              </div>
              <button onClick={() => setSelectedCourse(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full flex-shrink-0 ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-auto p-3 sm:p-6 bg-gray-50 flex-1">
              {/* วัตถุประสงค์ในการอบรม */}
              {selectedCourse.description && (
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <p className="text-xs font-bold text-yellow-800 mb-2 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                    วัตถุประสงค์ในการอบรม
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{selectedCourse.description}</p>
                </div>
              )}

              {selectedCourse.classes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">แอดมินยังไม่ได้กำหนดรุ่นสำหรับหลักสูตรนี้</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  {selectedCourse.classes.map(cls => {
                    const bookedSeats = seatCounts[cls.id] || 0;
                    const isFull = bookedSeats >= cls.max_seats;
                    const seatsLeft = cls.max_seats - bookedSeats;
                    const isPastClass = isClassFinished(cls);
                    const isRegistrationClosed = isCourseClosed(selectedCourse);
                    const cannotBook = isFull || isPastClass || isRegistrationClosed;
                    return (
                      <div key={cls.id} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 flex flex-col shadow-sm">
                        <div className="flex justify-between items-start mb-3 gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-gray-900 text-base sm:text-lg">{cls.name}</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              <FormattedDate dateStr={cls.date} />
                            </p>
                          </div>
                          {isFull
                            ? <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex-shrink-0">เต็ม</span>
                            : seatsLeft <= 3
                              ? <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 flex-shrink-0">เหลือ {seatsLeft} ที่</span>
                              : <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex-shrink-0">ว่าง {seatsLeft} ที่</span>
                          }
                        </div>
                        <div className="space-y-2 mb-4">
                          <p className="text-gray-600 text-sm flex items-center">
                            <svg className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {cls.start_time} - {cls.end_time}
                          </p>
                          <p className="text-gray-600 text-sm flex items-start">
                            <svg className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            <span className="min-w-0 break-words">{cls.location || '-'}</span>
                          </p>
                          {cls.location_url && (
                            <a
                              href={normalizeUrl(cls.location_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-full ml-6 shadow-sm"
                            >
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
                              </svg>
                              ดูแผนที่
                            </a>
                          )}
                        </div>

                        {/* ปุ่ม View Members */}
                        <button
                          onClick={() => setViewMembersClass(cls)}
                          className="flex items-center justify-center gap-1.5 py-2 mb-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors min-h-[40px]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          ดูรายชื่อ ({bookedSeats})
                        </button>

                        <button
                          onClick={() => handleBook(selectedCourse, cls)}
                          disabled={cannotBook}
                          className={`mt-auto w-full py-2.5 rounded-lg font-medium transition-colors min-h-[44px] ${cannotBook ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 active:bg-blue-800'}`}
                        >
                          {isFull ? 'ไม่สามารถจองได้' : isRegistrationClosed ? 'ปิดรับสมัครแล้ว' : isPastClass ? 'สิ้นสุดอบรมแล้ว' : 'ยืนยันลงทะเบียนรุ่นนี้'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Class Members Modal — แบบเรียกจาก select modal */}
      {viewMembersClass && (
        <ClassMembersModal
          cls={viewMembersClass}
          course={selectedCourse}
          members={getClassMembers(viewMembersClass.id)}
          onClose={() => setViewMembersClass(null)}
        />
      )}

      {/* Class Members Modal — แบบเรียก direct (กดจากการ์ดหลักสูตร เช่น approver mode) */}
      {viewMembersInfo && (
        <ClassMembersModal
          cls={viewMembersInfo.cls}
          course={viewMembersInfo.course}
          members={getClassMembers(viewMembersInfo.cls.id)}
          onClose={() => setViewMembersInfo(null)}
        />
      )}

      {/* My Reservation Modal — รวมรายละเอียด / เปลี่ยนคลาส / ยกเลิก */}
      {myReservationFor && (() => {
        const booking = bookedState[myReservationFor.id];
        const currentCls = booking ? myReservationFor.classes.find(c => c.id === booking.classId) : null;
        if (!currentCls) return null;
        return (
          <MyReservationModal
            isOpen={true}
            course={myReservationFor}
            currentCls={currentCls}
            reservations={allReservations}
            allEmployees={allEmployees}
            onChangeClass={(newCls) => handleChangeClassInternal(myReservationFor, currentCls.id, newCls)}
            onCancel={() => handleCancelBook(myReservationFor.id)}
            onClose={() => setMyReservationFor(null)}
            canModifyReservation={!isReservationLocked(myReservationFor, currentCls)}
            modificationLockedMessage={lockedReason(myReservationFor, currentCls)}
          />
        );
      })()}

      <ConfirmModal {...confirmConfig} />
    </div>
  );
}
