import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import ClassDetailModal from '../components/ClassDetailModal';
import MyReservationModal from '../components/MyReservationModal';
import BrandLogo from '../components/BrandLogo';
import { NavTab } from '../components/LayoutPrimitives';
import { canManageCourse, getManageableParticipants } from '../utils/approvalScope';
import { isClassFinished } from '../utils/courseStatus';

export default function UserCalendar() {
  const { employee, isAdmin, signOut } = useAuth();
  const [bookedClasses, setBookedClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Modals
  const [selectedClassDetails, setSelectedClassDetails] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });
  const [viewClassMembers, setViewClassMembers] = useState(null);  // { cls, course, members }

  // Raw data for fast lookups
  const [rawCourses, setRawCourses] = useState({});
  const [rawClasses, setRawClasses] = useState({});
  const [rawSeatCounts, setRawSeatCounts] = useState({});
  const [rawReservations, setRawReservations] = useState([]);
  const [allEmployees, setAllEmployees] = useState({});
  const [allEmployeesList, setAllEmployeesList] = useState([]);
  const [summaryFilter, setSummaryFilter] = useState('wait');

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const fetchCalendar = async (emp) => {
    setLoading(true);
    try {
      const [
        { data: coursesData },
        { data: classesData },
        { data: reservationsData },
        { data: employeesData }
      ] = await Promise.all([
        supabase.from('courses').select('*').eq('is_deleted', false),
        supabase.from('classes').select('*').eq('is_deleted', false),
        supabase.from('reservations').select('*').eq('is_deleted', false),
        supabase.rpc('get_employees_list')
      ]);

      // Build lookup maps
      const courses = {};
      (coursesData || []).forEach(c => { courses[c.id] = c; });

      const classes = {};
      (classesData || []).forEach(c => { classes[c.id] = c; });

      const emps = {};
      (employeesData || []).forEach(e => { emps[e.id] = e; });
      setAllEmployeesList(employeesData || []);

      const allRes = reservationsData || [];

      const seatCounts = {};
      allRes.forEach(r => {
        seatCounts[r.class_id] = (seatCounts[r.class_id] || 0) + 1;
      });

      setRawCourses(courses);
      setRawClasses(classes);
      setRawSeatCounts(seatCounts);
      setRawReservations(allRes);
      setAllEmployees(emps);

      // Filter My Calendar
      const mNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

      const myCalendar = [];
      allRes.forEach(r => {
        if (r.emp_id === emp.id) {
          const crs = courses[r.course_id];
          const cls = classes[r.class_id];
          if (crs && cls) {
            let dNum = '??', dMonth = '???';
            if (cls.date) {
              const parts = cls.date.split('-');
              if (parts.length === 3) {
                dNum = parts[2];
                dMonth = mNames[parseInt(parts[1]) - 1] || parts[1];
              }
            }
            myCalendar.push({
              resId: r.id,
              courseId: r.course_id,
              classId: r.class_id,
              courseTitle: crs.title,
              className: cls.name,
              date: dNum,
              month: dMonth,
              fullDate: cls.date,
              time: `${cls.start_time} - ${cls.end_time}`,
              location: cls.location,
              location_url: cls.location_url || '',
              in_plan: r.in_plan,
              isFinished: isClassFinished(cls)
            });
          }
        }
      });

      myCalendar.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
      setBookedClasses(myCalendar);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employee) fetchCalendar(employee);
  }, [employee]);

  const handleOpenDetails = (item) => {
    const courseInfo = rawCourses[item.courseId];
    const currentCls = rawClasses[item.classId];
    if (!courseInfo || !currentCls) return;

    // ประกอบ course object ที่มี classes attached (ตามที่ MyReservationModal ต้องการ)
    const courseWithClasses = {
      ...courseInfo,
      classes: Object.values(rawClasses).filter(c => c.course_id === item.courseId)
    };

    setSelectedClassDetails({
      resId: item.resId,
      courseId: item.courseId,
      classId: item.classId,
      className: currentCls.name,
      courseTitle: courseInfo.title,
      fullDate: currentCls.date,
      time: `${currentCls.start_time} - ${currentCls.end_time}`,
      location: currentCls.location,
      location_url: currentCls.location_url || '',
      in_plan: item.in_plan,
      // สำหรับ MyReservationModal
      course: courseWithClasses,
      currentCls
    });
  };

  const isCourseClosed = (course) => {
    if (!course?.closing_date || !course?.closing_time) return false;
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

  const handleChangeClass = (targetCls) => {
    if (selectedClassDetails?.course && selectedClassDetails?.currentCls && isReservationLocked(selectedClassDetails.course, selectedClassDetails.currentCls)) {
      alert(lockedReason(selectedClassDetails.course, selectedClassDetails.currentCls));
      return;
    }
    if (isClassFinished(targetCls)) {
      alert('คลาสที่เลือกสิ้นสุดการอบรมแล้ว');
      return;
    }

    const isFull = (rawSeatCounts[targetCls.id] || 0) >= targetCls.max_seats;
    if (isFull) return;

    setConfirmConfig({
      isOpen: true,
      type: 'warning',
      title: 'ยืนยันการเปลี่ยนคลาส',
      message: `คุณต้องการย้ายไปคลาส "${targetCls.name}" วันที่ ${targetCls.date} เวลา ${targetCls.start_time} ใช่หรือไม่?`,
      confirmText: 'ยืนยันการเปลี่ยน',
      onConfirm: async () => {
        setConfirmConfig({ isOpen: false });
        // 1. cancel เดิม
        const { data: cancelResult } = await supabase.rpc('cancel_reservation', {
          p_res_id: selectedClassDetails.resId,
          p_emp_id: employee.id
        });
        if (cancelResult && !cancelResult.ok) {
          alert('ยกเลิกการจองเดิมไม่สำเร็จ: ' + cancelResult.error);
          return;
        }

        // 2. book ใหม่
        const { data: bookResult } = await supabase.rpc('book_class', {
          p_emp_id: employee.id,
          p_course_id: selectedClassDetails.courseId,
          p_class_id: targetCls.id,
          p_in_plan: selectedClassDetails.in_plan
        });
        if (bookResult && !bookResult.ok) {
          const errMap = { FULL: 'ที่นั่งเต็มแล้ว', ALREADY_BOOKED: 'คุณลงทะเบียนรุ่นนี้แล้ว', COURSE_CLOSED: 'หลักสูตรปิดรับสมัครแล้ว' };
          alert('เปลี่ยนรุ่นไม่สำเร็จ: ' + (errMap[bookResult.error] || bookResult.error));
          return;
        }

        alert('✓ เปลี่ยนคลาสสำเร็จ');
        setSelectedClassDetails(null);
        fetchCalendar(employee);
      },
      onCancel: () => setConfirmConfig({ isOpen: false })
    });
  };

  const handleCancelBook = () => {
    if (selectedClassDetails?.course && selectedClassDetails?.currentCls && isReservationLocked(selectedClassDetails.course, selectedClassDetails.currentCls)) {
      alert(lockedReason(selectedClassDetails.course, selectedClassDetails.currentCls));
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
        const { data: result } = await supabase.rpc('cancel_reservation', {
          p_res_id: selectedClassDetails.resId,
          p_emp_id: employee.id
        });
        if (result && !result.ok) {
          alert('ยกเลิกไม่สำเร็จ: ' + (result.error || 'Unknown error'));
          return;
        }
        alert('ยกเลิกการลงทะเบียนเรียบร้อย');
        setSelectedClassDetails(null);
        fetchCalendar(employee);
      },
      onCancel: () => setConfirmConfig({ isOpen: false })
    });
  };

  // Calendar Helpers
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const dayNames = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

  const bookingsByDate = {};
  bookedClasses.forEach(item => {
    const dateObj = new Date(item.fullDate);
    if (dateObj.getFullYear() === year && dateObj.getMonth() === month) {
      const d = dateObj.getDate();
      if (!bookingsByDate[d]) bookingsByDate[d] = [];
      bookingsByDate[d].push(item);
    }
  });

  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const waitingBookedClasses = bookedClasses.filter(item => !item.isFinished);
  const finishedBookedClasses = bookedClasses.filter(item => item.isFinished);
  const summaryItems = summaryFilter === 'finish' ? finishedBookedClasses : waitingBookedClasses;

  // ─── Badge: unselected courses for current employee ─────────
  const unselectedCount = useMemo(() => {
    if (!employee) return 0;
    let count = 0;
    Object.values(rawCourses).forEach(c => {
      if (c.selection_mode === 'approver') return; // ข้าม approver mode
      if (c.closing_date && c.closing_time && new Date() > new Date(`${c.closing_date}T${c.closing_time}`)) return;

      let canSee = false;
      if (c.mandatory_list?.includes(employee.id)) canSee = true;
      else if (c.allow_request && c.target_conditions) {
        const tc = c.target_conditions;
        canSee = (!tc.site?.length || tc.site.includes(employee.site)) &&
          (!tc.division?.length || tc.division.includes(employee.division)) &&
          (!tc.dept?.length || tc.dept.includes(employee.dept)) &&
          (!tc.section?.length || tc.section.includes(employee.section)) &&
          (!tc.level?.length || tc.level.includes(employee.level));
      }
      if (canSee) {
        const hasRes = rawReservations.some(r => r.emp_id === employee.id && r.course_id === c.id);
        if (!hasRes) count++;
      }
    });
    return count;
  }, [employee, rawCourses, rawReservations]);

  const pendingApprovalCount = useMemo(() => {
    if (!employee) return 0;
    let total = 0;
    Object.values(rawCourses).forEach(c => {
      if (canManageCourse(employee, c, false)) {
        const subs = getManageableParticipants(employee, allEmployeesList, c, false);
        subs.forEach(sub => {
          const hasRes = rawReservations.some(r => r.emp_id === sub.id && r.course_id === c.id);
          if (!hasRes) total++;
        });
      }
    });
    return total;
  }, [employee, rawCourses, allEmployeesList, rawReservations]);

  const isApprover = useMemo(() => {
    if (!employee) return false;
    return Object.values(rawCourses).some(c => canManageCourse(employee, c, false));
  }, [employee, rawCourses]);

  if (!employee) return null;

  return (
    <div className="min-h-screen bg-transparent pb-12 relative">
      <header className="app-header bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex justify-between items-center py-3 sm:py-4 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <BrandLogo className="h-9 sm:h-10 w-auto flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="font-display text-base sm:text-xl font-bold text-gray-900 truncate">ระบบจองคลาสเรียน</h1>
                <p className="text-xs sm:text-sm font-medium text-blue-600 truncate">รหัสพนักงาน: {employee.id}</p>
              </div>
            </div>
            <button
              onClick={async () => { await signOut(); navigate('/login'); }}
              className="text-xs sm:text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors flex-shrink-0 min-h-[44px] px-2"
            >
              ออกจากระบบ
            </button>
          </div>
          <div className="mobile-tab-rail flex space-x-4 sm:space-x-8 overflow-x-auto -mb-px">
            <NavTab to="/portal" current={location.pathname} label="หลักสูตรของฉัน" badge={unselectedCount} />
            <NavTab to="/calendar" current={location.pathname} label="ปฏิทินอบรม" />
            {isApprover && <NavTab to="/approve" current={location.pathname} label="จัดการพนักงานในสายงาน" badge={pendingApprovalCount} />}
            {isAdmin && <NavTab to="/admin/manage-classes" current={location.pathname} label="จัดคลาสให้พนักงาน (Admin)" />}
            {isAdmin && <NavTab to="/admin" current={location.pathname} label="จัดการระบบ (Admin)" />}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 mt-6 sm:mt-8">

        {loading ? (
          <div className="loading-state text-center py-12 text-gray-500">กำลังโหลดปฏิทินอบรม...</div>
        ) : (
          <>
            {/* Calendar UI */}
            <div className="app-card rounded-2xl overflow-hidden mb-8">
              <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3 bg-gray-50/50">
                <h2 className="font-display text-lg sm:text-2xl font-bold text-gray-900 flex items-center">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 mr-2 sm:mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  ตารางอบรม เดือน {monthNames[month]} {year}
                </h2>
                <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
                  <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded text-gray-600 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="font-medium px-4 text-gray-700 select-none min-w-[140px] text-center">
                    {monthNames[month]} {year}
                  </span>
                  <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded text-gray-600 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-7 mb-2">
                  {dayNames.map((day, idx) => (
                    <div key={idx} className={`text-center font-bold text-sm py-2 ${idx === 0 || idx === 6 ? 'text-orange-500' : 'text-gray-500'}`}>
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-gray-50/50 min-h-[72px] sm:min-h-[120px] p-1 sm:p-2" />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const d = i + 1;
                    const dayBookings = bookingsByDate[d] || [];
                    const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();

                    return (
                      <div key={d} className={`bg-white min-h-[72px] sm:min-h-[120px] p-1 sm:p-2 flex flex-col transition-colors hover:bg-blue-50/30 ${isToday ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/10' : ''}`}>
                        <div className={`text-right text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                          {isToday ? <span className="bg-blue-600 text-white rounded-full w-6 h-6 inline-flex items-center justify-center">{d}</span> : d}
                        </div>
                        <div className="flex-1 space-y-1 overflow-y-auto max-h-[52px] sm:max-h-[100px]">
                          {dayBookings.map((b, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleOpenDetails(b)}
                              className={`text-[10px] sm:text-xs p-1 sm:p-1.5 rounded cursor-pointer truncate shadow-sm transition-colors border ${b.isFinished ? 'bg-white hover:bg-gray-50 text-gray-500 border-gray-200 grayscale opacity-60' : 'bg-blue-100 hover:bg-blue-200 text-blue-800 border-blue-200'}`}
                              title={b.courseTitle}
                            >
                              <div className="font-bold truncate">{b.courseTitle}</div>
                              <div className={`text-[10px] truncate ${b.isFinished ? 'text-gray-400' : 'text-blue-600'}`}>{b.time}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {Array.from({ length: (42 - (firstDay + daysInMonth)) % 7 }).map((_, i) => (
                    <div key={`empty-end-${i}`} className="bg-gray-50/50 min-h-[72px] sm:min-h-[120px] p-1 sm:p-2" />
                  ))}
                </div>
              </div>
            </div>

            {/* List format */}
            {bookedClasses.length > 0 && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                    สรุปรายการอบรมทั้งหมดของคุณ
                  </h3>
                  <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setSummaryFilter('wait')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${summaryFilter === 'wait' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      รออบรม ({waitingBookedClasses.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSummaryFilter('finish')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${summaryFilter === 'finish' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      สิ้นสุดอบรมแล้ว ({finishedBookedClasses.length})
                    </button>
                  </div>
                </div>
                {summaryItems.length === 0 ? (
                  <div className="text-center py-8 app-card rounded-2xl text-sm text-gray-500">
                    {summaryFilter === 'finish' ? 'ยังไม่มีรายการอบรมที่สิ้นสุดแล้ว' : 'ไม่มีรายการที่รออบรม'}
                  </div>
                ) : (
                <div className="space-y-4">
                  {summaryItems.map(item => (
                    <div
                      key={item.resId}
                      onClick={() => handleOpenDetails(item)}
                      className={`app-card surface-hover rounded-2xl p-0 flex overflow-hidden cursor-pointer transition-all group ${item.isFinished ? 'border-gray-200 opacity-70 grayscale hover:border-gray-300' : 'border-gray-200 hover:border-blue-400 hover:shadow-md'}`}
                    >
                      <div className={`${item.isFinished ? 'bg-gray-200 text-gray-600' : 'bg-blue-600 text-white group-hover:bg-blue-700'} w-24 flex flex-col justify-center items-center py-6 px-4 transition-colors`}>
                        <span className="text-sm font-medium opacity-80">{item.month}</span>
                        <span className="text-3xl font-bold">{item.date}</span>
                      </div>
                      <div className="p-6 flex-1 flex flex-col justify-center relative">
                        <div className={`absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center text-sm font-medium ${item.isFinished ? 'text-gray-500' : 'text-blue-600'}`}>
                          ดูรายละเอียดและเพื่อนร่วมคลาส <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">{item.courseTitle}</h3>
                        <p className="text-sm text-gray-500 mt-1">{item.className}</p>
                        <div className="flex flex-wrap gap-4 mt-3">
                          <p className="text-gray-600 text-sm flex items-center">
                            <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {item.time}
                          </p>
                          <p className="text-gray-600 text-sm flex items-center">
                            <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {item.location}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Class Details Modal — ใช้ MyReservationModal กลาง */}
      {selectedClassDetails && selectedClassDetails.course && selectedClassDetails.currentCls && (
        <MyReservationModal
          isOpen={true}
          course={selectedClassDetails.course}
          currentCls={selectedClassDetails.currentCls}
          reservations={rawReservations}
          allEmployees={allEmployees}
          onChangeClass={(newCls) => handleChangeClass(newCls)}
          onCancel={handleCancelBook}
          onClose={() => setSelectedClassDetails(null)}
          canModifyReservation={!isReservationLocked(selectedClassDetails.course, selectedClassDetails.currentCls)}
          modificationLockedMessage={lockedReason(selectedClassDetails.course, selectedClassDetails.currentCls)}
        />
      )}

      {viewClassMembers && (
        <ClassDetailModal
          cls={viewClassMembers.cls}
          course={viewClassMembers.course}
          members={viewClassMembers.members}
          onClose={() => setViewClassMembers(null)}
        />
      )}

      <ConfirmModal {...confirmConfig} />
    </div>
  );
}
