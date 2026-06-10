import { useState } from 'react';
import { supabase } from '../supabase';

/**
 * PrivacyModal — ป๊อปอัปคำประกาศความเป็นส่วนตัว (PDPA)
 *
 * ใช้ได้ 2 โหมด:
 *   - โหมดยอมรับ (default): เรียกโดย ProtectedRoute ตอนล็อกอินครั้งแรก
 *                           (accepted_privacy_at เป็น null) -> มีปุ่มยอมรับ
 *   - โหมดดูอย่างเดียว (viewOnly): เรียกจากหน้า Login เพื่อให้ผู้ใช้กดอ่าน
 *                           Policy ได้ -> ไม่มีปุ่มยอมรับ มีแค่ปุ่มปิด
 *
 * Props:
 *   onAccept   - callback เมื่อกดยอมรับสำเร็จและเซฟลงฐานข้อมูลแล้ว
 *   onClose    - callback เมื่อกดปุ่มกากบาท (X) / ปุ่มปิด
 *   viewOnly   - true = โหมดดูอย่างเดียว (ซ่อนปุ่มยอมรับ)
 */
export default function PrivacyModal({ onAccept, onClose, viewOnly = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      // เรียกใช้ RPC function ที่เตรียมไว้ใน Supabase
      const { error: rpcError } = await supabase.rpc('accept_privacy_policy');
      if (rpcError) throw rpcError;
      
      // เมื่อเซฟสำเร็จ แจ้ง parent component ให้ทำงานต่อ (เช่น reloadProfile)
      if (onAccept) onAccept();
    } catch (err) {
      console.error('Error accepting privacy policy:', err);
      setError('เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        
        {/* Header */}
        <div className="relative bg-white px-6 sm:px-8 py-5 border-b border-gray-100 flex-shrink-0">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg p-1.5 transition-colors focus:outline-none"
            aria-label="ปิด"
            title={viewOnly ? 'ปิด' : 'ปิดและออกจากระบบ'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <div className="flex items-center gap-4">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
              <svg className="w-7 h-7 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="pr-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-950">คำประกาศเกี่ยวกับความเป็นส่วนตัว</h2>
              <p className="text-gray-500 mt-1 text-sm">Privacy Notice สำหรับระบบจองคลาสเรียน</p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="px-6 sm:px-8 py-6 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/50">
          <div className="space-y-6 text-gray-700 text-sm leading-relaxed">
            
            <section>
              <h3 className="text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">1</span>
                ข้อมูลส่วนบุคคลที่เราเก็บรวบรวม
              </h3>
              <div className="bg-white p-4 rounded-lg border border-gray-200 ml-2">
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li><strong>ข้อมูลระบุตัวตนและข้อมูลติดต่อ:</strong> รหัสพนักงาน, สายงาน, ฝ่าย, แผนก, ระดับตำแหน่ง, และอีเมลของบริษัท (ผ่านระบบ Microsoft 365)</li>
                  <li><strong>ข้อมูลการใช้งานระบบ:</strong> ประวัติการลงทะเบียนเรียน, ประวัติการเข้าเรียน, ประวัติการอนุมัติคลาสเรียน, และบันทึกประวัติการใช้งานระบบ (Audit Logs)</li>
                </ul>
              </div>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">2</span>
                วัตถุประสงค์ในการเก็บรวบรวมและใช้ข้อมูล
              </h3>
              <div className="bg-white p-4 rounded-lg border border-gray-200 ml-2">
                <ul className="list-disc pl-5 space-y-1 text-gray-600">
                  <li>เพื่อดำเนินการจองและจัดลำดับสิทธิ์การเข้าอบรมหลักสูตรต่างๆ ของพนักงาน</li>
                  <li>เพื่อรายงานผลการฝึกอบรมและประเมินผลการพัฒนาบุคลากรแก่บริษัทและหัวหน้างาน</li>
                  <li>เพื่อรักษาความปลอดภัยของระบบ และตรวจสอบการเข้าถึงข้อมูลที่ผิดปกติ (Audit Trail)</li>
                </ul>
                <div className="mt-3 text-xs bg-gray-50 p-2 rounded text-gray-500 border border-gray-100">
                  <span className="font-semibold text-gray-700">ฐานทางกฎหมายที่ใช้:</span> ฐานการปฏิบัติตามสัญญา (Contract) และ ฐานประโยชน์อันชอบธรรม (Legitimate Interest) ของบริษัท
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">3</span>
                ระยะเวลาจัดเก็บข้อมูล
              </h3>
              <div className="bg-white p-4 rounded-lg border border-gray-200 ml-2 text-gray-600">
                บริษัทจะจัดเก็บข้อมูลส่วนบุคคลและประวัติการอบรมของท่านไว้ตลอดระยะเวลาที่ท่านเป็นพนักงานของบริษัท และจะจัดเก็บต่ออีกเป็นเวลา <strong className="text-gray-900">10 ปี นับหลังจากพ้นสภาพพนักงาน</strong> เพื่อวัตถุประสงค์ในการตรวจสอบย้อนหลังทางกฎหมายแรงงานและภาษี หลังจากนั้นข้อมูลจะถูกลบหรือทำให้ไม่สามารถระบุตัวบุคคลได้
              </div>
            </section>

            <section>
              <h3 className="text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">4</span>
                สิทธิ์ของเจ้าของข้อมูลและช่องทางการติดต่อ
              </h3>
              <div className="bg-white p-4 rounded-lg border border-gray-200 ml-2 text-gray-600">
                ท่านมีสิทธิ์ในการขอเข้าถึง ขอรับสำเนา ขอแก้ไขข้อมูลให้ถูกต้อง หรือขอระงับการใช้ข้อมูลส่วนบุคคลของท่าน โดยสามารถติดต่อแจ้งความประสงค์ได้ที่ <strong className="text-blue-700">ฝ่ายพัฒนาทรัพยามนุษย์</strong>
              </div>
            </section>
            
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-white border-t border-gray-100 flex flex-col gap-3 flex-shrink-0">
          {viewOnly ? (
            // โหมดดูอย่างเดียว — มีแค่ปุ่มปิด
            <button
              onClick={onClose}
            className="w-full py-3.5 px-4 rounded-lg text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              ปิด
            </button>
          ) : (
            // โหมดยอมรับ — ปุ่มยอมรับข้อตกลง
            <>
              {error && (
                <div className="text-red-600 text-sm text-center bg-red-50 py-2 rounded-lg border border-red-100">
                  {error}
                </div>
              )}
              <button
                onClick={handleAccept}
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-lg text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลังบันทึกข้อมูล...
                  </>
                ) : (
                  'ฉันได้อ่านและยอมรับข้อตกลง'
                )}
              </button>
              <p className="text-center text-xs text-gray-400 mt-1">
                หากท่านไม่ยอมรับเงื่อนไข จะไม่สามารถเข้าใช้งานระบบได้ (คลิกปุ่มปิดเพื่อออกจากระบบ)
              </p>
            </>
          )}
        </div>
        
      </div>
    </div>
  );
}
