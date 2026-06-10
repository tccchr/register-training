# Security Architecture — ระบบจองคลาสเรียน

เอกสารนี้สรุปสถาปัตยกรรมด้านความปลอดภัยของระบบ สำหรับให้ทีม IT ตรวจสอบก่อนอนุมัติ Deploy

---

## 1. ภาพรวม

| ด้าน | รายละเอียด |
|---|---|
| Frontend | React + Vite (Static site — Deploy บน GitHub Pages) |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Authentication | Microsoft 365 (Azure AD) ผ่าน Supabase OAuth |
| Authorization | Row Level Security (RLS) ทุกตาราง + Role table |

---

## 2. การยืนยันตัวตน (Authentication)

- ผู้ใช้ **ต้อง Login ด้วยบัญชี Microsoft 365 ขององค์กร** เท่านั้น
- ระบบ **ไม่มีการเก็บรหัสผ่าน** ใดๆ — มอบหน้าที่นี้ให้ Azure AD ทั้งหมด
- หลัง Azure ยืนยันตัวตน → ระบบนำ email ไป map กับตาราง `employees`
- ถ้า email **ไม่มี**ในตาราง `employees` → ระบบปฏิเสธการเข้าใช้งาน (แสดง "ไม่พบสิทธิ์การเข้าใช้งาน")

ผลลัพธ์: ไม่มีทางสวมรอยเป็นพนักงานคนอื่นได้ เพราะต้องผ่านรหัส M365 จริง

---

## 3. การกำหนดสิทธิ์ (Authorization)

### Role
- **User (พนักงานทั่วไป)** — email อยู่ใน `employees` แต่ไม่อยู่ใน `admin_users`
- **Admin** — email อยู่ในตาราง `admin_users`

Admin จัดการรายชื่อ Admin คนอื่นได้ผ่านหน้า "จัดการสิทธิ์ Admin" (ไม่ต้องแก้โค้ด)

### Row Level Security (RLS)
เปิด RLS ทุกตาราง — **ไม่มีตารางใดที่เปิดให้ `anon` (ผู้ไม่ login) เข้าถึง**

| ตาราง | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `employees` | authenticated | admin เท่านั้น |
| `courses` | authenticated | admin เท่านั้น |
| `classes` | authenticated | admin เท่านั้น |
| `reservations` | authenticated | ผ่าน RPC เท่านั้น (admin แก้ตรงได้) |
| `admin_users` | admin เท่านั้น | admin เท่านั้น |
| `audit_logs` | admin เท่านั้น | ผ่าน RPC เท่านั้น |

### RPC Functions (SECURITY DEFINER)
- `book_class`, `cancel_reservation` — ตรวจ `auth.uid()` ทุกครั้ง
  - ผู้ใช้จอง/ยกเลิกได้เฉพาะของตัวเอง
  - หัวหน้าจัดการได้เฉพาะพนักงานในสายงาน (ตรวจ Division + Level)
  - Admin จัดการได้ทุกคน
- `EXECUTE` ถูก revoke จาก `anon`/`public` — เรียกได้เฉพาะ `authenticated`

---

## 4. การปกป้องข้อมูลส่วนบุคคล (PDPA)

- ข้อมูลพนักงาน (ชื่อ, แผนก, ระดับ) **ไม่เปิดเผยต่อสาธารณะ** — ต้อง login ก่อน
- ไม่มี PII ใดๆ แสดงในหน้า Login หรือก่อนยืนยันตัวตน
- `audit_logs` บันทึกการกระทำสำคัญ (สร้าง/ลบหลักสูตร, เพิ่ม/ลบ admin) เพื่อ traceability

### 4.1 การปกป้อง Email (Defense in Depth)

ออกแบบเพื่อจำกัดความเสียหายกรณีบัญชี M365 ของพนักงานคนใดคนหนึ่งถูกขโมย:

