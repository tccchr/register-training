-- ═══════════════════════════════════════════════════════════════════
-- SQL สำหรับเปิดใช้งานระบบยอมรับนโยบายความเป็นส่วนตัว (PDPA)
-- ═══════════════════════════════════════════════════════════════════
-- กรุณานำสคริปต์นี้ไปรันในเมนู SQL Editor ของ Supabase
-- ───────────────────────────────────────────────────────────────────

-- 1. เพิ่มคอลัมน์ accepted_privacy_at ลงในตาราง employees
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS accepted_privacy_at timestamp with time zone;

-- 2. สร้าง RPC Function (SECURITY DEFINER) 
-- หน้าที่: ให้พนักงานกดยอมรับนโยบายได้ด้วยตนเองผ่าน Web UI 
-- โดยที่ฟังก์ชันจะเช็คให้แน่ใจว่าอีเมลตรงกับผู้ใช้ที่ล็อกอินอยู่ เพื่อป้องกันการปลอมแปลง
CREATE OR REPLACE FUNCTION public.accept_privacy_policy()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.employees
  SET accepted_privacy_at = now()
  WHERE lower(email) = public.current_user_email()
    AND is_deleted = false;
END;
$$;

-- 3. ให้สิทธิ์เฉพาะผู้ใช้ที่ล็อกอินเข้าสู่ระบบแล้ว (authenticated) เท่านั้นที่สามารถเรียกใช้ฟังก์ชันนี้ได้
REVOKE EXECUTE ON FUNCTION public.accept_privacy_policy() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_privacy_policy() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- หมายเหตุ: เมื่อรันคำสั่งสำเร็จ พนักงานที่เข้ามาใช้ระบบและในตาราง employees 
-- ที่คอลัมน์ accepted_privacy_at ยังเป็นค่าว่าง (null) จะเห็น Popup PDPA ให้กดยอมรับ
-- ═══════════════════════════════════════════════════════════════════
