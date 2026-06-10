import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import BrandLogo from '../components/BrandLogo';
import { logAdminAction } from '../utils/logger';

/**
 * AdminUsers — หน้าจัดการสิทธิ์ Admin
 * เพิ่ม/ลบ admin ผ่าน email (admin_users table)
 */
export default function AdminUsers() {
  const { email: myEmail } = useAuth();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false });

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('added_at', { ascending: true });
      if (error) throw error;
      setAdmins(data || []);
    } catch (err) {
      console.error(err);
      alert('โหลดรายชื่อ Admin ไม่สำเร็จ: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    // validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('รูปแบบอีเมลไม่ถูกต้อง');
      return;
    }
    if (admins.some(a => a.email.toLowerCase() === email)) {
      alert('อีเมลนี้เป็น Admin อยู่แล้ว');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('admin_users')
        .insert({ email, added_by: myEmail || '' });
      if (error) throw error;
      await logAdminAction('ADD_ADMIN', { email });
      setNewEmail('');
        await loadAdmins();
      alert('เพิ่ม Admin เรียบร้อยแล้ว');
    } catch (err) {
      console.error(err);
      alert('เพิ่ม Admin ไม่สำเร็จ: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (admin) => {
    // กันลบตัวเอง
    if (admin.email.toLowerCase() === (myEmail || '').toLowerCase()) {
      alert('คุณไม่สามารถลบสิทธิ์ Admin ของตัวเองได้');
      return;
    }
    if (admins.length <= 1) {
      alert('ต้องมี Admin อย่างน้อย 1 คนในระบบ');
      return;
    }

    setConfirmConfig({
      isOpen: true,
      type: 'danger',
      title: 'ยืนยันการลบสิทธิ์ Admin',
      message: `คุณต้องการลบสิทธิ์ Admin ของ\n"${admin.name || admin.email}" (${admin.email})\nใช่หรือไม่?`,
      confirmText: 'ลบสิทธิ์',
      onConfirm: async () => {
        setConfirmConfig({ isOpen: false });
        try {
          const { error } = await supabase
            .from('admin_users')
            .delete()
            .eq('email', admin.email);
          if (error) throw error;
          await logAdminAction('REMOVE_ADMIN', { email: admin.email });
          await loadAdmins();
        } catch (err) {
          console.error(err);
          alert('ลบไม่สำเร็จ: ' + (err.message || err));
        }
      },
      onCancel: () => setConfirmConfig({ isOpen: false })
    });
  };

  return (
    <div className="min-h-screen bg-transparent pb-12">
      <header className="app-header bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <BrandLogo className="h-9 w-auto flex-shrink-0" />
            <h1 className="font-display text-base sm:text-xl font-bold text-gray-900 truncate">จัดการสิทธิ์ Admin</h1>
          </div>
          <div className="mobile-action-rail sm:w-auto sm:flex sm:items-center sm:gap-3 sm:flex-wrap">
            <Link to="/admin" className="inline-flex items-center px-4 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors shadow-sm">
              <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              กลับหน้า Admin หลัก
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 mt-6 sm:mt-8 space-y-6">
        {/* ฟอร์มเพิ่ม Admin */}
        <div className="app-card rounded-2xl p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">เพิ่มผู้ดูแลระบบ</h2>
          <p className="text-sm text-gray-500 mb-4">
            ระบุอีเมล Microsoft 365 ของพนักงานที่ต้องการให้มีสิทธิ์ Admin
          </p>
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@company.com"
              required
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? 'กำลังเพิ่ม...' : 'เพิ่ม Admin'}
            </button>
          </form>
        </div>

        {/* รายชื่อ Admin */}
        <div className="app-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-900">
              รายชื่อผู้ดูแลระบบ ({admins.length} คน)
            </h2>
          </div>
          {loading ? (
            <div className="loading-state p-8 text-center text-gray-500">กำลังโหลด...</div>
          ) : admins.length === 0 ? (
            <div className="p-8 text-center text-gray-500">ยังไม่มีผู้ดูแลระบบ</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {admins.map(admin => {
                const isMe = admin.email.toLowerCase() === (myEmail || '').toLowerCase();
                return (
                  <div key={admin.email} className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
                        {(admin.email).substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {admin.email}
                          {isMe && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">คุณ</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(admin)}
                      disabled={isMe}
                      className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        isMe
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-red-600 hover:bg-red-50'
                      }`}
                    >
                      ลบสิทธิ์
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800">
            <strong>หมายเหตุ:</strong> ผู้ที่มีอีเมลอยู่ในรายชื่อนี้จะเห็นเมนู "ระบบจัดการ"
            และสามารถสร้าง/แก้ไขหลักสูตร จัดการพนักงาน และจัดการสิทธิ์ Admin ได้
          </p>
        </div>
      </main>

      <ConfirmModal {...confirmConfig} />
    </div>
  );
}
