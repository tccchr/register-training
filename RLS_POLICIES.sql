-- ═══════════════════════════════════════════════════════════════════
-- RLS POLICIES — ระบบจองคลาสเรียน
-- ไฟล์นี้สำหรับให้ IT ตรวจสอบ + เป็น reference ของ Security setup
--
-- หมายเหตุ: policies เหล่านี้ถูก apply ลง Supabase แล้ว
-- ไฟล์นี้คือสำเนาเพื่อการตรวจสอบ / re-deploy หากจำเป็น
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ───────────────────────────────────────────────────────────────────

-- email ของผู้ login อยู่ (จาก JWT) — lowercase
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT lower(coalesce(auth.jwt() ->> 'email', '')); $$;

-- ตรวจว่าผู้ login เป็น admin หรือไม่
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE lower(email) = public.current_user_email()
  );
$$;

-- employee id ของผู้ login (map email -> employees)
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.employees
  WHERE lower(email) = public.current_user_email()
    AND is_deleted = false
  LIMIT 1;
$$;

-- ───────────────────────────────────────────────────────────────────
-- RLS POLICIES
-- หลักการ: ทุกตารางต้อง authenticated / เขียนได้เฉพาะ admin หรือผ่าน RPC
-- ───────────────────────────────────────────────────────────────────

-- EMPLOYEES — อ่าน: เฉพาะ row ตัวเอง หรือ admin | เขียน: admin
-- (พนักงานทั่วไปดึงรายชื่อคนอื่นผ่าน RPC get_employees_list ซึ่งปกปิด email)
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY emp_select_self_or_admin ON public.employees FOR SELECT TO authenticated
  USING (public.is_admin() OR lower(email) = public.current_user_email());
CREATE POLICY emp_admin_insert ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY emp_admin_update ON public.employees FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY emp_admin_delete ON public.employees FOR DELETE TO authenticated USING (public.is_admin());

-- COURSES — อ่าน: authenticated | เขียน: admin
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY course_select       ON public.courses FOR SELECT TO authenticated USING (true);
CREATE POLICY course_admin_insert ON public.courses FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY course_admin_update ON public.courses FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY course_admin_delete ON public.courses FOR DELETE TO authenticated USING (public.is_admin());

-- CLASSES — อ่าน: authenticated | เขียน: admin
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_select       ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY class_admin_insert ON public.classes FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY class_admin_update ON public.classes FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY class_admin_delete ON public.classes FOR DELETE TO authenticated USING (public.is_admin());

-- RESERVATIONS — อ่าน: authenticated | เขียนตรง: admin (ปกติผ่าน RPC)
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY res_select       ON public.reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY res_admin_insert ON public.reservations FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY res_admin_update ON public.reservations FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY res_admin_delete ON public.reservations FOR DELETE TO authenticated USING (public.is_admin());

-- ADMIN_USERS — อ่าน/เขียน: admin เท่านั้น
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_users_select ON public.admin_users FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_users_insert ON public.admin_users FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY admin_users_delete ON public.admin_users FOR DELETE TO authenticated USING (public.is_admin());

-- AUDIT_LOGS — อ่าน: admin | เขียน: ผ่าน RPC log_action เท่านั้น
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_admin_select ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

-- ───────────────────────────────────────────────────────────────────
-- RPC PERMISSIONS — revoke จาก anon/public, grant เฉพาะ authenticated
-- ───────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.book_class(text, text, text, boolean)  FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation(text, text)         FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.log_action(text, jsonb, text)          FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_employees_list()                   FROM public, anon;

GRANT  EXECUTE ON FUNCTION public.book_class(text, text, text, boolean)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cancel_reservation(text, text)         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.log_action(text, jsonb, text)          TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_employees_list()                   TO authenticated;

-- หมายเหตุ: get_employees_list() คือประตูเดียวที่ frontend ใช้ดึงรายชื่อพนักงาน
--   - ปกปิด email สำหรับผู้ที่ไม่ใช่ admin
--   - บันทึก audit log ทุกครั้งที่ผู้ที่ไม่ใช่ admin เรียก (action = EMPLOYEE_LIST_ACCESS)

-- ═══════════════════════════════════════════════════════════════════
-- หมายเหตุการตรวจสอบสำหรับ IT:
--   - RPC book_class / cancel_reservation เป็น SECURITY DEFINER
--     และตรวจ auth.uid() + สิทธิ์ภายใน (เจ้าของ / หัวหน้า / admin) ทุกครั้ง
--   - ไม่มี policy ใดที่เปิดให้ role `anon` (ผู้ไม่ login) เข้าถึง
--   - service_role key ไม่ถูกใช้ใน frontend
-- ═══════════════════════════════════════════════════════════════════
