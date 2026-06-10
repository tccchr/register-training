import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PrivacyModal from './PrivacyModal';

/**
 * ProtectedRoute — ป้องกันหน้าที่ต้อง login
 *
 * Props:
 *   children    — หน้าที่จะแสดงถ้าผ่านเงื่อนไข
 *   requireAdmin — true = ต้องเป็น admin เท่านั้น
 */
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, employee, isAdmin, loading, notRegistered, signOut, reloadProfile } = useAuth();

  // กำลังเช็ค session
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="motion-fade-y text-sm text-gray-500">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  // ยังไม่ login → ไปหน้า login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // login แล้วแต่ email ไม่อยู่ในระบบ → กลับไปหน้า login (จะแสดง notRegistered)
  if (notRegistered || !employee) {
    return <Navigate to="/login" replace />;
  }

  // ตรวจสอบว่าพนักงานเคยกดยอมรับ Privacy Notice หรือยัง (หากเข้าสู่ระบบครั้งแรก ค่าจะเป็น null)
  if (employee && !employee.accepted_privacy_at) {
    return (
      <PrivacyModal 
        onAccept={() => {
          // รีโหลดข้อมูล employee ใหม่เพื่อให้ accepted_privacy_at มีค่า และหน้าเว็บจะไปต่อเอง
          reloadProfile();
        }}
        onClose={() => {
          // ถ้ากด X แปลว่าไม่ยอมรับ ให้ Sign Out กลับหน้า Login
          signOut();
        }}
      />
    );
  }

  // หน้า admin แต่ไม่ใช่ admin → เด้งไปหน้าพนักงาน
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/portal" replace />;
  }

  return children;
}
