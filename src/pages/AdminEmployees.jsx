import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { softDelete } from '../utils/trash';
import { logAdminAction } from '../utils/logger';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';

const employeeHeaders = ['id', 'email', 'site', 'division', 'dept', 'section', 'level'];
const csvHeaderAliases = {
  employee_id: 'id',
  emp_id: 'id',
  staff_id: 'id',
  mail: 'email',
  department: 'dept'
};
const BULK_WRITE_CHUNK_SIZE = 500;

const escapeCSVValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const parseCSVRow = (str) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') {
      if (inQuotes && str[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

const normalizeEmployeeRow = (emp) => ({
  id: String(emp.id || '').trim(),
  email: (emp.email || '').trim().toLowerCase(),
  site: emp.site || '',
  division: emp.division || '',
  dept: emp.dept || '',
  section: emp.section || '',
  level: emp.level || '',
  is_deleted: false
});

const parseEmployeesCSV = (text) => {
  const cleanText = String(text || '').replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length < 2) {
    throw new Error('ไฟล์ CSV ต้องมี Header และข้อมูลอย่างน้อย 1 แถว');
  }

  const headers = parseCSVRow(lines[0]).map(h => {
    const normalized = h.trim().replace(/"/g, '').toLowerCase();
    return csvHeaderAliases[normalized] || normalized;
  });

  if (!headers.includes('id')) {
    throw new Error('ไฟล์ CSV ต้องมีคอลัมน์ id หรือ employee_id');
  }

  const employeeMap = new Map();
  const duplicateIds = new Set();

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    const emp = {};
    headers.forEach((h, index) => {
      emp[h] = (row[index] || '').trim();
    });

    const normalized = normalizeEmployeeRow(emp);
    if (!normalized.id) continue;
    if (employeeMap.has(normalized.id)) duplicateIds.add(normalized.id);
    employeeMap.set(normalized.id, normalized);
  }

  const employees = Array.from(employeeMap.values());
  if (employees.length === 0) {
    throw new Error('ไม่พบข้อมูลพนักงานที่มีรหัสถูกต้องในไฟล์ CSV');
  }

  return { employees, duplicateIds };
};

export default function AdminEmployees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [employeeView, setEmployeeView] = useState('active');

  // Modal for add/edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: '', email: '', site: '', division: '', dept: '', section: '', level: '' });

  const navigate = useNavigate();
  const { signOut } = useAuth();

  const fetchEmployees = async () => {
    setLoading(true);
    setLoadError('');
    try {
      // หน้า Admin ต้องเห็นทั้ง Active และ Off จึงอ่านตารางตรงภายใต้ RLS admin
      let { data, error } = await supabase
        .from('employees')
        .select('id, email, site, division, dept, section, level, is_deleted');

      if (error) {
        // fallback เผื่อ environment เก่ายังไม่เปิด SELECT ตรงตาม RLS admin
        const fallback = await supabase.rpc('get_employees_list');
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;
      setEmployees((data || []).sort((a, b) => String(a.id).localeCompare(String(b.id))));
    } catch (error) {
      console.error('Error fetching employees:', error);
      setLoadError(error.message || 'ไม่สามารถโหลดข้อมูลพนักงานได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (actionBusy) return;

    try {
      setActionBusy('save');
      const employeeId = editForm.id.trim();
      if (!employeeId) throw new Error('กรุณากรอกรหัสพนักงาน');

      const isNew = !employees.some(emp => emp.id === employeeId);

      if (isNew) {
        const { error } = await supabase
          .from('employees')
          .insert({
            id: employeeId,
            email: (editForm.email || '').trim().toLowerCase(),
            site: editForm.site || '',
            division: editForm.division || '',
            dept: editForm.dept || '',
            section: editForm.section || '',
            level: editForm.level || '',
            is_deleted: false
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employees')
          .update({
            email: (editForm.email || '').trim().toLowerCase(),
            site: editForm.site || '',
            division: editForm.division || '',
            dept: editForm.dept || '',
            section: editForm.section || '',
            level: editForm.level || '',
            is_deleted: false
          })
          .eq('id', employeeId);
        if (error) throw error;
      }

      await logAdminAction(isNew ? 'CREATE_EMPLOYEE' : 'UPDATE_EMPLOYEE', { employeeId });
      setIsModalOpen(false);
      await fetchEmployees();
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + (error.message || error));
      console.error(error);
    } finally {
      setActionBusy('');
    }
  };

  const handleDelete = async (id) => {
    if (actionBusy) return;

    if (window.confirm(`คุณต้องการตั้งพนักงานรหัส ${id} เป็น Off ใช่หรือไม่?\nพนักงานคนนี้จะไม่สามารถเข้าสู่ระบบได้จนกว่าจะนำกลับมา Active`)) {
      try {
        setActionBusy(`off:${id}`);
        await softDelete('employees', id);
        await logAdminAction('OFF_EMPLOYEE', { employeeId: id });
        await fetchEmployees();
      } catch (error) {
        alert('เกิดข้อผิดพลาดในการตั้งสถานะ Off');
        console.error(error);
      } finally {
        setActionBusy('');
      }
    }
  };

  const handleRestoreEmployee = async (id) => {
    if (actionBusy) return;
    if (!window.confirm(`นำพนักงานรหัส ${id} กลับมา Active ใช่หรือไม่?`)) return;

    try {
      setActionBusy(`restore:${id}`);
      const { error } = await supabase
        .from('employees')
        .update({ is_deleted: false })
        .eq('id', id);

      if (error) throw error;

      await logAdminAction('RESTORE_EMPLOYEE', { employeeId: id });
      await fetchEmployees();
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการนำกลับมา Active');
      console.error(error);
    } finally {
      setActionBusy('');
    }
  };

  const markEmployeesOff = async (ids) => {
    for (const idChunk of chunkArray(ids, BULK_WRITE_CHUNK_SIZE)) {
      const { error } = await supabase
        .from('employees')
        .update({ is_deleted: true })
        .in('id', idChunk);

      if (error) throw error;
    }
  };

  const handleExportCSV = () => {
    if (employees.length === 0) return alert('No data to export');

    const csvRows = employees.map(emp => {
      return employeeHeaders.map(header => escapeCSVValue(emp[header])).join(',');
    });

    const csvContent = [employeeHeaders.join(','), ...csvRows].join('\n');
    const blob = new Blob(["" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `employees_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const csvContent = [
      employeeHeaders.join(','),
      employeeHeaders.map(header => escapeCSVValue(header === 'id' ? '100001' : '')).join(',')
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employees_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (e) => {
    if (actionBusy) return;
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const { employees: uniqueEmployees, duplicateIds } = parseEmployeesCSV(event.target.result);
        const duplicateNote = duplicateIds.size > 0
          ? `\n\nพบรหัสพนักงานซ้ำในไฟล์ ${duplicateIds.size} รหัส ระบบจะใช้ข้อมูลแถวล่าสุดของแต่ละรหัส`
          : '';

        if (window.confirm(`พบข้อมูล ${uniqueEmployees.length} รายการ ต้องการ Import ใช่หรือไม่? (ข้อมูลเก่าที่มีรหัสซ้ำจะถูกทับ)${duplicateNote}`)) {
          setLoading(true);
          setActionBusy('import');
          const { error } = await supabase
            .from('employees')
            .upsert(uniqueEmployees, { onConflict: 'id' });

          if (error) throw error;

          await logAdminAction('IMPORT_EMPLOYEES', {
            count: uniqueEmployees.length,
            duplicateIds: Array.from(duplicateIds)
          });
          alert(`Import สำเร็จ!${duplicateIds.size > 0 ? `\nรวมรหัสซ้ำแล้ว ${duplicateIds.size} รหัส` : ''}`);
          await fetchEmployees();
        }
      } catch (error) {
        console.error(error);
        alert('เกิดข้อผิดพลาดในการ Import: ' + (error.message || error));
      } finally {
        setLoading(false);
        setActionBusy('');
        e.target.value = null;
      }
    };
    reader.onerror = () => {
      alert('ไม่สามารถอ่านไฟล์ CSV ได้');
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const handleSyncLatestCSV = (e) => {
    if (actionBusy) return;
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const { employees: latestEmployees, duplicateIds } = parseEmployeesCSV(event.target.result);
        const latestIds = new Set(latestEmployees.map(emp => emp.id));
        const activeEmployees = employees.filter(emp => !emp.is_deleted);
        const offEmployees = activeEmployees.filter(emp => !latestIds.has(emp.id));
        const duplicateNote = duplicateIds.size > 0
          ? `\n\nพบรหัสพนักงานซ้ำในไฟล์ ${duplicateIds.size} รหัส ระบบจะใช้ข้อมูลแถวล่าสุดของแต่ละรหัส`
          : '';

        const message = [
          `พบพนักงานในไฟล์ล่าสุด ${latestEmployees.length} รายการ`,
          `พนักงาน Active เดิมที่จะถูกตั้งเป็น Off ${offEmployees.length} รายการ`,
          '',
          'ต้องการ Sync รายชื่อล่าสุดใช่หรือไม่?',
          'คนที่ไม่มีในไฟล์นี้จะไม่สามารถเข้าสู่ระบบได้ และจะแยกไปแท็บ Off'
        ].join('\n');

        if (!window.confirm(`${message}${duplicateNote}`)) return;

        setLoading(true);
        setActionBusy('sync');

        const { error: upsertError } = await supabase
          .from('employees')
          .upsert(latestEmployees, { onConflict: 'id' });

        if (upsertError) throw upsertError;

        if (offEmployees.length > 0) {
          await markEmployeesOff(offEmployees.map(emp => emp.id));
        }

        await logAdminAction('SYNC_LATEST_EMPLOYEES', {
          latestCount: latestEmployees.length,
          offCount: offEmployees.length,
          offIds: offEmployees.map(emp => emp.id),
          duplicateIds: Array.from(duplicateIds)
        });

        alert(`Sync สำเร็จ!\nActive/อัปเดต ${latestEmployees.length} รายการ\nตั้งเป็น Off ${offEmployees.length} รายการ`);
        setEmployeeView('active');
        await fetchEmployees();
      } catch (error) {
        console.error(error);
        alert('เกิดข้อผิดพลาดในการ Sync รายชื่อล่าสุด: ' + (error.message || error));
      } finally {
        setLoading(false);
        setActionBusy('');
        e.target.value = null;
      }
    };
    reader.onerror = () => {
      alert('ไม่สามารถอ่านไฟล์ CSV ได้');
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const { activeEmployees, offEmployees } = useMemo(() => ({
    activeEmployees: employees.filter(emp => !emp.is_deleted),
    offEmployees: employees.filter(emp => emp.is_deleted)
  }), [employees]);

  const displayedEmployees = employeeView === 'off' ? offEmployees : activeEmployees;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredEmployees = useMemo(() => displayedEmployees.filter(emp =>
    !normalizedSearch ||
    String(emp.id || '').toLowerCase().includes(normalizedSearch) ||
    String(emp.email || '').toLowerCase().includes(normalizedSearch) ||
    String(emp.site || '').toLowerCase().includes(normalizedSearch) ||
    String(emp.division || '').toLowerCase().includes(normalizedSearch) ||
    String(emp.dept || '').toLowerCase().includes(normalizedSearch) ||
    String(emp.section || '').toLowerCase().includes(normalizedSearch) ||
    String(emp.level || '').toLowerCase().includes(normalizedSearch)
  ), [displayedEmployees, normalizedSearch]);
  const actionsDisabled = loading || !!actionBusy;

  return (
    <div className="min-h-screen bg-transparent pb-12">
      <header className="app-header bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <BrandLogo className="h-9 w-auto flex-shrink-0" />
            <h1 className="font-display text-base sm:text-xl font-bold text-gray-900 truncate">จัดการข้อมูลพนักงาน</h1>
          </div>
          <div className="mobile-action-rail sm:w-auto sm:flex sm:items-center sm:gap-3 sm:flex-wrap">
            <Link to="/admin" className="inline-flex items-center px-4 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors shadow-sm">
              <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              กลับหน้า Admin หลัก
            </Link>
            <button onClick={async () => { await signOut(); navigate('/login'); }} className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors ml-2">
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 mt-6 sm:mt-8">
        <div className="app-card rounded-2xl p-4 sm:p-6">

          {/* Controls */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="w-full md:w-1/3">
              <input
                type="text"
                aria-label="ค้นหาข้อมูลพนักงาน"
                placeholder="ค้นหารหัส อีเมล หรือหน่วยงาน..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <button disabled={actionsDisabled} onClick={() => {
                setEditForm({ id: '', email: '', site: '', division: '', dept: '', section: '', level: '' });
                setIsModalOpen(true);
              }} className="flex-1 md:flex-none justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed">
                + เพิ่มพนักงานใหม่
              </button>

              <button disabled={actionsDisabled} onClick={handleExportCSV} className="flex-1 md:flex-none justify-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm flex items-center min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed">
                Export CSV
              </button>

              <button disabled={actionsDisabled} onClick={handleDownloadTemplate} className="flex-1 md:flex-none justify-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm flex items-center min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed">
                Template
              </button>

              <label className={`flex-1 md:flex-none justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm flex items-center min-h-[40px] ${actionsDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}>
                {actionBusy === 'import' ? 'กำลัง Import...' : 'Import CSV'}
                <input disabled={actionsDisabled} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
              </label>

              <label className={`flex-1 md:flex-none justify-center px-4 py-2 bg-amber-100 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 font-semibold text-sm flex items-center min-h-[40px] ${actionsDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}>
                {actionBusy === 'sync' ? 'กำลัง Sync...' : 'Sync รายชื่อล่าสุด'}
                <input disabled={actionsDisabled} type="file" accept=".csv" className="hidden" onChange={handleSyncLatestCSV} />
              </label>
            </div>
          </div>

          <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-semibold text-green-700">Import CSV</p>
              <p className="mt-1 text-sm text-gray-600">เพิ่มหรืออัปเดตคนในไฟล์เท่านั้น เหมาะกับการเติมรายชื่อบางส่วนโดยไม่แตะคนที่ไม่มีในไฟล์</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-700">Sync รายชื่อล่าสุด</p>
              <p className="mt-1 text-sm text-gray-600">ใช้เมื่อไฟล์คือ master ล่าสุดของบริษัท คน Active เดิมที่ไม่มีในไฟล์จะถูกย้ายไป Off และเข้าสู่ระบบไม่ได้</p>
            </div>
          </div>

          {loadError && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm font-medium text-red-700">{loadError}</p>
              <button type="button" onClick={fetchEmployees} className="inline-flex justify-center px-4 py-2 rounded-lg bg-white border border-red-200 text-red-700 text-sm font-semibold">
                ลองโหลดใหม่
              </button>
            </div>
          )}

          <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="inline-flex w-full sm:w-auto rounded-lg border border-gray-200 bg-white p-1">
              <button
                type="button"
                aria-pressed={employeeView === 'active'}
                onClick={() => setEmployeeView('active')}
                className={`flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-md transition-colors ${employeeView === 'active' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Active ({activeEmployees.length})
              </button>
              <button
                type="button"
                aria-pressed={employeeView === 'off'}
                onClick={() => setEmployeeView('off')}
                className={`flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-md transition-colors ${employeeView === 'off' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Off ({offEmployees.length})
              </button>
            </div>
            <p className="text-sm text-gray-500">
              {employeeView === 'off'
                ? 'พนักงาน Off จะไม่สามารถเข้าสู่ระบบ และไม่ถูกนับเป็นรายชื่อปัจจุบัน'
                : 'รายการ Active คือพนักงานที่อยู่ในระบบปัจจุบัน'}
            </p>
          </div>

          {/* Table */}
          <div className="app-table-wrap">
            <table className="app-table text-left min-w-[980px]">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm border-y border-gray-200">
                  <th scope="col" className="py-3 px-4 font-medium">รหัสพนักงาน</th>
                  <th scope="col" className="py-3 px-4 font-medium">Email</th>
                  <th scope="col" className="py-3 px-4 font-medium">Site</th>
                  <th scope="col" className="py-3 px-4 font-medium">Division</th>
                  <th scope="col" className="py-3 px-4 font-medium">Dept</th>
                  <th scope="col" className="py-3 px-4 font-medium">Section</th>
                  <th scope="col" className="py-3 px-4 font-medium">Level</th>
                  <th scope="col" className="py-3 px-4 font-medium">Status</th>
                  <th scope="col" className="py-3 px-4 font-medium text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan="9" className="py-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td></tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-12 text-center">
                      <p className="text-sm font-semibold text-gray-700">
                        {normalizedSearch
                          ? 'ไม่พบข้อมูลที่ตรงกับคำค้นหา'
                          : employeeView === 'off'
                            ? 'ยังไม่มีพนักงานสถานะ Off'
                            : 'ยังไม่มีข้อมูลพนักงาน Active'}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {normalizedSearch
                          ? 'ลองค้นหาด้วยรหัส อีเมล หรือชื่อหน่วยงานอื่น'
                          : employeeView === 'off'
                            ? 'เมื่อใช้ Sync รายชื่อล่าสุด คนที่ไม่มีในไฟล์ใหม่จะแสดงที่นี่'
                            : 'เริ่มจากเพิ่มพนักงานใหม่ หรือ Import CSV จาก Template'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map(emp => (
                    <tr key={emp.id} className={`hover:bg-gray-50/50 text-sm ${emp.is_deleted ? 'opacity-75' : ''}`}>
                      <td className="py-3 px-4 font-medium text-gray-900">{emp.id}</td>
                      <td className="py-3 px-4 text-gray-500">
                        {emp.email
                          ? <span className="text-xs">{emp.email}</span>
                          : <span className="text-xs text-red-400 italic">ยังไม่มี</span>}
                      </td>
                      <td className="py-3 px-4">{emp.site}</td>
                      <td className="py-3 px-4">{emp.division}</td>
                      <td className="py-3 px-4">{emp.dept}</td>
                      <td className="py-3 px-4">{emp.section}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{emp.level}</span>
                      </td>
                      <td className="py-3 px-4">
                        {emp.is_deleted ? (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">Off</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold">Active</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button disabled={actionsDisabled} onClick={() => { setEditForm({ id: emp.id, email: emp.email || '', site: emp.site || '', division: emp.division || '', dept: emp.dept || '', section: emp.section || '', level: emp.level || '' }); setIsModalOpen(true); }} className="text-blue-600 hover:text-blue-800 mr-3 disabled:opacity-40 disabled:cursor-not-allowed">แก้ไข</button>
                        {emp.is_deleted ? (
                          <button disabled={actionsDisabled} onClick={() => handleRestoreEmployee(emp.id)} className="text-green-600 hover:text-green-800 disabled:opacity-40 disabled:cursor-not-allowed">
                            {actionBusy === `restore:${emp.id}` ? 'กำลังนำกลับ...' : 'นำกลับ Active'}
                          </button>
                        ) : (
                          <button disabled={actionsDisabled} onClick={() => handleDelete(emp.id)} className="text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed">
                            {actionBusy === `off:${emp.id}` ? 'กำลังตั้ง Off...' : 'ตั้ง Off'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-sm text-gray-500 text-right">
            แสดง {filteredEmployees.length} คน จาก {displayedEmployees.length} คน
          </div>
        </div>
      </main>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">{editForm.id && employees.some(e => e.id === editForm.id) ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}</h3>
            <form onSubmit={handleSaveEmployee} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">รหัสพนักงาน (ID) *</label>
                  <input required type="text" value={editForm.id} onChange={e => setEditForm({ ...editForm, id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" readOnly={employees.some(e => e.id === editForm.id.trim())} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    อีเมล Microsoft 365 <span className="text-blue-600 text-xs">(สำหรับเข้าสู่ระบบ)</span>
                  </label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="email@company.com" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Site</label>
                  <input type="text" value={editForm.site} onChange={e => setEditForm({ ...editForm, site: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
                  <input type="text" value={editForm.division} onChange={e => setEditForm({ ...editForm, division: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input type="text" value={editForm.dept} onChange={e => setEditForm({ ...editForm, dept: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                  <input type="text" value={editForm.section} onChange={e => setEditForm({ ...editForm, section: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                  <input type="text" value={editForm.level} onChange={e => setEditForm({ ...editForm, level: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button disabled={actionBusy === 'save'} type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">ยกเลิก</button>
                <button disabled={actionBusy === 'save'} type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {actionBusy === 'save' ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
