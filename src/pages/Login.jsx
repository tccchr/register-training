import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PrivacyModal from '../components/PrivacyModal';
import BrandLogo from '../components/BrandLogo';

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, employee, isAdmin, loading, notRegistered, signInWithMicrosoft, signOut } = useAuth();
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);   // เปิด PrivacyModal แบบดูอย่างเดียว
  const brandBase = `${import.meta.env.BASE_URL}brand/`;

  // เมื่อ login สำเร็จและมี profile -> ไปหน้าที่เหมาะสม
  useEffect(() => {
    if (loading) return;
    if (isAuthenticated && employee) {
      navigate(isAdmin ? '/admin' : '/portal', { replace: true });
    }
  }, [isAuthenticated, employee, isAdmin, loading, navigate]);

  // forceSelectAccount = true -> บังคับ Microsoft แสดงหน้าเลือก account (สลับผู้ใช้)
  const handleMicrosoftLogin = async (forceSelectAccount = false) => {
    setError('');
    setSigningIn(true);
    try {
      await signInWithMicrosoft(forceSelectAccount);
      // signInWithOAuth จะ redirect ออกไปหน้า Microsoft เอง
    } catch (err) {
      console.error(err);
      // กรณี Azure ยังไม่ได้ตั้งค่าใน Supabase
      if (/provider/i.test(err.message || '') || /not enabled/i.test(err.message || '')) {
        setError('ระบบ Microsoft 365 ยังไม่ได้เปิดใช้งาน — กรุณาติดต่อผู้ดูแลระบบ (IT)');
      } else {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + (err.message || 'กรุณาลองใหม่'));
      }
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="w-full max-w-lg app-card premium-login-card rounded-lg overflow-hidden">
        <section className="relative bg-white p-7 pt-10 sm:p-11 sm:pt-12 flex items-center">
          <div className="w-full max-w-md mx-auto">
        {(loading || signingIn) && (
          <div className="absolute inset-0 bg-white/78 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-gray-500">{signingIn ? 'กำลังนำคุณไปยัง Microsoft...' : 'กำลังตรวจสอบ...'}</p>
          </div>
        )}

        {/* Logo + หัวข้อ */}
        <div className="text-center mb-10 flex flex-col items-center">
          <div className="mb-8 flex justify-center">
            <BrandLogo className="h-28 sm:h-32 w-auto max-w-[330px]" />
          </div>
          <p className="text-xs font-semibold tracking-[0.08em] text-blue-600 mb-3">Employee Learning Portal</p>
          <h1 className="font-display text-[2rem] sm:text-[2.55rem] font-semibold text-gray-950 mb-4 leading-tight">ระบบจองคลาสเรียน</h1>
          <p className="text-gray-500 text-base leading-8 max-w-sm">เข้าสู่ระบบด้วยบัญชีบริษัทเพื่อดูหลักสูตร ตารางอบรม และสถานะการลงทะเบียนของคุณ</p>
        </div>

        {/* กรณี login M365 สำเร็จ แต่ email ไม่อยู่ใน employees */}
        {notRegistered ? (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <svg className="w-12 h-12 text-red-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm font-bold text-red-800 mb-1">ไม่พบสิทธิ์การเข้าใช้งาน</p>
              <p className="text-xs text-red-600">
                บัญชีของคุณยืนยันตัวตนสำเร็จ แต่ยังไม่มีข้อมูลพนักงานในระบบ<br />
                กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มข้อมูลของคุณ
              </p>
            </div>
            <button
              onClick={signOut}
              className="w-full py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              ออกจากระบบ
            </button>
            <button
              onClick={async () => { await signOut(); handleMicrosoftLogin(true); }}
              className="w-full py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-medium hover:bg-blue-100 transition-colors"
            >
              เข้าสู่ระบบด้วยบัญชีอื่น
            </button>
          </div>
        ) : (
          <>
            {/* ปุ่ม Microsoft 365 */}
            <button
              onClick={() => handleMicrosoftLogin(false)}
              disabled={signingIn}
              className="premium-primary w-full flex items-center justify-center gap-3 bg-gray-950 hover:bg-black text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-gray-900/15 hover:shadow-xl hover:shadow-gray-900/20 min-h-[52px]"
            >
              {/* Microsoft logo (4 สี่เหลี่ยม) */}
              <svg className="w-5 h-5" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
              </svg>
              เข้าสู่ระบบด้วย Microsoft 365
            </button>

            {/* ปุ่มสลับผู้ใช้ / เข้าด้วยอีเมลอื่น */}
            <button
              onClick={() => handleMicrosoftLogin(true)}
              disabled={signingIn}
              className="w-full mt-3 flex items-center justify-center gap-2 border border-gray-200 hover:border-blue-200 hover:bg-blue-50 text-gray-600 hover:text-blue-700 text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 min-h-[46px]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              เข้าสู่ระบบด้วยบัญชีอื่น
            </button>

            {error && (
              <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-sm text-orange-700 text-center">{error}</p>
              </div>
            )}

              <div className="mt-7 pt-7 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400">
                  ระบบใช้บัญชี Microsoft 365 ขององค์กรในการยืนยันตัวตน<br />
                  เพื่อความปลอดภัยของข้อมูลพนักงาน
                </p>
                <div className="mt-5 flex items-center justify-center gap-5">
                  <img className="premium-partner-mark h-8 w-auto object-contain" src={`${brandBase}tccc-logo-crop.png`} alt="TCCC" loading="eager" decoding="async" />
                  <img className="premium-partner-mark h-7 w-auto object-contain" src={`${brandBase}we-logo-crop.png`} alt="WE" loading="eager" decoding="async" />
                </div>
                {/* ลิงก์เปิดดู Policy PDPA แบบดูอย่างเดียว */}
              <button
                type="button"
                onClick={() => setShowPrivacy(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                อ่านนโยบายความเป็นส่วนตัว (PDPA)
              </button>
            </div>
          </>
        )}
          </div>
        </section>
      </div>

      {/* PrivacyModal — โหมดดูอย่างเดียว (เปิดจากลิงก์ในหน้า Login) */}
      {showPrivacy && (
        <PrivacyModal
          viewOnly
          onClose={() => setShowPrivacy(false)}
        />
      )}
    </div>
  );
}