- **email ของพนักงานถือเป็นข้อมูลอ่อนไหวสูงสุด** (ใช้โจมตี phishing ได้)
- พนักงานทั่วไป **เห็น email ของตัวเองเท่านั้น** — ไม่เห็น email ของคนอื่น
  - RLS `employees`: SELECT row อื่นได้เฉพาะ admin
  - การดึงรายชื่อทั่วไปทำผ่าน RPC `get_employees_list()` ซึ่ง **ปกปิด email** สำหรับผู้ที่ไม่ใช่ admin
- ผลลัพธ์: ต่อให้ผู้ไม่หวังดีเข้าระบบได้ และดึงรายชื่อพนักงานออกไป
  ก็จะได้แค่ ชื่อ + แผนก (ข้อมูลระดับผังองค์กร) — **ไม่มี email** จึงนำไป phishing ไม่ได้

### 4.2 Audit การเข้าถึงรายชื่อพนักงาน

- การดึงรายชื่อพนักงานทั้งหมด **บังคับผ่าน RPC `get_employees_list()` เท่านั้น**
  (SELECT ตรงของตาราง `employees` ถูกปิดสำหรับ non-admin)
- ทุกครั้งที่ **ผู้ที่ไม่ใช่ admin** ดึงรายชื่อ → ระบบบันทึกลง `audit_logs`
  - `action = EMPLOYEE_LIST_ACCESS`
  - บันทึก: email ผู้เรียก, จำนวน row, เวลา, และ flag `LARGE_QUERY` ถ้าเกิน 100 ราย
- ผู้ดูแลตรวจสอบย้อนหลังได้ที่ Supabase Dashboard → Table Editor → `audit_logs`
  → filter `action = EMPLOYEE_LIST_ACCESS` เพื่อดูพฤติกรรมที่ผิดปกติ

---

## 5. การจัดการ Secret / Key

| Key | เก็บที่ไหน | ปลอดภัยหรือไม่ |
|---|---|---|
| `VITE_SUPABASE_URL` | GitHub Secrets → build env | ปลอดภัย (เป็น public URL อยู่แล้ว) |
| `VITE_SUPABASE_ANON_KEY` | GitHub Secrets → build env | ปลอดภัย (anon key ออกแบบมาให้เปิดเผยได้ — RLS เป็นด่านป้องกันจริง) |
| `service_role` key | **ไม่ถูกใช้ที่ใดเลย** | — |
| Azure Client Secret | เก็บใน Supabase Dashboard เท่านั้น | ไม่อยู่ใน frontend bundle |

- **ไม่มีการ hardcode รหัสผ่าน** ในโค้ดหรือ bundle
- รหัส Admin แบบเก่า (`VITE_ADMIN_PASSWORD`) **ถูกลบออกแล้ว** — เปลี่ยนเป็น role-based ผ่าน `admin_users`

---

## 6. สถานะปัจจุบัน

⚠️ **ระบบยังใช้งานไม่ได้จนกว่าจะตั้งค่า Azure AD ให้เสร็จ** (ดู `AZURE_SETUP.md`)

นี่เป็นการออกแบบโดยตั้งใจ — เพื่อให้ IT ตรวจสอบความปลอดภัยของระบบก่อน
แล้วจึงเปิดใช้งานโดยการเสียบ Azure credentials

เมื่อตั้งค่า Azure เสร็จ ระบบจะใช้งานได้ทันทีโดยไม่ต้องแก้โค้ด

---

## 7. checklist สำหรับ IT

- [ ] ตรวจสอบ RLS policies ใน Supabase (Database → Policies)
- [ ] ตรวจสอบว่า `anon` role เข้าถึงตารางใดไม่ได้
- [ ] ตรวจสอบ RPC `book_class` / `cancel_reservation` ว่าตรวจ `auth.uid()`
- [ ] ตรวจสอบว่าไม่มี `service_role` key ใน frontend
- [ ] ตั้งค่า Azure App Registration (ดู `AZURE_SETUP.md`)
- [ ] ทดสอบ login + การเข้าถึงข้อมูลตาม role
