import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '../supabase';
import ConfirmModal from '../components/ConfirmModal';
import FormattedDate from '../components/FormattedDate';
import BrandLogo from '../components/BrandLogo';
import { EmptyState, PageIntro } from '../components/LayoutPrimitives';
import { logAdminAction } from '../utils/logger';
import { softDelete } from '../utils/trash';
import { useAuth } from '../context/AuthContext';
import { getCourseStatus, isCourseFinished } from '../utils/courseStatus';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [selectedClass, setSelectedClass] = useState(null);
  const [editClassModal, setEditClassModal] = useState(null);
  const [addClassModal, setAddClassModal] = useState(null);
  const [editCourseModal, setEditCourseModal] = useState(null);
  const [logsModal, setLogsModal] = useState(false);
  const [logsData, setLogsData] = useState([]);

  // ดูรายชื่อระดับหลักสูตร — popup 2 ฝั่ง (ลงทะเบียนแล้ว / ยังไม่ลง)
  const [allEmployees, setAllEmployees] = useState({});
  const [viewRosterCourse, setViewRosterCourse] = useState(null);
  const [courseStatusView, setCourseStatusView] = useState('wait');

  // Confirm Modal State
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

  useEffect(() => {
    fetchDashboardData();
  }, [navigate]);

  const fetchDashboardData = async () => {
  setLoading(true);
  try {
    const [
      { data: coursesData },
      { data: classesData },
      { data: reservationsData },
      { data: employeesData },
      { data: auditLogsData }
    ] = await Promise.all([
      supabase.from('courses').select('*').eq('is_deleted', false),
      supabase.from('classes').select('*').eq('is_deleted', false),
      supabase.from('reservations').select('*').eq('is_deleted', false),
      supabase.rpc('get_employees_list'),
      supabase
        .from('audit_logs')
        .select('action, details, actor, timestamp')
        .in('action', ['BOOK_CLASS', 'BOOK_CLASS_BACKFILL'])
        .order('timestamp', { ascending: false })
    ]);

    const employees = {};
    (employeesData || []).forEach(emp => {
      employees[emp.id] = emp;
    });
    setAllEmployees(employees);

    const bookingLogMap = {};
    (auditLogsData || []).forEach(log => {
      let details;
      try {
        details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details || {};
      } catch {
        details = {};
      }

      const key = `${details.course_id}_${details.class_id}_${details.emp_id}`;

      if (!bookingLogMap[key]) {
        bookingLogMap[key] = details.performer_email || log.actor || '-';
      }
    });

    const allReservations = reservationsData || [];

    const allClasses = {};
    (classesData || []).forEach(cls => {
      allClasses[cls.id] = { ...cls, participants: [] };
    });

    allReservations.forEach(res => {
      if (allClasses[res.class_id]) {
        const emp = employees[res.emp_id] || {
          site: '-',
          division: '-',
          dept: '-',
          section: '-',
          level: '-'
        };

        allClasses[res.class_id].participants.push({
          resId: res.id,
          id: res.emp_id,
          site: emp.site || '-',
          division: emp.division || '-',
          dept: emp.dept || '-',
          section: emp.section || '-',
          level: emp.level || '-',
          timestamp: res.timestamp ? new Date(res.timestamp).toLocaleString('th-TH') : '-',
          performerEmail: bookingLogMap[`${res.course_id}_${res.class_id}_${res.emp_id}`] || '-',
          in_plan: res.in_plan
        });
      }
    });

    const finalCourses = (coursesData || []).map(cData => {
      const courseClasses = Object.values(allClasses)
        .filter(cls => cls.course_id === cData.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      let totalTarget = cData.mandatory_list ? cData.mandatory_list.length : 0;
      let registered = 0;
      let inPlanRegistered = 0;
      let outOfPlanRegistered = 0;

      courseClasses.forEach(cls => {
        registered += cls.participants.length;
        cls.participants.forEach(p => {
          if (p.in_plan) inPlanRegistered++;
          else outOfPlanRegistered++;
        });
      });

      if (totalTarget === 0 && inPlanRegistered > 0) totalTarget = inPlanRegistered;

      return {
        ...cData,
        totalTarget,
        registered,
        inPlanRegistered,
        outOfPlanRegistered,
        pending: Math.max(0, totalTarget - inPlanRegistered),
        classes: courseClasses
      };
    });

    setCourses(finalCourses.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
};

const normalizeSheetName = (name) =>
  String(name || 'Sheet')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Sheet';

const uniqueSheetName = (name, usedNames) => {
  const base = normalizeSheetName(name);
  let candidate = base.slice(0, 31);
  let counter = 2;

  while (usedNames.has(candidate)) {
    const suffix = ` (${counter})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }

  usedNames.add(candidate);
  return candidate;
};

const safeFileName = (name) =>
  String(name || 'course')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const worksheetXml = (name, rows, headers) => `
    <Worksheet ss:Name="${escapeXml(name)}">
      <Table>
        <Row>
          ${headers.map(header => `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join('')}
        </Row>
        ${rows.map(row => `
        <Row>
          ${headers.map(header => `<Cell><Data ss:Type="String">${escapeXml(row[header])}</Data></Cell>`).join('')}
        </Row>`).join('')}
      </Table>
    </Worksheet>`;

const downloadTextFile = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const exportCourseExcel = (course) => {
  const headers = [
    'รหัสพนักงาน',
    'Site',
    'Division',
    'Dept',
    'Section',
    'เวลาที่จอง',
    'ผู้ดำเนินการจอง (Email)'
  ];

  const usedSheetNames = new Set();
  const worksheets = course.classes.map(cls => {
    const rows = (cls.participants || []).map(p => ({
      'รหัสพนักงาน': p.id,
      'Site': p.site || '-',
      'Division': p.division || '-',
      'Dept': p.dept || '-',
      'Section': p.section || '-',
      'เวลาที่จอง': p.timestamp || '-',
      'ผู้ดำเนินการจอง (Email)': p.performerEmail || '-'
    }));

    return worksheetXml(uniqueSheetName(cls.name || cls.date || 'Class', usedSheetNames), rows, headers);
  });

  const bookedIds = new Set(
    course.classes.flatMap(cls => (cls.participants || []).map(p => p.id))
  );

  const notSelectedRows = (course.mandatory_list || [])
    .filter(empId => !bookedIds.has(empId))
    .map(empId => {
      const emp = allEmployees[empId] || {};
      return {
        'รหัสพนักงาน': empId,
        'Site': emp.site || '-',
        'Division': emp.division || '-',
        'Dept': emp.dept || '-',
        'Section': emp.section || '-',
        'เวลาที่จอง': '',
        'ผู้ดำเนินการจอง (Email)': ''
      };
    });

  if (notSelectedRows.length > 0) {
    worksheets.push(worksheetXml(uniqueSheetName('ยังไม่เลือก', usedSheetNames), notSelectedRows, headers));
  }

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#E8F1FF" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${worksheets.join('')}
</Workbook>`;

  downloadTextFile(
    workbook,
    `${safeFileName(course.title)}-registration.xls`,
    'application/vnd.ms-excel;charset=utf-8'
  );
};

const handleDeleteCourse = (course) => {
  setConfirmConfig({
    isOpen: true,
    type: 'danger',
    title: 'ยืนยันการลบหลักสูตร',
    message: `คุณต้องการลบหลักสูตร "${course.title}" ใช่หรือไม่?\nข้อมูลคลาสเรียนและผู้ลงทะเบียนทั้งหมดในหลักสูตรนี้จะถูกลบอย่างถาวร!`,
    onConfirm: async () => {
      setConfirmConfig({ isOpen: false });
      try {
        for (const cls of course.classes) {
          for (const p of cls.participants) {
            await softDelete('reservations', p.resId);
          }
          await softDelete('classes', cls.id);
        }
        await softDelete('courses', course.id);
        await logAdminAction('DELETE_COURSE', { courseId: course.id, title: course.title });
        fetchDashboardData();
        alert('ลบหลักสูตรเรียบร้อยแล้ว');
      } catch (e) {
        console.error('Delete course error:', e);
        alert('ลบหลักสูตรไม่สำเร็จ: ' + (e.message || e));
      }
    },
    onCancel: () => setConfirmConfig({ isOpen: false })
  });
};

  const handleEditClassSubmit = async (e) => {
    e.preventDefault();
    const { id, name, max_seats, date, start_time, end_time, location, location_url, instructor, participants } = editClassModal;

    if (Number(max_seats) < participants.length) {
      alert(`ไม่สามารถลดที่นั่งเหลือ ${max_seats} ได้ เนื่องจากมีผู้ลงทะเบียนแล้ว ${participants.length} คน\nกรุณาลบผู้ลงทะเบียนออกก่อน`);
      return;
    }

    try {
      const { error } = await supabase
        .from('classes')
        .update({
          name,
          max_seats: Number(max_seats),
          date,
          start_time,
          end_time,
          location,
          location_url: location_url || '',
          instructor: instructor || ''
        })
        .eq('id', id);

      if (error) throw error;
      setEditClassModal(null);
      fetchDashboardData();
    } catch (err) {
      console.error(err);
      alert('บันทึกไม่สำเร็จ');
    }
  };

  const handleAddClassSubmit = async (e) => {
    e.preventDefault();
    const { course_id, name, max_seats, date, start_time, end_time, location, location_url, instructor } = addClassModal;

    try {
      const clsId = `cls_${Date.now()}`;

      // หา sort_order ให้มากกว่าสูงสุดในหลักสูตรนี้ — เพื่อให้คลาสใหม่ไปท้ายสุด
      const courseObj = courses.find(c => c.id === course_id);
      const maxSort = courseObj?.classes?.reduce((m, c) => Math.max(m, c.sort_order || 0), -1) ?? -1;

      const { error } = await supabase
        .from('classes')
        .insert({
          id: clsId,
          course_id,
          name,
          max_seats: Number(max_seats) || 0,
          date,
          start_time,
          end_time,
          location,
          location_url: location_url || '',
          instructor: instructor || '',
          sort_order: maxSort + 1,
          is_deleted: false
        });

      if (error) throw error;
      setAddClassModal(null);
      fetchDashboardData();
      alert('เพิ่มรุ่นการอบรมเรียบร้อยแล้ว');
    } catch (err) {
      console.error(err);
      alert('เพิ่มรุ่นการอบรมไม่สำเร็จ');
    }
  };

  // ─── DnD: reorder classes within a course ────────────────────
  const handleReorderClasses = async (courseId, newOrderIds) => {
    // 1. update local state ก่อน (optimistic)
    setCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      const map = {};
      c.classes.forEach(cl => { map[cl.id] = cl; });
      return {
        ...c,
        classes: newOrderIds.map((id, idx) => ({ ...map[id], sort_order: idx }))
      };
    }));

    // 2. persist to DB (parallel)
    try {
      await Promise.all(newOrderIds.map((id, idx) =>
        supabase.from('classes').update({ sort_order: idx }).eq('id', id)
      ));
    } catch (err) {
      console.error('Reorder failed:', err);
      alert('บันทึกลำดับไม่สำเร็จ — รีโหลดหน้า');
      fetchDashboardData();
    }
  };

  const handleEditCourseSubmit = (e) => {
    e.preventDefault();
    const { title, description, closing_date, closing_time, mandatory_list, allow_request, _originalCourse } = editCourseModal;

    const addedIds = mandatory_list.filter(newId => !((_originalCourse.mandatory_list || []).includes(newId)));
    const removedIds = (_originalCourse.mandatory_list || []).filter(oldId => !mandatory_list.includes(oldId));

    let msg = `คุณต้องการบันทึกการแก้ไขหลักสูตรนี้ใช่หรือไม่?\n\nสรุปการเปลี่ยนแปลง:\n`;
    if (title !== _originalCourse.title) msg += `- ชื่อหลักสูตรถูกแก้ไข\n`;
    if (description !== _originalCourse.description) msg += `- รายละเอียดถูกแก้ไข\n`;
    if (closing_date !== _originalCourse.closing_date || closing_time !== _originalCourse.closing_time) msg += `- วัน/เวลาปิดรับสมัครถูกแก้ไข\n`;
    if (allow_request !== _originalCourse.allow_request) msg += `- สถานะการรับคนนอกเปลี่ยนเป็น: ${allow_request ? 'อนุญาต' : 'ไม่อนุญาต'}\n`;
    if (addedIds.length > 0) msg += `- เพิ่มผู้มีสิทธิ์เข้าร่วม: ${addedIds.length} คน\n`;
    if (removedIds.length > 0) msg += `- ลบผู้มีสิทธิ์เข้าร่วม: ${removedIds.length} คน ${!allow_request ? '(⚠️ การจองของคนกลุ่มนี้จะถูกยกเลิกทันที)' : ''}\n`;
    if (_originalCourse.allow_request && !allow_request) msg += `- ⚠️ คนนอกรายชื่อที่เคยลงทะเบียนมาจะถูกยกเลิกการจองทันที\n`;

    if (addedIds.length === 0 && removedIds.length === 0 && title === _originalCourse.title && description === _originalCourse.description && closing_date === _originalCourse.closing_date && closing_time === _originalCourse.closing_time && allow_request === _originalCourse.allow_request) {
      msg += `- ไม่มีข้อมูลเปลี่ยนแปลง\n`;
    }

    setConfirmConfig({
      isOpen: true,
      type: 'warning',
      title: 'ยืนยันการแก้ไขข้อมูลหลักสูตร',
      message: msg,
      confirmText: 'บันทึกการแก้ไข',
      onConfirm: async () => {
        setConfirmConfig({ isOpen: false });
        await executeSaveCourse(editCourseModal, removedIds);
      },
      onCancel: () => setConfirmConfig({ isOpen: false })
    });
  };

  const executeSaveCourse = async (courseData, removedIds) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('courses')
        .update({
          title: courseData.title || '',
          description: courseData.description || '',
          closing_date: courseData.closing_date || '',
          closing_time: courseData.closing_time || '',
          allow_request: courseData.allow_request,
          mandatory_list: courseData.mandatory_list
        })
        .eq('id', courseData.id);

      if (error) throw error;

      // If strict course and some people removed from mandatory, soft-delete their reservations
      // AND if allow_request changed to false, delete ALL out_of_plan reservations
      if (!courseData.allow_request) {
        const { data: reservations } = await supabase
          .from('reservations')
          .select('id, emp_id, in_plan')
          .eq('course_id', courseData.id)
          .eq('is_deleted', false);

        const toDelete = (reservations || []).filter(r => {
          return removedIds.includes(r.emp_id) || !r.in_plan;
        });

        const deletedEmpIds = toDelete.map(r => r.emp_id);
        for (const r of toDelete) {
          await softDelete('reservations', r.id);
        }

        if (toDelete.length > 0) {
          await logAdminAction('REMOVE_OUTSIDER_RESERVATIONS', { 
            courseId: courseData.id, 
            courseTitle: courseData.title,
            deletedCount: toDelete.length, 
            deletedEmpIds 
          });
        }
      }

      setEditCourseModal(null);
      fetchDashboardData();
      alert('แก้ไขข้อมูลหลักสูตรเรียบร้อยแล้ว');
    } catch (err) {
      console.error(err);
      alert('แก้ไขข้อมูลหลักสูตรไม่สำเร็จ');
      setLoading(false);
    }
  };

  const handleRemoveParticipant = (cls, participant) => {
    setConfirmConfig({
      isOpen: true,
      type: 'warning',
      title: 'ยืนยันการลบรายชื่อ',
      message: `คุณต้องการลบรหัส "${participant.id}" ออกจากคลาส "${cls.name}" ใช่หรือไม่?`,
      onConfirm: async () => {
        setConfirmConfig({ isOpen: false });
        try {
          await softDelete('reservations', participant.resId);
          setSelectedClass(prev => ({
            ...prev,
            participants: prev.participants.filter(p => p.resId !== participant.resId)
          }));
          await logAdminAction('REMOVE_PARTICIPANT', { reservationId: participant.resId, empId: participant.id });
          fetchDashboardData();
        } catch (e) {
          console.error(e);
          alert('ลบผู้ลงทะเบียนไม่สำเร็จ');
        }
      },
      onCancel: () => setConfirmConfig({ isOpen: false })
    });
  };

  const waitCourses = courses.filter(course => !isCourseFinished(course));
  const finishedCourses = courses.filter(course => isCourseFinished(course));
  const displayedCourses = courseStatusView === 'finish' ? finishedCourses : waitCourses;

  return (
    <div className="min-h-screen bg-transparent pb-20 sm:pb-12">
      <header className="app-header bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <BrandLogo className="h-9 w-auto flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-xl font-bold text-gray-900 truncate">Admin Dashboard</h1>
              <p className="text-xs sm:text-sm text-gray-500 truncate">ระบบจัดการคลาสเรียน</p>
            </div>
          </div>
          <div className="mobile-action-rail sm:w-auto sm:flex sm:items-center sm:gap-3 sm:flex-wrap">
            <Link to="/portal" className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors shadow-sm">
              หน้าพนักงาน
            </Link>
            <Link to="/admin/employees" className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors shadow-sm">
              จัดการพนักงาน
            </Link>
            <Link to="/admin/manage-classes" className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors shadow-sm">
              จัดคลาสให้พนักงาน
            </Link>
            <Link to="/admin/users" className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors shadow-sm">
              จัดการสิทธิ์ Admin
            </Link>
            <Link to="/admin/create" className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
              <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              สร้างหลักสูตรใหม่
            </Link>
            <button onClick={async () => {
              try {
                setLogsModal(true);
                const { data } = await supabase.from('audit_logs').select('*').in('action', ['REMOVE_OUTSIDER_RESERVATIONS']).order('timestamp', { ascending: false });
                setLogsData(data || []);
              } catch (e) { console.error(e); }
            }} className="inline-flex items-center px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-800 text-sm font-medium rounded-lg transition-colors shadow-sm">
              <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              ประวัติยกเลิกคนนอก (Logs)
            </button>
            <button onClick={async () => { await signOut(); navigate('/login'); }} className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors ml-2">
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-8 sm:mt-10 space-y-8 sm:space-y-10">
        {loading ? (
          <div className="loading-state text-center py-12 text-gray-500">กำลังโหลดข้อมูล Dashboard...</div>
        ) : courses.length === 0 ? (
          <EmptyState
            message="ยังไม่มีข้อมูลหลักสูตรในระบบ"
            action={<Link to="/admin/create" className="text-blue-600 font-medium hover:underline">คลิกที่นี่เพื่อสร้างหลักสูตรแรก</Link>}
          />
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <PageIntro
                className="min-w-0"
                eyebrow="ภาพรวมการฝึกอบรม"
                title="จัดการหลักสูตรและรุ่นอบรม"
                description="เห็นสถานะหลักสูตรทั้งหมดในที่เดียว เลือกดูหลักสูตรที่รออบรมหรือจบแล้ว แล้วจัดการรุ่นอบรมต่อได้ทันที"
              />
              <div className="flex flex-col sm:flex-row lg:flex-col gap-3 sm:items-stretch lg:min-w-[260px]">
                <Link to="/admin/create" className="inline-flex justify-center items-center px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
                  <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  สร้างหลักสูตรใหม่
                </Link>
                <div className="inline-flex w-full rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setCourseStatusView('wait')}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${courseStatusView === 'wait' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Wait ({waitCourses.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCourseStatusView('finish')}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${courseStatusView === 'finish' ? 'bg-gray-100 text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    Finish ({finishedCourses.length})
                  </button>
                </div>
              </div>
            </section>

            {displayedCourses.length === 0 ? (
              <EmptyState message={courseStatusView === 'finish' ? 'ยังไม่มีหลักสูตรที่สิ้นสุดอบรมแล้ว' : 'ยังไม่มีหลักสูตรที่รออบรม'} />
            ) : displayedCourses.map((course) => (
            <div key={course.id} className={`app-card surface-hover rounded-2xl overflow-hidden relative group ${isCourseFinished(course) ? 'opacity-75 grayscale-[0.2]' : ''}`}>

              <div className="mobile-card-actions z-10 p-3 sm:p-0 sm:absolute sm:top-4 sm:right-4 sm:flex sm:flex-wrap sm:gap-2 sm:w-auto sm:justify-end">
                <button
                  onClick={() => setViewRosterCourse(course)}
                  className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors flex items-center gap-1.5"
                  title="ดูรายชื่อผู้เข้าร่วม"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  ดูรายชื่อ
                </button>
                <button
                  onClick={() => exportCourseExcel(course)}
                  className="px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1.5"
                  title="Export Excel"
                >
                  Export Excel
                </button>
                <Link
                  to={`/admin/edit/${course.id}`}
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5"
                  title="แก้ไขหลักสูตร"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  แก้ไขเต็มรูปแบบ
                </Link>
                <button
                  onClick={() => handleDeleteCourse(course)}
                  className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                  title="ลบหลักสูตร"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>

              <div className="p-4 sm:p-6 border-b border-gray-100 bg-gray-50/50">
                <div className="flex justify-between items-start mb-6 pr-0 sm:pr-20">
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-2xl font-bold text-gray-900">{course.title}</h2>
                    <p className="text-sm sm:text-base text-gray-500 mt-1">{course.description}</p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3">
                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${course.allow_request ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {course.allow_request ? 'เปิดรับคนนอกเงื่อนไข (Allow Request)' : 'เฉพาะผู้มีสิทธิ์เท่านั้น (Strict)'}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${isCourseFinished(course) ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-amber-700'}`}>
                        {getCourseStatus(course)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.2fr_1fr] gap-3 sm:gap-4">
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-sm font-medium mb-1">เป้าหมายทั้งหมด</p>
                    <p className="text-2xl font-bold text-gray-900">{course.totalTarget} <span className="text-sm font-normal text-gray-500">คน</span></p>
                  </div>
                  <div className="bg-white rounded-lg border border-green-200 p-4 sm:p-5">
                    <p className="text-gray-500 text-sm font-medium mb-1">ลงทะเบียนแล้ว (ทั้งหมด)</p>
                    <div className="flex items-end justify-between">
                      <p className="text-3xl font-bold text-green-600">{course.registered} <span className="text-sm font-normal text-green-500">คน</span></p>
                      <span className="text-sm font-medium text-green-600">{course.totalTarget > 0 ? Math.round((course.registered / course.totalTarget) * 100) : 0}%</span>
                    </div>
                    {course.allow_request && (
                      <div className="mt-3 pt-3 border-t border-green-100 flex justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          <span className="text-gray-600">ตามแผน: <strong>{course.inPlanRegistered}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                          <span className="text-gray-600">นอกแผน: <strong>{course.outOfPlanRegistered}</strong></span>
                        </div>
                      </div>
                    )}
                    {!course.allow_request && (
                      <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${course.totalTarget > 0 ? (course.registered / course.totalTarget) * 100 : 0}%` }}></div>
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-lg border border-orange-200 p-4">
                    <p className="text-gray-500 text-sm font-medium mb-1">รอลงทะเบียน (ตามแผน)</p>
                    <div className="flex items-end justify-between">
                      <p className="text-2xl font-bold text-orange-600">{course.pending} <span className="text-sm font-normal text-orange-500">คน</span></p>
                      <span className="text-sm font-medium text-orange-600">{course.totalTarget > 0 ? Math.round((course.pending / course.totalTarget) * 100) : 0}%</span>
                    </div>
                    <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-orange-400 h-1.5 rounded-full" style={{ width: `${course.totalTarget > 0 ? (course.pending / course.totalTarget) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">
                  <h3 className="text-lg font-bold text-gray-900">คลาสเรียน (Classes)</h3>
                  <button
                    onClick={() => setAddClassModal({ course_id: course.id, courseTitle: course.title, name: `รุ่นที่ ${course.classes.length + 1}`, max_seats: '', date: '', start_time: '', end_time: '', location: '', location_url: '', instructor: '' })}
                    className="w-full sm:w-auto justify-center text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    เพิ่มรุ่นอบรม
                  </button>
                </div>
                {course.classes.length === 0 ? (
                  <p className="text-gray-500 text-sm">ไม่มีข้อมูลคลาส</p>
                ) : (
                  <SortableClassGrid
                    course={course}
                    onEdit={(cls) => setEditClassModal({ ...cls, courseTitle: course.title })}
                    onView={(cls) => setSelectedClass({ courseTitle: course.title, allow_request: course.allow_request, ...cls })}
                    onReorder={(newOrderIds) => handleReorderClasses(course.id, newOrderIds)}
                  />
                )}
              </div>
            </div>
            ))}
          </>
        )}
      </main>

      {/* Participants Modal */}
      {selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">รายชื่อผู้ลงทะเบียน</h3>
                <p className="text-sm text-gray-500">{selectedClass.courseTitle} - {selectedClass.name} ({selectedClass.date} {selectedClass.start_time})</p>
              </div>
              <button onClick={() => setSelectedClass(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="app-table-wrap flex-1">
              <table className="app-table text-sm text-left min-w-[760px]">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 font-medium">รหัสพนักงาน</th>
                    <th className="px-6 py-3 font-medium">Site / Dept / Sec</th>
                    {selectedClass.allow_request && <th className="px-6 py-3 font-medium">ประเภท</th>}
                    <th className="px-6 py-3 font-medium">เวลาที่จอง</th>
                    <th className="px-6 py-3 font-medium text-right">ลบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedClass.participants.map((p) => (
                    <tr key={p.resId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{p.id}</td>
                      <td className="px-6 py-4 text-xs text-gray-600">{p.site} / {p.dept} / {p.section}</td>
                      {selectedClass.allow_request && (
                        <td className="px-6 py-4">
                          {p.in_plan ? <span className="text-green-600">ตามแผน</span> : <span className="text-purple-600">นอกแผน</span>}
                        </td>
                      )}
                      <td className="px-6 py-4 text-gray-500">{p.timestamp}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleRemoveParticipant(selectedClass, p)} className="text-red-500 hover:text-red-700 font-medium">ลบออก</button>
                      </td>
                    </tr>
                  ))}
                  {selectedClass.participants.length === 0 && (
                    <tr>
                      <td colSpan={selectedClass.allow_request ? 6 : 5} className="px-6 py-8 text-center text-gray-500">
                        ยังไม่มีผู้ลงทะเบียนในคลาสนี้
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Class Modal */}
      {editClassModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">แก้ไขคลาสเรียน</h3>
            <p className="text-sm text-gray-500 mb-6">{editClassModal.courseTitle}</p>
            <form onSubmit={handleEditClassSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อรุ่น</label>
                <input required type="text" value={editClassModal.name} onChange={e => setEditClassModal({ ...editClassModal, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนรับสูงสุด</label>
                  <input required type="number" min="1" value={editClassModal.max_seats} onChange={e => setEditClassModal({ ...editClassModal, max_seats: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
                  <input required type="date" value={editClassModal.date} onChange={e => setEditClassModal({ ...editClassModal, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เวลาเริ่ม</label>
                  <input required type="time" value={editClassModal.start_time} onChange={e => setEditClassModal({ ...editClassModal, start_time: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เวลาสิ้นสุด</label>
                  <input required type="time" value={editClassModal.end_time} onChange={e => setEditClassModal({ ...editClassModal, end_time: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สถานที่</label>
                <input required type="text" value={editClassModal.location} onChange={e => setEditClassModal({ ...editClassModal, location: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link แผนที่ (Google Maps)</label>
                <input type="text" value={editClassModal.location_url || ''} onChange={e => setEditClassModal({ ...editClassModal, location_url: e.target.value })} placeholder="https://maps.app.goo.gl/..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วิทยากร</label>
                <input type="text" value={editClassModal.instructor || ''} onChange={e => setEditClassModal({ ...editClassModal, instructor: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setEditClassModal(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">ยกเลิก</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Class Modal */}
      {addClassModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">เพิ่มรุ่นการอบรม</h3>
            <p className="text-sm text-gray-500 mb-6">{addClassModal.courseTitle}</p>
            <form onSubmit={handleAddClassSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อรุ่น</label>
                <input required type="text" value={addClassModal.name} onChange={e => setAddClassModal({ ...addClassModal, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนรับสูงสุด</label>
                  <input required type="number" min="1" value={addClassModal.max_seats} onChange={e => setAddClassModal({ ...addClassModal, max_seats: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
                  <input required type="date" value={addClassModal.date} onChange={e => setAddClassModal({ ...addClassModal, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เวลาเริ่ม</label>
                  <input required type="time" value={addClassModal.start_time} onChange={e => setAddClassModal({ ...addClassModal, start_time: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เวลาสิ้นสุด</label>
                  <input required type="time" value={addClassModal.end_time} onChange={e => setAddClassModal({ ...addClassModal, end_time: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สถานที่</label>
                <input required type="text" value={addClassModal.location} onChange={e => setAddClassModal({ ...addClassModal, location: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link แผนที่ (Google Maps)</label>
                <input type="text" value={addClassModal.location_url || ''} onChange={e => setAddClassModal({ ...addClassModal, location_url: e.target.value })} placeholder="https://maps.app.goo.gl/..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วิทยากร</label>
                <input type="text" value={addClassModal.instructor} onChange={e => setAddClassModal({ ...addClassModal, instructor: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setAddClassModal(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">ยกเลิก</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">เพิ่มรุ่นอบรม</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {editCourseModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-6">แก้ไขข้อมูลหลักสูตร</h3>
            <form onSubmit={handleEditCourseSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อหลักสูตร</label>
                <input required type="text" value={editCourseModal.title} onChange={e => setEditCourseModal({ ...editCourseModal, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด / วัตถุประสงค์</label>
                <textarea rows="2" value={editCourseModal.description} onChange={e => setEditCourseModal({ ...editCourseModal, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"></textarea>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ปิดรับลงทะเบียน</label>
                  <input required type="date" value={editCourseModal.closing_date || ''} onChange={e => setEditCourseModal({ ...editCourseModal, closing_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เวลาปิดรับลงทะเบียน</label>
                  <input required type="time" value={editCourseModal.closing_time || ''} onChange={e => setEditCourseModal({ ...editCourseModal, closing_time: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รายชื่อผู้มีสิทธิ์เข้าร่วม ({editCourseModal.mandatory_list.length} คน)
                </label>
                <div className="flex gap-2 mb-2">
                  <textarea
                    rows="2"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="พิมพ์หรือวางรหัสพนักงานคั่นด้วยลูกน้ำเพื่อเพิ่ม เช่น 10001, 10002"
                    value={editCourseModal._tempInput}
                    onChange={e => setEditCourseModal({ ...editCourseModal, _tempInput: e.target.value })}
                  />
                  <div className="flex flex-col gap-2 min-w-[80px]">
                    <button
                      type="button"
                      className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 font-medium transition-colors"
                      onClick={() => {
                        if (!editCourseModal._tempInput.trim()) return;
                        const newIds = editCourseModal._tempInput.split(',').map(s => s.trim()).filter(Boolean);
                        const merged = [...new Set([...editCourseModal.mandatory_list, ...newIds])];
                        setEditCourseModal({ ...editCourseModal, mandatory_list: merged, _tempInput: '' });
                      }}
                    >
                      เพิ่มรหัส
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 font-medium transition-colors"
                      onClick={() => {
                        if (!editCourseModal._tempInput.trim()) return;
                        const idsToRemove = editCourseModal._tempInput.split(',').map(s => s.trim()).filter(Boolean);
                        const filtered = editCourseModal.mandatory_list.filter(id => !idsToRemove.includes(id));
                        setEditCourseModal({ ...editCourseModal, mandatory_list: filtered, _tempInput: '' });
                      }}
                    >
                      ลบรหัส
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-red-50 hover:text-red-600 border border-gray-200 hover:border-red-200 flex-1 font-medium transition-colors"
                      onClick={() => {
                        if (window.confirm('คุณต้องการล้างรายชื่อทั้งหมดใช่หรือไม่?')) {
                          setEditCourseModal({ ...editCourseModal, mandatory_list: [] });
                        }
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-50 flex flex-wrap gap-2">
                  {editCourseModal.mandatory_list.length === 0 ? (
                    <span className="text-gray-400 text-sm w-full text-center py-2">ไม่มีผู้มีสิทธิ์เข้าร่วม</span>
                  ) : (
                    editCourseModal.mandatory_list.map(id => (
                      <span key={id} className="inline-flex items-center px-2 py-1 bg-white border border-gray-200 rounded-md text-xs font-medium text-gray-700 shadow-sm hover:border-red-300 transition-colors group">
                        {id}
                        <button
                          type="button"
                          className="ml-1.5 text-gray-300 group-hover:text-red-500 font-bold focus:outline-none"
                          onClick={() => {
                            setEditCourseModal({ ...editCourseModal, mandatory_list: editCourseModal.mandatory_list.filter(x => x !== id) });
                          }}
                        >
                          &times;
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  * หากหลักสูตรนี้เป็นแบบ <strong>เฉพาะผู้มีสิทธิ์เท่านั้น</strong> การลบรหัสพนักงานออกจากช่องนี้ จะทำให้ <u>การจองของพนักงานคนนั้นถูกยกเลิกทันที</u>
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setEditCourseModal(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">ยกเลิก</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">บันทึกการแก้ไข</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {logsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">ประวัติการยกเลิกคนนอก (Logs)</h3>
              <button onClick={() => setLogsModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="app-table-wrap flex-1">
              <table className="app-table text-sm text-left min-w-[820px]">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 font-medium">เวลาที่บันทึก</th>
                    <th className="px-6 py-3 font-medium">ชื่อหลักสูตร</th>
                    <th className="px-6 py-3 font-medium">จำนวนที่ถูกลบ</th>
                    <th className="px-6 py-3 font-medium">รหัสพนักงานที่ถูกลบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logsData.map(log => {
                    let details;
                    try { details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details; } catch { details = {}; }
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{log.timestamp ? new Date(log.timestamp).toLocaleString('th-TH') : '-'}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">{details?.courseTitle || '-'}</td>
                        <td className="px-6 py-4 text-red-600 font-bold">{details?.deletedCount || 0} คน</td>
                        <td className="px-6 py-4 text-gray-500 text-xs">{(details?.deletedEmpIds || []).join(', ')}</td>
                      </tr>
                    );
                  })}
                  {logsData.length === 0 && (
                    <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500">ไม่มีประวัติการยกเลิกคนนอก</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Course Roster Modal — ดูรายชื่อระดับหลักสูตร (เขียว=ลงแล้ว / แดง=ยังไม่ลง) */}
      {viewRosterCourse && (
        <CourseRosterModal
          course={viewRosterCourse}
          allEmployees={allEmployees}
          onClose={() => setViewRosterCourse(null)}
        />
      )}

      {/* Global Confirm Modal */}
      <ConfirmModal {...confirmConfig} />
    </div>
  );
}

// ─── Course Roster Modal ─────────────────────────────────────
// ดูรายชื่อผู้เข้าร่วมระดับหลักสูตร แบ่ง 2 ฝั่ง + Dashboard 3 มิติกดกรอง
function CourseRosterModal({ course, allEmployees, onClose }) {
  const [historyEmpId, setHistoryEmpId] = useState(null);   // emp_id ที่กำลังดูประวัติ
  // filter state: { division: Set, dept: Set, section: Set }
  const [filter, setFilter] = useState({ division: new Set(), dept: new Set(), section: new Set() });

  const {
    allRegistered,
    allNotRegistered,
    allEntries,
    divCounts,
    deptCounts,
    sectionCounts
  } = useMemo(() => {
    const bookedMap = {};
    (course.classes || []).forEach(cls => {
      (cls.participants || []).forEach(p => {
        bookedMap[p.id] = { className: cls.name || cls.date || '-' };
      });
    });

    const buildEntry = (empId, extra = {}) => {
      const emp = allEmployees[empId] || {};
      return {
        id: empId,
        site: emp.site || '-',
        division: emp.division || '-',
        dept: emp.dept || '-',
        section: emp.section || '-',
        level: emp.level || '-',
        ...extra
      };
    };

    const registeredEntries = Object.keys(bookedMap)
      .map(id => buildEntry(id, { className: bookedMap[id].className }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const notRegisteredEntries = (course.mandatory_list || [])
      .filter(empId => !bookedMap[empId])
      .map(id => buildEntry(id))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const entries = [...registeredEntries, ...notRegisteredEntries];

    const countBy = (field) => {
      const m = {};
      entries.forEach(e => {
        const v = e[field];
        if (!m[v]) m[v] = { eligible: 0, registered: 0 };
        m[v].eligible += 1;
      });
      registeredEntries.forEach(e => {
        const v = e[field];
        if (m[v]) m[v].registered += 1;
      });
      return Object.entries(m)
        .map(([val, { eligible, registered }]) => [val, eligible, registered])
        .sort((a, b) => b[1] - a[1]);
    };

    return {
      allRegistered: registeredEntries,
      allNotRegistered: notRegisteredEntries,
      allEntries: entries,
      divCounts: countBy('division'),
      deptCounts: countBy('dept'),
      sectionCounts: countBy('section')
    };
  }, [course, allEmployees]);

  const toggleFilter = useCallback((field, value) => {
    setFilter(prev => {
      const next = { ...prev, [field]: new Set(prev[field]) };
      if (next[field].has(value)) next[field].delete(value);
      else next[field].add(value);
      return next;
    });
  }, []);
  const clearAll = useCallback(() => setFilter({ division: new Set(), dept: new Set(), section: new Set() }), []);
  const hasFilter = filter.division.size + filter.dept.size + filter.section.size > 0;

  // ─── focusedValues: ค่าใน field ที่ "เกี่ยวข้อง" กับ filter ปัจจุบัน ───
  //   ถ้า user เลือก Division A -> ค่า field อื่น (dept, section) ที่ "อยู่ใน Division A" จะถือว่า focused
  //   ใช้ allEntries เป็นแหล่งความสัมพันธ์ Div <-> Dept <-> Section
  //   - ถ้าไม่มี filter เลย -> ทุกค่า focused (จะไม่จาง)
  const focusedValues = useMemo(() => {
    const values = {
      division: new Set(),
      dept: new Set(),
      section: new Set(),
    };
    if (hasFilter) {
      allEntries.forEach(e => {
        const inDiv  = filter.division.size === 0 || filter.division.has(e.division);
        const inDept = filter.dept.size === 0     || filter.dept.has(e.dept);
        const inSec  = filter.section.size === 0  || filter.section.has(e.section);
        if (inDiv && inDept && inSec) {
          values.division.add(e.division);
          values.dept.add(e.dept);
          values.section.add(e.section);
        }
      });
    }
    return values;
  }, [allEntries, filter, hasFilter]);

  const { registered, notRegistered } = useMemo(() => {
    const matches = (e) =>
      (filter.division.size === 0 || filter.division.has(e.division)) &&
      (filter.dept.size === 0 || filter.dept.has(e.dept)) &&
      (filter.section.size === 0 || filter.section.has(e.section));

    return {
      registered: allRegistered.filter(matches),
      notRegistered: allNotRegistered.filter(matches)
    };
  }, [allRegistered, allNotRegistered, filter]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-gray-900/55">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/60">
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">รายชื่อผู้เข้าร่วม</h3>
            <p className="text-sm text-blue-600 mt-0.5 truncate">{course.title}</p>
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

          {/* ─── Dashboard ─── */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/40">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <p className="text-sm font-bold text-gray-700">📊 Dashboard ผู้เข้าร่วมทั้งหมด ({allEntries.length} คน) — กดเพื่อกรอง</p>
              {hasFilter && (
                <button onClick={clearAll} className="text-xs font-medium text-blue-600 hover:underline">ล้างตัวกรอง</button>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <DashSection title="Division" field="division" counts={divCounts} filter={filter} focused={focusedValues.division} hasFilter={hasFilter} onToggle={toggleFilter} />
              <DashSection title="Department" field="dept" counts={deptCounts} filter={filter} focused={focusedValues.dept} hasFilter={hasFilter} onToggle={toggleFilter} />
              <DashSection title="Section" field="section" counts={sectionCounts} filter={filter} focused={focusedValues.section} hasFilter={hasFilter} onToggle={toggleFilter} />
            </div>
          </div>

          {/* ─── 2 ฝั่ง ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* เขียว */}
            <div className="border border-green-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 bg-green-50 border-b border-green-200 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0"></span>
                <p className="text-sm font-bold text-green-800">
                  ลงทะเบียนแล้ว ({registered.length}{hasFilter ? `/${allRegistered.length}` : ''} คน)
                </p>
              </div>
              <div className="roster-scroll divide-y divide-gray-100 overflow-y-auto max-h-[40vh]">
                {registered.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-6">
                    {hasFilter ? 'ไม่มีผู้ลงทะเบียนตามเงื่อนไข' : 'ยังไม่มีผู้ลงทะเบียน'}
                  </p>
                ) : registered.map(p => (
                  <div key={p.id} className="roster-row px-4 py-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">รหัส {p.id}</p>
                        <button
                          type="button"
                          onClick={() => setHistoryEmpId(p.id)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5"
                          title="ดูประวัติผู้ดำเนินการ"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          ประวัติ
                        </button>
                      </div>
                      <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded">{p.className}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Site: {p.site} • Div: {p.division} • Dept: {p.dept} • Sec: {p.section} • Level: {p.level}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* แดง */}
            <div className="border border-red-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"></span>
                <p className="text-sm font-bold text-red-800">
                  ยังไม่ลงทะเบียน ({notRegistered.length}{hasFilter ? `/${allNotRegistered.length}` : ''} คน)
                </p>
              </div>
              <div className="roster-scroll divide-y divide-gray-100 overflow-y-auto max-h-[40vh]">
                {notRegistered.length === 0 ? (
                  <p className="text-sm text-gray-400 italic text-center py-6">
                    {hasFilter ? 'ไม่มีคนตามเงื่อนไข' : 'ทุกคนในรายชื่อลงทะเบียนครบแล้ว'}
                  </p>
                ) : notRegistered.map(p => (
                  <div key={p.id} className="roster-row px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">รหัส {p.id}</p>
                      <button
                        type="button"
                        onClick={() => setHistoryEmpId(p.id)}
                        className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5"
                        title="ดูประวัติผู้ดำเนินการ"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ประวัติ
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Site: {p.site} • Div: {p.division} • Dept: {p.dept} • Sec: {p.section} • Level: {p.level}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 min-h-[40px]">
            ปิด
          </button>
        </div>
      </div>

      {/* Nested: ประวัติการดำเนินการ */}
      {historyEmpId && (
        <ReservationHistoryModal
          courseId={course.id}
          empId={historyEmpId}
          onClose={() => setHistoryEmpId(null)}
        />
      )}
    </div>
  );
}

// ─── ReservationHistoryModal — ดูประวัติการจอง/ยกเลิกของพนักงานในหลักสูตร ───
function ReservationHistoryModal({ courseId, empId, onClose }) {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('action, details, actor, timestamp')
          .in('action', ['BOOK_CLASS','CANCEL_RESERVATION','BOOK_CLASS_BACKFILL','CANCEL_RESERVATION_BACKFILL'])
          .eq('details->>course_id', courseId)
          .eq('details->>emp_id', empId)
          .order('timestamp', { ascending: false });
        if (cancelled) return;
        if (error) throw error;
        setLogs(data || []);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, empId]);

  const actionLabel = (a) => {
    if (a === 'BOOK_CLASS') return { label: 'ลงทะเบียน', color: 'bg-green-100 text-green-700 border-green-200' };
    if (a === 'CANCEL_RESERVATION') return { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 border-red-200' };
    if (a === 'BOOK_CLASS_BACKFILL') return { label: 'ลงทะเบียน (backfill)', color: 'bg-gray-100 text-gray-600 border-gray-200' };
    if (a === 'CANCEL_RESERVATION_BACKFILL') return { label: 'ยกเลิก (backfill)', color: 'bg-gray-100 text-gray-600 border-gray-200' };
    return { label: a, color: 'bg-gray-100 text-gray-700 border-gray-200' };
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-gray-900/55" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/60">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900">ประวัติการดำเนินการ</h3>
            <p className="text-xs text-gray-500 mt-0.5">รหัสพนักงาน {empId}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full min-w-[40px] min-h-[40px] flex items-center justify-center" aria-label="ปิด">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-auto p-4 sm:p-6 flex-1">
          {error ? (
            <p className="text-sm text-red-600">เกิดข้อผิดพลาด: {error}</p>
          ) : logs === null ? (
            <p className="loading-state text-sm text-gray-400 italic text-center py-6">กำลังโหลด...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-6">ไม่มีประวัติการดำเนินการ</p>
          ) : (
            <ol className="relative border-l-2 border-gray-200 ml-2 space-y-4">
              {logs.map((log, i) => {
                const { label, color } = actionLabel(log.action);
                const d = log.details || {};
                const performerEmail = d.performer_email || '-';
                const performerEmp = d.performer_emp_id || '-';
                const onBehalf = d.on_behalf;
                return (
                  <li key={i} className="ml-4">
                    <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white"></span>
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${color}`}>{label}</span>
                      <span className="text-[11px] text-gray-500">{log.timestamp ? new Date(log.timestamp).toLocaleString('th-TH') : '-'}</span>
                    </div>
                    <div className="text-xs text-gray-700 space-y-0.5">
                      <p><span className="text-gray-500">ผู้ดำเนินการ:</span> <span className="font-medium">{log.actor || '-'}</span></p>
                      <p className="text-gray-500">รหัสผู้ดำเนินการ: <span className="text-gray-700 font-medium">{performerEmp}</span> {onBehalf && <span className="text-orange-600">(ดำเนินการแทน)</span>}</p>
                      <p className="text-gray-500">อีเมล: <span className="text-gray-700">{performerEmail}</span></p>
                      {d.class_id && <p className="text-gray-500">คลาส: <span className="text-gray-700 font-mono text-[10px]">{d.class_id}</span></p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div className="px-4 sm:px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 min-h-[40px]">ปิด</button>
        </div>
      </div>
    </div>
  );
}

// ─── ส่วนหนึ่งของ Dashboard (Div/Dept/Section) — chip กดกรองได้ ──
//   หลอด = registered / eligible — ครบ 100% หลอดเขียว, ไม่ครบหลอดเทา
function DashSection({ title, field, counts, filter, focused, hasFilter, onToggle }) {
  if (counts.length === 0) return null;
  const activeSet = filter[field];
  return (
    <div>
      <p className="text-xs font-bold text-gray-600 mb-2">{title}</p>
      <div className="space-y-1">
        {counts.map(([val, eligible, registered]) => {
          const isActive = activeSet.has(val);
          // ถ้ามี filter อยู่ และ val ไม่อยู่ในขอบเขต focus -> จาง
          const isDimmed = hasFilter && !isActive && focused && !focused.has(val);
          const pct = eligible > 0 ? Math.round((registered / eligible) * 100) : 0;
          const isComplete = eligible > 0 && registered >= eligible;
          // สีของหลอด: เขียวเข้มเมื่อครบ, เทาเมื่อยังไม่ครบ; ฟ้าตอน active filter
          const barColor = isActive
            ? (isComplete ? 'bg-green-300/70' : 'bg-blue-200/60')
            : (isComplete ? 'bg-green-300' : 'bg-gray-200');
          return (
            <button
              key={val}
              type="button"
              onClick={() => onToggle(field, val)}
              className={`w-full text-left relative overflow-hidden rounded px-2 py-1.5 text-xs border transition-all ${
                isActive
                  ? 'border-blue-400 text-blue-800 font-medium bg-white'
                  : 'bg-white border-gray-200 hover:border-blue-300'
              } ${isDimmed ? 'opacity-30 grayscale' : ''}`}
              title={`${val}: ลงทะเบียน ${registered}/${eligible} คน (${pct}%)${isDimmed ? ' — นอกขอบเขตที่เลือก' : ''}`}
            >
              <span
                className={`absolute inset-y-0 left-0 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex justify-between gap-2 items-center">
                <span className="truncate">{val}</span>
                <span className={`font-bold flex-shrink-0 ${isComplete ? 'text-green-700' : 'text-gray-700'}`}>
                  {registered}/{eligible}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sortable Class Grid ─────────────────────────────────────
function SortableClassGrid({ course, onEdit, onView, onReorder }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = course.classes.findIndex(c => c.id === active.id);
    const newIndex = course.classes.findIndex(c => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(course.classes, oldIndex, newIndex);
    onReorder(newOrder.map(c => c.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={course.classes.map(c => c.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {course.classes.map(cls => (
            <SortableClassCard key={cls.id} cls={cls} onEdit={() => onEdit(cls)} onView={() => onView(cls)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableClassCard({ cls, onEdit, onView }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cls.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto'
  };
  return (
    <div ref={setNodeRef} style={style} className="border border-gray-200 rounded-xl p-4 hover:border-blue-500 hover:shadow-md transition-all group relative bg-white">
      <button type="button" {...listeners} {...attributes} className="absolute top-3 left-3 p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded cursor-grab active:cursor-grabbing touch-none" title="ลากเพื่อเรียงลำดับ" aria-label="ลากเรียงลำดับ">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/>
          <circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
        </svg>
      </button>
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1.5 bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 rounded" title="แก้ไขคลาส">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        </button>
      </div>
      <div className="flex justify-between items-start mb-2 px-8 cursor-pointer" onClick={onView}>
        <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{cls.name || cls.date}</h4>
        <span className={`text-sm font-medium px-2 py-0.5 rounded ${cls.participants.length >= cls.max_seats ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
          {cls.participants.length}/{cls.max_seats}
        </span>
      </div>
      <div onClick={onView} className="cursor-pointer">
        <p className="text-sm text-gray-600 mb-2">
          <FormattedDate dateStr={cls.date} compact /> | {cls.start_time} - {cls.end_time}
        </p>
        {cls.location && (
          <p className="text-xs text-gray-500 flex items-center mb-1">
            <svg className="w-3.5 h-3.5 mr-1 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="truncate">{cls.location}</span>
          </p>
        )}
        <p className="text-blue-600 font-medium text-sm mt-3">ดูรายชื่อผู้ลงทะเบียน →</p>
      </div>
    </div>
  );
}
