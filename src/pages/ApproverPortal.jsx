import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter
} from '@dnd-kit/core';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import FormattedDate from '../components/FormattedDate';
import ClassDetailModal from '../components/ClassDetailModal';
import BrandLogo from '../components/BrandLogo';
import { ActionSummary, EmptyState, NavTab, PageIntro } from '../components/LayoutPrimitives';
import { canManageCourse, getManageableParticipants } from '../utils/approvalScope';

/**
 * ApproverPortal — หน้าจัดการคลาสให้พนักงานในสายงานแบบ Drag & Drop
 *
 * โครงสร้าง:
 *   1. Pool ด้านบน  → กล่องรวมพนักงานในสายงานที่ยังไม่ได้ assign
 *   2. Class slots  → กล่องของแต่ละ class — ลากชื่อพนักงานในสายงานมาวางได้
 *   3. Save button  → กดบันทึกเพื่อ commit ลง Supabase ที่เดียว
 *   4. Realtime     → ฟัง reservations channel แสดง "currentlyBooked / max"
 *                     ถ้าจำนวน pending + currentlyBooked เกิน max → แสดง warning
 */

export default function ApproverPortal({ adminMode = false }) {
  const { employee, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [allCourses, setAllCourses] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeCourseId, setActiveCourseId] = useState(null);

  // pending state: { courseId: { empId: classId | null } }
  //   ค่า null = พนักงานในสายงานคนนี้อยู่ใน pool (ไม่ได้ assign)
  //   ค่า "classX_id" = พนักงานในสายงานอยู่ใน class นี้
  const [pending, setPending] = useState({});
  const [savedSnapshot, setSavedSnapshot] = useState({});   // snapshot ของข้อมูลใน DB ล่าสุด

  const [activeDragId, setActiveDragId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });
  const [viewClassDetail, setViewClassDetail] = useState(null);

  const channelRef = useRef(null);
  const loadRequestRef = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // ─── Realtime: ฟัง reservations เพื่อ update count ───────────
  useEffect(() => {
    if (!employee) return;
    // ปิด channel เก่าก่อนเสมอ กัน subscription ซ้อนกันเวลาสลับหน้าบ่อยๆ
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // ตั้งชื่อ channel ให้ไม่ซ้ำกัน (ผูกกับ employee.id) — กัน channel ชนกัน
    const channel = supabase
      .channel(`approver-realtime-${adminMode ? 'admin' : 'sup'}-${employee.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' },
        async () => {
          const { data } = await supabase.from('reservations').select('*').eq('is_deleted', false);
          if (data) setReservations(data);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [employee, adminMode]);

  const loadData = useCallback(async (emp) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    try {
      const [
        { data: coursesData },
        { data: classesData },
        { data: reservationsData },
        { data: employeesData }
      ] = await Promise.all([
        supabase.from('courses').select('*').eq('is_deleted', false),
        supabase.from('classes').select('*').eq('is_deleted', false).order('sort_order'),
        supabase.from('reservations').select('*').eq('is_deleted', false),
        supabase.rpc('get_employees_list')
      ]);

      if (requestId !== loadRequestRef.current) return;

      const finalCourses = (coursesData || [])
        .filter(c => canManageCourse(emp, c, adminMode))
        .map(c => ({
          ...c,
          classes: (classesData || []).filter(cls => cls.course_id === c.id)
        }));

      setAllCourses(finalCourses);
      setAllEmployees(employeesData || []);
      setReservations(reservationsData || []);

      // สร้าง pending state จาก reservations ปัจจุบัน
      const initialPending = {};
      finalCourses.forEach(c => {
        const subs = getManageableParticipants(emp, employeesData || [], c, adminMode);
        const courseMap = {};
        subs.forEach(sub => {
          const res = (reservationsData || []).find(r => r.emp_id === sub.id && r.course_id === c.id);
          courseMap[sub.id] = res ? res.class_id : null;
        });
        initialPending[c.id] = courseMap;
      });
      setPending(initialPending);
      setSavedSnapshot(JSON.parse(JSON.stringify(initialPending)));

      setActiveCourseId(prev =>
        finalCourses.some(course => course.id === prev) ? prev : (finalCourses[0]?.id || null)
      );
    } catch (err) {
      if (requestId === loadRequestRef.current) console.error(err);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [adminMode]);

  useEffect(() => {
    loadRequestRef.current += 1;
    // รีเซ็ต state ตอนสลับโหมด (กันข้อมูลค้าง)
    setActiveCourseId(null);
    setPending({});
    setSavedSnapshot({});
    if (employee) loadData(employee);
  }, [employee, adminMode, loadData]);

  // ─── Computed: พนักงานในสายงานของหัวหน้าสำหรับ course ที่กำลังดูอยู่ ───
  const activeCourse = useMemo(() =>
    allCourses.find(c => c.id === activeCourseId),
    [allCourses, activeCourseId]
  );

  const subordinates = useMemo(() => {
    if (!employee || !activeCourse) return [];
    return getManageableParticipants(employee, allEmployees, activeCourse, adminMode);
  }, [employee, allEmployees, activeCourse, adminMode]);

  const currentPending = useMemo(() => (
    activeCourseId ? (pending[activeCourseId] || {}) : {}
  ), [pending, activeCourseId]);

  // ─── จัดกลุ่มพนักงานในสายงานตาม class (สำหรับ render) ────────────────
  const grouped = useMemo(() => {
    const result = { pool: [] };
    if (!activeCourse) return result;
    activeCourse.classes.forEach(cls => { result[cls.id] = []; });

    subordinates.forEach(sub => {
      const target = currentPending[sub.id];
      if (target && result[target] !== undefined) {
        result[target].push(sub);
      } else {
        result.pool.push(sub);
      }
    });
    return result;
  }, [activeCourse, subordinates, currentPending]);

  // ─── Realtime count per class — รวมการจองจริงใน DB + pending ──
  const getRealtimeCount = (clsId) => {
    if (!activeCourse) return { current: 0, max: 0, overflow: 0 };

    // เอาจาก DB จริง (ไม่นับ subordinates ของหัวหน้าคนนี้)
    const myEmpIds = new Set(subordinates.map(s => s.id));
    const otherBookings = reservations.filter(
      r => r.class_id === clsId && !myEmpIds.has(r.emp_id)
    ).length;

    // จาก pending ของหัวหน้าคนนี้
    const pendingInClass = Object.values(currentPending).filter(v => v === clsId).length;

    const cls = activeCourse.classes.find(c => c.id === clsId);
    const max = cls?.max_seats || 0;
    const current = otherBookings + pendingInClass;
    const overflow = Math.max(0, current - max);

    return { current, max, overflow, otherBookings, pendingInClass };
  };

  // ─── Has unsaved changes? ───────────────────────────────────
  const hasChanges = useMemo(() => {
    if (!activeCourseId) return false;
    return JSON.stringify(pending[activeCourseId] || {}) !==
           JSON.stringify(savedSnapshot[activeCourseId] || {});
  }, [pending, savedSnapshot, activeCourseId]);

  // ─── Drag handlers ──────────────────────────────────────────
  const handleDragStart = (e) => {
    setActiveDragId(e.active.id);
  };

  const handleDragEnd = (e) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;

    const empId = active.id;        // emp_xxx
    let targetClassId = over.id;    // 'pool' หรือ 'cls_xxx' หรือ 'emp_xxx' (ถ้า drop บน Draggable)

    // ถ้า drop บน emp_xxx ให้ resolve ไปยัง parent container
    if (typeof targetClassId === 'string' && targetClassId.startsWith('emp_')) {
      const parent = subordinates.find(s => `emp_${s.id}` === targetClassId);
      if (parent) {
        const cur = currentPending[parent.id];
        targetClassId = cur || 'pool';
      }
    }

    const actualEmpId = String(empId).replace(/^emp_/, '');

    setPending(prev => ({
      ...prev,
      [activeCourseId]: {
        ...(prev[activeCourseId] || {}),
        [actualEmpId]: targetClassId === 'pool' ? null : targetClassId
      }
    }));
  };

  // ─── เพิ่มรหัสพนักงานเข้าคลาส (ทางเลือกแทน drag-drop) ───
  // ใส่ได้เฉพาะคนที่อยู่ใน subordinates (manageable list) ของผู้ใช้
  const assignByCode = (classId, rawText) => {
    const ids = rawText.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return { added: 0, invalid: [] };
    const subSet = new Set(subordinates.map(s => s.id));
    const valid = ids.filter(id => subSet.has(id));
    const invalid = ids.filter(id => !subSet.has(id));
    if (valid.length === 0) return { added: 0, invalid };
    setPending(prev => {
      const cur = { ...(prev[activeCourseId] || {}) };
      valid.forEach(id => { cur[id] = classId; });
      return { ...prev, [activeCourseId]: cur };
    });
    return { added: valid.length, invalid };
  };

  // ─── Save: commit changes ทั้งหมดของ activeCourse ───────────
  const handleSave = () => {
    if (!activeCourse) return;

    // Pre-check: ตรวจ overflow ของทุก class
    const overflows = activeCourse.classes
      .map(cls => ({ cls, ...getRealtimeCount(cls.id) }))
      .filter(x => x.overflow > 0);

    if (overflows.length > 0) {
      const msg = overflows.map(x =>
        `• ${x.cls.name}: ${x.current}/${x.max} (เกิน ${x.overflow} คน)`
      ).join('\n');

      setConfirmConfig({
        isOpen: true,
        type: 'danger',
        title: 'ไม่สามารถบันทึกได้ — มีคลาสที่เกินจำนวน',
        message: `กรุณาย้ายพนักงานในสายงานออกก่อนจึงจะบันทึกได้:\n\n${msg}\n\nหมายเหตุ: ตัวเลขรวม "การจองล่าสุด" ของหัวหน้าคนอื่นด้วย (Realtime)`,
        confirmText: 'รับทราบ',
        onConfirm: () => setConfirmConfig({ isOpen: false }),
        onCancel: () => setConfirmConfig({ isOpen: false })
      });
      return;
    }

    setConfirmConfig({
      isOpen: true,
      type: 'info',
      title: 'ยืนยันการบันทึก',
      message: `คุณกำลังจะบันทึกการกำหนดคลาสของพนักงานในสายงานในหลักสูตร "${activeCourse.title}"`,
      confirmText: 'บันทึก',
      onConfirm: async () => {
        setConfirmConfig({ isOpen: false });
        await commitSave();
      },
      onCancel: () => setConfirmConfig({ isOpen: false })
    });
  };

  const commitSave = async () => {
    if (!activeCourse) return;
    setSaving(true);
    try {
      const curState = pending[activeCourseId] || {};
      const prevState = savedSnapshot[activeCourseId] || {};

      // diff
      const operations = [];
      for (const empId of Object.keys(curState)) {
        const newClsId = curState[empId];     // null = pool, string = class
        const oldClsId = prevState[empId];

        if (newClsId === oldClsId) continue;  // ไม่เปลี่ยน

        // ต้อง cancel reservation เดิม (ถ้ามี)
        if (oldClsId) {
          const oldRes = reservations.find(r => r.emp_id === empId && r.course_id === activeCourseId);
          if (oldRes) operations.push({ type: 'cancel', resId: oldRes.id, empId });
        }

        // ต้อง book ใหม่ (ถ้า new ไม่ใช่ null)
        if (newClsId) {
          const inPlan = (activeCourse.mandatory_list || []).includes(empId);
          operations.push({ type: 'book', empId, classId: newClsId, inPlan });
        }
      }

      // execute ตามลำดับ — cancel ก่อน แล้วค่อย book
      operations.sort((a, b) => {
        const rank = (op) => (op.type === 'cancel' ? 0 : 1);
        return rank(a) - rank(b);
      });

      const errors = [];
      for (const op of operations) {
        if (op.type === 'cancel') {
          const { data } = await supabase.rpc('cancel_reservation', {
            p_res_id: op.resId, p_emp_id: op.empId
          });
          if (data && !data.ok) errors.push(`ยกเลิก ${op.empId}: ${data.error}`);
        } else {
          const { data } = await supabase.rpc('book_class', {
            p_emp_id: op.empId,
            p_course_id: activeCourseId,
            p_class_id: op.classId,
            p_in_plan: op.inPlan
          });
          if (data && !data.ok) {
            const errMap = { FULL: 'คลาสเต็ม', ALREADY_BOOKED: 'จองแล้ว', COURSE_CLOSED: 'หลักสูตรปิด' };
            errors.push(`${op.empId}: ${errMap[data.error] || data.error}`);
          }
        }
      }

      if (errors.length > 0) {
        alert('บางรายการบันทึกไม่สำเร็จ:\n\n' + errors.slice(0, 10).join('\n'));
      } else {
        alert('✓ บันทึกสำเร็จ');
      }

      // reload
      await loadData(employee);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!activeCourseId) return;
    setPending(prev => ({
      ...prev,
      [activeCourseId]: JSON.parse(JSON.stringify(savedSnapshot[activeCourseId] || {}))
    }));
  };

  // ─── Badge: total pending across all courses ────────────────
  const totalPending = useMemo(() => {
    let total = 0;
    allCourses.forEach(c => {
      const subs = getManageableParticipants(employee, allEmployees, c, adminMode);
      subs.forEach(sub => {
        const hasRes = reservations.some(r => r.emp_id === sub.id && r.course_id === c.id);
        if (!hasRes) total++;
      });
    });
    return total;
  }, [allCourses, employee, allEmployees, reservations, adminMode]);

  if (!employee) return null;

  const activeDragEmp = subordinates.find(s => `emp_${s.id}` === activeDragId);
  const activeClassCounts = activeCourse
    ? activeCourse.classes.map(cls => ({ cls, ...getRealtimeCount(cls.id) }))
    : [];
  const overfullClassCount = activeClassCounts.filter(item => item.overflow > 0).length;
  const nearFullClassCount = activeClassCounts.filter(item => item.max > 0 && item.current >= item.max && item.overflow === 0).length;
  const assignedCount = Math.max(0, subordinates.length - (grouped.pool?.length || 0));
  const changedCount = activeCourseId
    ? Object.keys(currentPending).filter(empId => currentPending[empId] !== (savedSnapshot[activeCourseId] || {})[empId]).length
    : 0;

  return (
    <div className="min-h-screen bg-transparent pb-12">
      <header className="app-header bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          <div className="flex justify-between items-center py-3 sm:py-4 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <BrandLogo className="h-9 sm:h-10 w-auto flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="font-display text-base sm:text-xl font-bold text-gray-900 truncate">ระบบจองคลาสเรียน</h1>
                <p className="text-xs sm:text-sm font-medium text-blue-600 truncate">{employee.id} <span className="text-gray-500">({employee.level})</span></p>
              </div>
            </div>
            <button
              onClick={async () => { await signOut(); navigate('/login'); }}
              className="text-xs sm:text-sm font-medium text-gray-500 hover:text-gray-900 flex-shrink-0 min-h-[44px] px-2"
            >
              ออกจากระบบ
            </button>
          </div>
          <div className="mobile-tab-rail flex overflow-x-auto -mb-px">
            <NavTab to="/portal" current={location.pathname} label="หลักสูตรของฉัน" />
            <NavTab to="/calendar" current={location.pathname} label="ปฏิทินอบรม" />
            <NavTab to="/approve" current={location.pathname} label="จัดการพนักงานในสายงาน" badge={adminMode ? 0 : totalPending} />
            {isAdmin && <NavTab to="/admin/manage-classes" current={location.pathname} label="จัดคลาสให้พนักงาน (Admin)" />}
            {isAdmin && <NavTab to="/admin" current={location.pathname} label="จัดการระบบ (Admin)" />}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-8 sm:mt-10">
        <PageIntro
          className="mb-8 sm:mb-10"
          eyebrow={adminMode ? 'Admin class planning' : 'Team class planning'}
          title={adminMode ? 'จัดคลาสให้พนักงาน' : 'จัดการตารางเรียนพนักงานในสายงาน'}
          description={`${adminMode ? 'เลือกหลักสูตร แล้วจัดคนลงแต่ละรุ่นอบรมด้วยการลากหรือเพิ่มรหัสพนักงาน' : 'เลือกหลักสูตร แล้วลากชื่อพนักงานในสายงานไปวางในคลาสที่ต้องการ'} เมื่อจัดเรียบร้อยให้กดบันทึก`}
          maxWidth="max-w-3xl"
        />

        {loading ? (
          <div className="loading-state text-center py-12 text-gray-500">กำลังโหลด...</div>
        ) : allCourses.length === 0 ? (
          <EmptyState message="ไม่มีหลักสูตรที่ต้องให้คุณกำหนดคลาสในขณะนี้" />
        ) : (
          <>
            {/* Course Selector — Dropdown ในโหมด admin (หลักสูตรเยอะ), Tabs ในโหมดหัวหน้า */}
            {adminMode ? (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">เลือกหลักสูตร</label>
                <select
                  value={activeCourseId || ''}
                  onChange={(e) => setActiveCourseId(e.target.value)}
                  className="w-full sm:w-auto min-w-[280px] px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {allCourses.map(c => {
                    const subs = getManageableParticipants(employee, allEmployees, c, adminMode);
                    const unassigned = subs.filter(s => !reservations.some(r => r.emp_id === s.id && r.course_id === c.id)).length;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.title}{unassigned > 0 ? ` (ยังไม่กำหนด ${unassigned} คน)` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <div className="mobile-action-rail flex gap-2 mb-7 sm:mb-8 overflow-x-auto pb-1">
                {allCourses.map(c => {
                  const subs = getManageableParticipants(employee, allEmployees, c, adminMode);
                  const unassigned = subs.filter(s => !reservations.some(r => r.emp_id === s.id && r.course_id === c.id)).length;
                  const isActive = activeCourseId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveCourseId(c.id)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors min-h-[44px] flex items-center gap-2 ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-300'
                      }`}
                    >
                      {c.title}
                      {unassigned > 0 && (
                        <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full ${isActive ? 'bg-white text-blue-600' : 'bg-red-500 text-white'}`}>
                          {unassigned}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {activeCourse && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <ActionSummary
                  className="mb-6"
                  eyebrow={adminMode ? 'Admin assignment queue' : 'Team assignment queue'}
                  title={(grouped.pool?.length || 0) > 0 ? 'ยังมีพนักงานที่ไม่ได้ถูกจัดคลาส' : 'จัดคลาสครบแล้วสำหรับหลักสูตรนี้'}
                  description={hasChanges
                    ? 'มีรายการที่เปลี่ยนแปลงแล้ว รอตรวจจำนวนที่นั่งและกดบันทึก'
                    : 'ลากรายชื่อไปยังคลาสที่ต้องการ หรือเพิ่มด้วยรหัสพนักงานในแต่ละคลาส'}
                  items={[
                    { label: 'ยังไม่จัดคลาส', value: grouped.pool?.length || 0, tone: (grouped.pool?.length || 0) > 0 ? 'amber' : 'green', hint: 'อยู่ใน pool ด้านบน' },
                    { label: 'จัดแล้ว', value: assignedCount, tone: 'blue', hint: `${subordinates.length} คนในขอบเขตนี้` },
                    { label: 'เปลี่ยนแปลงค้าง', value: changedCount, tone: changedCount > 0 ? 'amber' : 'gray', hint: hasChanges ? 'ต้องกดบันทึก' : 'ตรงกับข้อมูลล่าสุด' },
                    { label: 'คลาสเต็ม/เกิน', value: overfullClassCount + nearFullClassCount, tone: overfullClassCount > 0 ? 'red' : 'gray', hint: overfullClassCount > 0 ? 'มีคลาสเกินจำนวน' : 'ตรวจที่นั่งก่อนบันทึก' }
                  ]}
                  action={hasChanges && (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex w-full sm:w-auto justify-center items-center px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors min-h-[44px] disabled:opacity-50"
                    >
                      {saving ? 'กำลังบันทึก...' : `บันทึก ${changedCount} รายการ`}
                    </button>
                  )}
                />

                {/* Save bar */}
                <div className="app-card mobile-sticky-actions rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-500">หลักสูตรปัจจุบัน</p>
                    <p className="font-bold text-gray-900 truncate">{activeCourse.title}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap w-full sm:w-auto">
                    {hasChanges && (
                      <button
                        onClick={handleReset}
                        className="w-full sm:w-auto justify-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg min-h-[44px]"
                      >
                        ยกเลิกการเปลี่ยนแปลง
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={!hasChanges || saving}
                      className={`w-full sm:w-auto justify-center px-6 py-2 text-sm font-bold rounded-lg min-h-[44px] shadow-sm transition-colors flex items-center gap-2 ${
                        !hasChanges || saving
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {saving ? 'กำลังบันทึก...' : (hasChanges ? 'บันทึกการเปลี่ยนแปลง' : 'บันทึกแล้ว')}
                    </button>
                  </div>
                </div>

                <section className="space-y-5">
                  {/* Pool */}
                  <Pool
                    subs={grouped.pool}
                    total={subordinates.length}
                  />

                  {/* Class slots */}
                  <div className={`grid grid-cols-1 gap-4 sm:gap-5 ${activeCourse.classes.length === 1 ? 'max-w-xl' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
                    {activeCourse.classes.map(cls => {
                      const count = getRealtimeCount(cls.id);
                      return (
                        <ClassSlot
                          key={cls.id}
                          cls={cls}
                          members={grouped[cls.id] || []}
                          count={count}
                          onViewDetail={() => setViewClassDetail(cls)}
                          onAssignByCode={(txt) => assignByCode(cls.id, txt)}
                        />
                      );
                    })}
                  </div>
                </section>

                <DragOverlay>
                  {activeDragEmp ? <DragCard sub={activeDragEmp} dragging /> : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </main>

      {viewClassDetail && (
        <ClassDetailModal
          cls={viewClassDetail}
          course={activeCourse}
          members={getClassMembersList(viewClassDetail.id, reservations, allEmployees)}
          onClose={() => setViewClassDetail(null)}
        />
      )}

      <ConfirmModal {...confirmConfig} />
    </div>
  );
}

// ─── Helper: ดึงรายชื่อสมาชิกจาก class id ─────────────────────
function getClassMembersList(classId, reservations, allEmployees) {
  const empMap = {};
  allEmployees.forEach(e => { empMap[e.id] = e; });
  return reservations
    .filter(r => r.class_id === classId)
    .map(r => empMap[r.emp_id])
    .filter(Boolean);
}

// ─── Pool Component (กล่องพนักงานในสายงานที่ยังไม่ได้ assign) ────────────
function Pool({ subs, total }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' });
  const [filter, setFilter] = useState({ site:'', division:'', dept:'', section:'', level:'' });

  // ตัวเลือกของแต่ละ filter — มาจาก subs จริง
  const uniq = (f) => [...new Set(subs.map(s => s[f]).filter(Boolean))].sort();
  const opts = {
    site: uniq('site'), division: uniq('division'),
    dept: uniq('dept'), section: uniq('section'), level: uniq('level')
  };

  const matches = (s) =>
    (!filter.site || s.site === filter.site) &&
    (!filter.division || s.division === filter.division) &&
    (!filter.dept || s.dept === filter.dept) &&
    (!filter.section || s.section === filter.section) &&
    (!filter.level || s.level === filter.level);
  const filtered = subs.filter(matches);
  const hasFilter = Object.values(filter).some(v => v);

  if (subs.length === 0) {
    return (
      <div
        ref={setNodeRef}
        className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
          isOver ? 'border-blue-400 bg-blue-50' : 'border-green-200 bg-green-50'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="font-bold text-green-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            พนักงานทุกคนถูกกำหนดคลาสครบแล้ว
          </p>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white text-green-700 border border-green-200">
            0 / {total} คนค้าง
          </span>
        </div>
        <p className="mt-2 text-sm text-green-700">ถ้าต้องการนำพนักงานออกจากคลาส ลากชื่อกลับมาวางบนแถบนี้ได้</p>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 border-dashed p-4 transition-colors ${
        isOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="font-bold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          พนักงานที่ยังไม่ได้กำหนดคลาส
        </p>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
          {hasFilter ? `${filtered.length}/${subs.length}` : `${subs.length} / ${total}`} คน
        </span>
      </div>

      {/* ─── Filter bar (5 มิติ) ─── */}
      {subs.length > 0 && (
        <div className="mb-3 p-2 bg-white/70 border border-gray-200 rounded-lg grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 items-center">
          <span className="text-[11px] font-medium text-gray-500 px-1">🔍 กรอง:</span>
          {[['site','Site'],['division','Division'],['dept','Dept'],['section','Section'],['level','Level']].map(([f,label]) => (
            <select
              key={f}
              value={filter[f]}
              onChange={(e) => setFilter({...filter, [f]: e.target.value})}
               className={`text-[11px] min-h-[44px] px-2 py-1 rounded border bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                filter[f] ? 'border-blue-400 text-blue-700 font-medium' : 'border-gray-300 text-gray-700'
              }`}
            >
              <option value="">{label}: ทั้งหมด</option>
              {opts[f].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}
          {hasFilter && (
            <button
              type="button"
              onClick={() => setFilter({ site:'', division:'', dept:'', section:'', level:'' })}
               className="text-[11px] font-medium text-red-600 hover:underline px-1 min-h-[44px]"
            >
              ล้าง
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 italic text-center py-4">
          {subs.length === 0 ? 'พนักงานทุกคนถูกกำหนดคลาสครบแล้ว' : 'ไม่มีพนักงานตามเงื่อนไขกรอง'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filtered.map(sub => <DragCard key={sub.id} sub={sub} />)}
        </div>
      )}
    </div>
  );
}

// ─── Class Slot Component (กล่องของแต่ละ class) ───────────────
function ClassSlot({ cls, members, count, onViewDetail, onAssignByCode }) {
  const { setNodeRef, isOver } = useDroppable({ id: cls.id });
  const isOverflow = count.overflow > 0;
  const isFull = count.current >= count.max;
  const [codeInput, setCodeInput] = useState('');
  const [hint, setHint] = useState(null);   // { ok, msg }

  const handleAdd = () => {
    if (!codeInput.trim() || !onAssignByCode) return;
    const { added, invalid } = onAssignByCode(codeInput);
    setCodeInput('');
    if (added > 0 && invalid.length === 0) setHint({ ok: true, msg: `เพิ่ม ${added} รหัส ✓` });
    else if (added > 0 && invalid.length > 0) setHint({ ok: true, msg: `เพิ่ม ${added} รหัส (ข้าม ${invalid.length} ไม่มีสิทธิ์)` });
    else setHint({ ok: false, msg: `ไม่มีรหัสไหนอยู่ในรายชื่อที่จัดได้: ${invalid.join(', ')}` });
    setTimeout(() => setHint(null), 4000);
  };

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 p-4 transition-colors ${
        isOver ? 'border-blue-400 bg-blue-50'
        : isOverflow ? 'border-red-400 bg-red-50'
        : 'border-gray-200 bg-white'
      }`}
    >
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="font-bold text-gray-900 truncate">{cls.name}</h3>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
            isOverflow ? 'bg-red-600 text-white animate-pulse'
            : isFull ? 'bg-orange-100 text-orange-700'
            : 'bg-green-100 text-green-700'
          }`}>
            {count.current} / {count.max}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          <FormattedDate dateStr={cls.date} compact /> • {cls.start_time} - {cls.end_time}
        </p>
        {cls.location && <p className="text-xs text-gray-400 truncate">📍 {cls.location}</p>}

        {/* ปุ่มดูรายละเอียดคลาส */}
        <button
          type="button"
          onClick={onViewDetail}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg border border-blue-200 transition-colors min-h-[32px]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          ดูรายละเอียดคลาส
        </button>
        {isOverflow && (
          <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-lg">
            <p className="text-xs font-bold text-red-700">⚠️ เกิน {count.overflow} คน</p>
            <p className="text-[10px] text-red-600 mt-0.5">
              จองล่าสุด (DB): {count.otherBookings} • กำลังจะเพิ่ม: {count.pendingInClass}
            </p>
          </div>
        )}
      </div>
      {/* เพิ่มรหัส (ทางเลือกแทนการลาก) */}
      {onAssignByCode && (
        <div className="mb-2 flex flex-col sm:flex-row gap-2 sm:gap-1">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            placeholder="ใส่รหัสพนักงาน + Enter"
            className="flex-1 min-w-0 text-xs px-2 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 min-h-[44px]"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="px-2.5 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-medium whitespace-nowrap min-h-[44px]"
          >
            + เพิ่ม
          </button>
        </div>
      )}
      {hint && (
        <p className={`text-[10px] mb-2 ${hint.ok ? 'text-green-600' : 'text-red-600'}`}>{hint.msg}</p>
      )}
      <div className="min-h-[80px] space-y-1.5">
        {members.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-4 border-2 border-dashed border-gray-200 rounded-lg">
            ลากชื่อมาวาง หรือพิมพ์รหัสด้านบน
          </p>
        ) : (
          members.map(sub => <DragCard key={sub.id} sub={sub} />)
        )}
      </div>
    </div>
  );
}

// ─── Draggable Card (ตัวการ์ดที่ลากได้) ────────────────────────
function DragCard({ sub, dragging }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `emp_${sub.id}` });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white shadow-sm cursor-grab active:cursor-grabbing select-none touch-none ${
        dragging ? 'opacity-95 ring-2 ring-blue-400 shadow-lg' : 'border-gray-200 hover:border-blue-300'
      } ${isDragging ? 'opacity-30' : ''}`}
      style={{ minHeight: 44 }}
    >
      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
        {(sub.id || '').substring(0, 2)}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-900 leading-tight">{sub.id}</p>
        <p className="text-[10px] text-gray-500 leading-tight">{sub.level} • {sub.division || '-'}</p>
      </div>
    </div>
  );
}
