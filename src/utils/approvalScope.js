// ─── Approval Scope Logic ───────────────────────────────────────────────
// Level convention (ตามองค์กรของ Boss):
//   L1  = ต่ำสุด (พนักงานระดับล่าง)
//   L10 = สูงสุด (ผู้บริหาร)
//   → เลข L มากกว่า = ระดับสูงกว่า
//
// Rules:
//   1. หัวหน้าต้อง Level สูงกว่าหรือเท่ากับ approver_level
//      → levelToNumber(approver.level) >= levelToNumber(course.approver_level)
//   2. ถ้า approver_ids กำหนดรายชื่อไว้ → ใช้ตามนั้น (เฉพาะคนที่ระบุ)
//      → ปล่อยให้คนเหล่านั้นเห็นได้ไม่ว่า level จะเป็นอะไร
//   3. พนักงานในสายงานต้อง Level "ต่ำกว่า" หัวหน้า (เลข L น้อยกว่า)
//   4. ต้องอยู่ Division เดียวกัน (เข้ม)
//   5. Section/Dept ที่ว่าง → หัวหน้าระดับเหนือกว่าใน Division ดูแล

export function levelToNumber(levelStr) {
  if (!levelStr) return 0;
  const match = String(levelStr).match(/L(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * approver level สูงกว่าหรือเท่ากับ required level → eligible
 * (L10 ≥ L7 → ผ่าน)
 */
export function isApproverLevelEligible(approverLevel, requiredLevel) {
  if (!requiredLevel) return true;
  return levelToNumber(approverLevel) >= levelToNumber(requiredLevel);
}

/**
 * ตรวจว่า user คนนี้เป็น approver สำหรับ course นี้หรือไม่
 *
 * Rule:
 *   1. ถ้า course.approver_ids มีรายชื่อ → user ต้องอยู่ใน list (override)
 *   2. ถ้าไม่มี → user.level ต้องสูงกว่าหรือเท่ากับ course.approver_level
 */
export function isApproverFor(user, course) {
  if (!user || !course) return false;
  if (course.selection_mode !== 'approver') return false;

  const ids = course.approver_ids || [];
  if (ids.length > 0) {
    return ids.includes(user.id);
  }

  return isApproverLevelEligible(user.level, course.approver_level);
}

/**
 * คำนวณ list พนักงานในสายงานที่ approver สามารถจัดการได้
 *
 * Rule:
 *   - พนักงานในสายงานต้อง Level "ต่ำกว่า" approver
 *   - ต้องอยู่ใน Division เดียวกัน (เข้ม)
 *   - Logic ตามขอบเขต Dept/Section
 */
export function getSubordinates(approver, allEmployees) {
  if (!approver || !allEmployees) return [];

  const approverLevelNum = levelToNumber(approver.level);

  return allEmployees.filter(emp => {
    if (!emp || emp.id === approver.id) return false;
    if (emp.is_deleted) return false;

    // 1. พนักงานในสายงานต้อง Level ต่ำกว่าหัวหน้า (เลข L น้อยกว่า)
    const empLevelNum = levelToNumber(emp.level);
    if (empLevelNum >= approverLevelNum) return false;

    // 2. ต้องอยู่ใน Division เดียวกัน (เข้ม)
    if ((emp.division || '') !== (approver.division || '')) return false;
    if (!approver.division) return false; // หัวหน้าที่ไม่มี division → ไม่มีพนักงานในสายงาน

    // 3. Logic ตามสายงาน
    const approverHasDept = !!(approver.dept || '').trim();
    const approverHasSection = !!(approver.section || '').trim();

    if (!approverHasDept) return true;  // หัวหน้าระดับ Division → ดูแลทั้ง Division

    // หัวหน้ามี Dept ระบุ -> ลูกน้องต้องมี Dept ตรงกัน
    if (emp.dept !== approver.dept) return false;

    if (!approverHasSection) return true; // หัวหน้าระดับ Dept (ไม่มี Section) -> ดูแลทั้ง Dept

    // หัวหน้ามี Section ระบุ -> ลูกน้องต้องมี Section ตรงกัน
    return emp.section === approver.section;
  });
}

/**
 * ตรวจว่าพนักงานคนนี้เข้าเงื่อนไข target audience ของหลักสูตรหรือไม่
 */
export function matchesTargetConditions(emp, tc) {
  if (!tc) return false;
  return (
    (!tc.site?.length || tc.site.includes(emp.site)) &&
    (!tc.division?.length || tc.division.includes(emp.division)) &&
    (!tc.dept?.length || tc.dept.includes(emp.dept)) &&
    (!tc.section?.length || tc.section.includes(emp.section)) &&
    (!tc.level?.length || tc.level.includes(emp.level))
  );
}

/**
 * คัดพนักงานในสายงานที่ "เกี่ยวข้องกับ course นี้" คือ:
 *   - อยู่ใน mandatory_list  หรือ
 *   - match target_conditions (กรณี allow_request)
 * และ ต้องอยู่ใน scope ของ approver (Level + Division)
 */
export function getEligibleSubordinatesForCourse(approver, allEmployees, course) {
  if (!isApproverFor(approver, course)) return [];

  const subs = getSubordinates(approver, allEmployees);
  return subs.filter(emp => {
    const inMandatory = (course.mandatory_list || []).includes(emp.id);
    const matchTC = course.allow_request && matchesTargetConditions(emp, course.target_conditions);
    return inMandatory || matchTC;
  });
}

// ─── Assigner Logic — ฟีเจอร์มอบหมายแบบกลุ่ม ─────────────────────────────
// assignment_groups = array ของกลุ่ม แต่ละกลุ่ม { assigners: [empId], participants: [empId] }
// ผู้จัดคลาส (assigner) ในกลุ่มจะจัดคลาสได้เฉพาะผู้เข้าร่วม (participants) ในกลุ่มเดียวกัน
// 1 หลักสูตรมีได้หลายกลุ่ม และทำงานร่วมกับโหมด "หัวหน้าเลือก" (approver) ได้

/**
 * ดึง assignment_groups ของ course แบบปลอดภัย (คืน array เสมอ)
 */
function getAssignmentGroups(course) {
  if (!course) return [];
  const groups = course.assignment_groups;
  if (Array.isArray(groups)) return groups;
  // เผื่อ jsonb ถูกเก็บเป็น string
  if (typeof groups === 'string') {
    try {
      const parsed = JSON.parse(groups);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * ตรวจว่า user คนนี้เป็น "ผู้ถูกมอบหมาย" (assigner) ในหลักสูตรนี้หรือไม่
 * — user.id ต้องอยู่ในช่อง assigners ของกลุ่มใดกลุ่มหนึ่ง
 */
export function isAssignerFor(user, course) {
  if (!user || !course) return false;
  return getAssignmentGroups(course).some(g =>
    Array.isArray(g?.assigners) && g.assigners.includes(user.id)
  );
}

/**
 * ตรวจว่า user มีสิทธิ์จัดคลาสในหลักสูตรนี้หรือไม่
 *   - isAdmin = true  -> จัดการได้ทุกหลักสูตร
 *   - หรือเป็น approver / assigner ของหลักสูตรนั้น
 */
export function canManageCourse(user, course, isAdmin = false) {
  if (isAdmin) return true;
  return isApproverFor(user, course) || isAssignerFor(user, course);
}

/**
 * คืนรหัสผู้เข้าร่วมที่ user (ในฐานะ assigner) ดูแลได้ — รวมจากทุกกลุ่มที่ user เป็น assigner
 */
export function getAssignedParticipantIds(user, course) {
  if (!user || !course) return [];
  const ids = new Set();
  getAssignmentGroups(course).forEach(g => {
    if (Array.isArray(g?.assigners) && g.assigners.includes(user.id)) {
      (g.participants || []).forEach(pid => ids.add(pid));
    }
  });
  return [...ids];
}

/**
 * คืนผู้เข้าร่วม "ทั้งหมด" ของหลักสูตร (mandatory_list + คน match เงื่อนไข ถ้าคลาสเปิด)
 * — ใช้สำหรับ admin ที่จัดการได้ทุกคน
 */
export function getAllCourseParticipants(allEmployees, course) {
  if (!allEmployees || !course) return [];
  const ids = new Set((course.mandatory_list || []).filter(Boolean));
  if (course.allow_request && course.target_conditions) {
    allEmployees.forEach(emp => {
      if (emp && !emp.is_deleted && matchesTargetConditions(emp, course.target_conditions)) {
        ids.add(emp.id);
      }
    });
  }
  const empMap = {};
  allEmployees.forEach(e => { if (e) empMap[e.id] = e; });
  return [...ids]
    .map(id => empMap[id] || { id, site: '-', division: '-', dept: '-', section: '-', level: '-' })
    .filter(e => !e.is_deleted);
}

/**
 * คัดรายชื่อคนที่ user สามารถจัดคลาสได้ในหลักสูตรนี้:
 *   - isAdmin = true       -> ได้ผู้เข้าร่วมทุกคนของหลักสูตร
 *   - ส่วนที่เป็น assigner -> ได้เฉพาะผู้เข้าร่วมในกลุ่มที่ตัวเองถูกมอบหมาย
 *   - ส่วนที่เป็น approver  -> ได้ลูกน้องในสายงาน
 *   - ถ้าเป็นหลายบทบาท -> รวมทุกชุด (ไม่ซ้ำ)
 */
export function getManageableParticipants(user, allEmployees, course, isAdmin = false) {
  if (!user || !allEmployees || !course) return [];

  // Admin -> เห็นผู้เข้าร่วมทั้งหมดของหลักสูตร
  if (isAdmin) {
    return getAllCourseParticipants(allEmployees, course);
  }

  const resultIds = new Set();

  // จาก assignment groups
  getAssignedParticipantIds(user, course).forEach(id => resultIds.add(id));

  // จาก approver scope (ถ้าเป็นหัวหน้าด้วย)
  if (isApproverFor(user, course)) {
    getEligibleSubordinatesForCourse(user, allEmployees, course)
      .forEach(emp => resultIds.add(emp.id));
  }

  // map id -> employee object (เฉพาะที่หา record เจอ)
  const empMap = {};
  allEmployees.forEach(e => { if (e) empMap[e.id] = e; });
  return [...resultIds]
    .map(id => empMap[id] || { id, site: '-', division: '-', dept: '-', section: '-', level: '-' })
    .filter(e => !e.is_deleted);
}
