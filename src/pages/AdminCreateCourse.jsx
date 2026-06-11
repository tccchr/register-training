import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { supabase } from '../supabase';
import BrandLogo from '../components/BrandLogo';
import { logAdminAction } from '../utils/logger';
import { softDelete } from '../utils/trash';

// --- Custom MultiSelect Component ---
function MultiSelect({ label, options, selected, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter(i => i !== opt));
    else onChange([...selected, opt]);
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div
        className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-gray-200 bg-white cursor-pointer flex flex-wrap gap-2 items-center transition-colors hover:border-blue-300"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selected.length === 0 && <span className="text-gray-400 text-sm">{placeholder}</span>}
        {selected.map(sel => (
          <span key={sel} className="inline-flex items-center bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100">
            {sel}
            <button type="button" onClick={(e) => { e.stopPropagation(); toggleOption(sel); }} className="ml-1 text-blue-500 hover:text-blue-800">&times;</button>
          </span>
        ))}
      </div>
      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {options.map(opt => (
            <div key={opt} onClick={() => toggleOption(opt)} className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center text-sm">
              <input type="checkbox" checked={selected.includes(opt)} readOnly className="mr-3 w-4 h-4 text-blue-600 rounded border-gray-300" />
              {opt}
            </div>
          ))}
          {options.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">ไม่พบตัวเลือก (Filtered)</div>}
        </div>
      )}
    </div>
  );
}

// --- Selected employee editor for mandatory participants ---
function EmployeeMultiSelect({ allEmployees, selectedIds, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const employeeMap = useMemo(() => {
    const map = {};
    allEmployees.forEach(emp => { map[emp.id] = emp; });
    return map;
  }, [allEmployees]);

  const toggleOption = (id) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(i => i !== id));
    else onChange([...selectedIds, id]);
  };

  const removeId = (id) => onChange(selectedIds.filter(i => i !== id));
  const clearAll = () => onChange([]);

  const addIdsFromInput = () => {
    const ids = search.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return;

    const valid = ids.filter(id => employeeMap[id]);
    const invalid = ids.filter(id => !employeeMap[id]);
    const merged = [...new Set([...selectedIds, ...valid])];

    onChange(merged);
    setSearch('');
    setIsOpen(false);

    if (invalid.length > 0) {
      alert(`ไม่พบรหัสพนักงาน ${invalid.length} รายการ:\n${invalid.slice(0, 20).join(', ')}${invalid.length > 20 ? '\n...' : ''}`);
    }
  };

  const filtered = allEmployees.filter(e =>
    (e.id || '').toLowerCase().includes(search.toLowerCase())
      || (e.email || '').toLowerCase().includes(search.toLowerCase())
      || (e.dept || '').toLowerCase().includes(search.toLowerCase())
      || (e.section || '').toLowerCase().includes(search.toLowerCase())
  );
  const selectedSet = new Set(selectedIds);
  const duplicateCount = Math.max(0, selectedIds.length - selectedSet.size);
  const missingEmployeeCount = [...selectedSet].filter(id => !employeeMap[id]).length;
  const missingEmailCount = [...selectedSet].filter(id => {
    const emp = employeeMap[id];
    return emp && !emp.email;
  }).length;
  const selectedDetails = [...selectedSet]
    .map(id => ({ id, emp: employeeMap[id] }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const chipListClass = expanded ? 'max-h-72 overflow-y-auto' : 'max-h-[92px] overflow-hidden';

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-xs font-semibold text-green-700">เลือกแล้ว</p>
          <p className="mt-1 text-2xl font-bold text-green-700 tabular-nums">{selectedSet.size}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold text-gray-500">รหัสซ้ำ</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{duplicateCount}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${missingEmployeeCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <p className={`text-xs font-semibold ${missingEmployeeCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>ไม่พบในระบบ</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${missingEmployeeCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>{missingEmployeeCount}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${missingEmailCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
          <p className={`text-xs font-semibold ${missingEmailCount > 0 ? 'text-amber-700' : 'text-gray-500'}`}>ยังไม่มีอีเมล</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${missingEmailCount > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{missingEmailCount}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
        <label className="block text-sm font-semibold text-gray-800 mb-2">เพิ่มรหัสพนักงาน</label>
        <div className="relative flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="พิมพ์หรือวางหลายรหัส เช่น 182992, 182390"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addIdsFromInput();
              }
            }}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={addIdsFromInput}
            className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 min-h-[44px]"
          >
            เพิ่ม
          </button>
          {isOpen && search.trim() && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
              {filtered.slice(0, 40).map(emp => (
                <button
                  type="button"
                  key={emp.id}
                  onClick={() => {
                    toggleOption(emp.id);
                    setSearch('');
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center text-sm text-left"
                >
                  <input type="checkbox" checked={selectedIds.includes(emp.id)} readOnly className="mr-3 w-4 h-4 text-blue-600 rounded border-gray-300" />
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900">{emp.id}</span>
                    <span className="ml-2 text-xs text-gray-500">{emp.dept || '-'} • {emp.site || '-'}</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">ไม่พบรายชื่อที่ค้นหา</div>}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-500">กด Enter เพื่อเพิ่มได้ทันที รองรับการวางหลายรหัสโดยคั่นด้วย comma, space หรือขึ้นบรรทัดใหม่</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div>
            <label className="block text-sm font-semibold text-gray-800">รายการที่เลือกแล้ว</label>
            <p className="text-xs text-gray-500">แสดงเป็น chip สีเขียวเพราะอยู่ในรายชื่อหลักสูตรแล้ว</p>
          </div>
          <div className="flex gap-2">
            {selectedSet.size > 18 && (
              <button
                type="button"
                onClick={() => setExpanded(prev => !prev)}
                className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg"
              >
                {expanded ? 'ย่อรายการ' : `แสดงทั้งหมด ${selectedSet.size} รายการ`}
              </button>
            )}
            {selectedSet.size > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-red-50 hover:text-red-700 rounded-lg"
              >
                ล้างทั้งหมด
              </button>
            )}
          </div>
        </div>

        {selectedDetails.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-center">
            <p className="text-sm font-medium text-gray-600">ยังไม่มีรายชื่อผู้เข้าร่วมหลัก</p>
            <p className="mt-1 text-xs text-gray-500">เพิ่มด้วยช่องด้านบน หรือ Import CSV</p>
          </div>
        ) : (
          <div className={`flex flex-wrap gap-2 pr-1 transition-all ${chipListClass}`}>
            {selectedDetails.map(({ id, emp }) => (
              <span
                key={id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border ${
                  emp ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                {id}
                <button
                  type="button"
                  onClick={() => removeId(id)}
                  className={`font-bold min-w-[18px] min-h-[18px] rounded hover:bg-white/70 ${
                    emp ? 'text-green-600 hover:text-green-900' : 'text-red-600 hover:text-red-900'
                  }`}
                  aria-label={`ลบรหัส ${id}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {selectedDetails.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-800">รายละเอียดพนักงานในรายชื่อ</p>
          </div>
          <div className="divide-y divide-gray-100 max-h-80 overflow-auto">
            {selectedDetails.map(({ id, emp }) => (
              <div key={id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">รหัส {id}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {emp ? `${emp.site || '-'} • ${emp.division || '-'} • ${emp.dept || '-'} • ${emp.section || '-'}` : 'ไม่พบข้อมูลพนักงานในระบบ'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${emp?.email ? 'bg-gray-100 text-gray-700' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                    {emp?.email ? 'มีอีเมล' : 'ยังไม่มีอีเมล'}
                  </span>
                  {emp?.level && <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-semibold">{emp.level}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Page Component ---
export default function AdminCreateCourse() {
  const navigate = useNavigate();
  const { id: editCourseId } = useParams();        // จาก /admin/edit/:id
  const isEditMode = !!editCourseId;

  const [allEmployees, setAllEmployees] = useState([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [originalClassIds, setOriginalClassIds] = useState([]);    // เก็บ id ของคลาสเดิม (สำหรับ detect class ที่ถูกลบ)

  const [course, setCourse] = useState({
    title: '',
    description: '',
    allowRequest: false,
    closingDate: '',
    closingTime: '',
    selectionMode: 'self',
    approverLevel: ''
  });

  // approverIds — array รหัสพนักงานที่กำหนดเป็นหัวหน้าเจาะจง
  const [approverIds, setApproverIds] = useState([]);
  const [approverIdInput, setApproverIdInput] = useState('');

  // assignmentGroups — กลุ่มมอบหมายผู้จัดคลาส แต่ละกลุ่ม { assigners:[], participants:[] }
  // ผู้จัดคลาสในกลุ่มดูแลเฉพาะผู้เข้าร่วมในกลุ่มเดียวกัน เพิ่มได้หลายกลุ่ม
  const [assignmentGroups, setAssignmentGroups] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const [conditions, setConditions] = useState({
    site: [],
    division: [],
    dept: [],
    section: [],
    level: []
  });

  const [mandatoryList, setMandatoryList] = useState([]);

  const [classes, setClasses] = useState(() => [
    { id: Date.now().toString(), name: 'รุ่นที่ 1', date: '', startTime: '', endTime: '', location: '', locationUrl: '', instructor: '', maxSeats: '' }
  ]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // 1. โหลด employees ผ่าน RPC (ปลอดภัย + audit)
        const { data: empData, error: empErr } = await supabase.rpc('get_employees_list');
        if (empErr) throw empErr;
        setAllEmployees(empData || []);

        // 2. ถ้าเป็น edit mode ให้โหลดข้อมูล course และ classes
        if (isEditMode) {
          const { data: courseData, error: cErr } = await supabase
            .from('courses').select('*').eq('id', editCourseId).single();
          if (cErr) throw cErr;

          const { data: classesData, error: clErr } = await supabase
            .from('classes').select('*').eq('course_id', editCourseId).eq('is_deleted', false).order('sort_order', { ascending: true });
          if (clErr) throw clErr;

          setCourse({
            title: courseData.title || '',
            description: courseData.description || '',
            allowRequest: !!courseData.allow_request,
            closingDate: courseData.closing_date || '',
            closingTime: courseData.closing_time || '',
            selectionMode: courseData.selection_mode || 'self',
            approverLevel: courseData.approver_level || ''
          });
          setConditions(courseData.target_conditions || { site: [], division: [], dept: [], section: [], level: [] });
          setMandatoryList(courseData.mandatory_list || []);
          setApproverIds(courseData.approver_ids || []);
          {
            const groups = courseData.assignment_groups;
            setAssignmentGroups(Array.isArray(groups) ? groups : []);
          }

          if ((classesData || []).length > 0) {
            const mapped = classesData.map(cls => ({
              id: cls.id,
              name: cls.name || '',
              date: cls.date || '',
              startTime: cls.start_time || '',
              endTime: cls.end_time || '',
              location: cls.location || '',
              locationUrl: cls.location_url || '',
              instructor: cls.instructor || '',
              maxSeats: String(cls.max_seats || ''),
              _isExisting: true,
              _origSortOrder: cls.sort_order ?? 0
            }));
            setClasses(mapped);
            setOriginalClassIds(classesData.map(c => c.id));
          }
        }
      } catch (err) {
        console.error(err);
        alert('โหลดข้อมูลไม่สำเร็จ: ' + (err.message || err));
      } finally {
        setLoadingDb(false);
      }
    };
    fetchAll();
  }, [navigate, editCourseId, isEditMode]);

  // --- Dynamic Cascading Dropdown Logic ---
  const availableOptions = useMemo(() => {
    const getValidOptionsForField = (field) => {
      const filteredEmployees = allEmployees.filter(emp => {
        let isValid = true;
        Object.keys(conditions).forEach(key => {
          if (key !== field && conditions[key].length > 0) {
            if (!conditions[key].includes(emp[key])) {
              isValid = false;
            }
          }
        });
        return isValid;
      });
      return [...new Set(filteredEmployees.map(e => e[field]).filter(Boolean))];
    };

    return {
      site: getValidOptionsForField('site'),
      division: getValidOptionsForField('division'),
      dept: getValidOptionsForField('dept'),
      section: getValidOptionsForField('section'),
      level: getValidOptionsForField('level'),
    };
  }, [conditions, allEmployees]);

  const handleClearConditions = () => {
    setConditions({ site: [], division: [], dept: [], section: [], level: [] });
  };

  const handleAddClass = () => {
    setClasses([...classes, { id: Date.now().toString(), name: `รุ่นที่ ${classes.length + 1}`, date: '', startTime: '', endTime: '', location: '', locationUrl: '', instructor: '', maxSeats: '' }]);
  };

  const handleDuplicateClass = (cls) => {
    setClasses([...classes, { ...cls, id: Date.now().toString(), name: `รุ่นที่ ${classes.length + 1}` }]);
  };

  const handleRemoveClass = (id) => {
    setClasses(classes.filter(c => c.id !== id));
  };

  const updateClass = (id, field, value) => {
    setClasses(classes.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleExportMandatoryTemplate = () => {
    let csvContent = "data:text/csv;charset=utf-8,EmployeeID\n";
    if (mandatoryList.length > 0) {
      csvContent += mandatoryList.map(id => {
        return `${id}`;
      }).join("\n");
    } else {
      csvContent += "EMP001\nEMP002\n";
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "mandatory_participants_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportMandatory = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').map(r => r.trim()).filter(Boolean);
      let startIdx = 0;
      if (rows.length > 0 && rows[0].toLowerCase().includes('emp')) {
        startIdx = 1;
      }

      const importedIds = [];
      for (let i = startIdx; i < rows.length; i++) {
        const cols = rows[i].split(',');
        const id = cols[0].trim();
        if (id && allEmployees.some(emp => emp.id === id)) {
          importedIds.push(id);
        }
      }

      const newList = [...new Set([...mandatoryList, ...importedIds])];
      setMandatoryList(newList);
      alert(`นำเข้าสำเร็จ ${importedIds.length} รายชื่อ (ระบบกรองเฉพาะรหัสพนักงานที่ถูกต้อง)`);
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (classes.length === 0) return alert('ต้องมีคลาสเรียนอย่างน้อย 1 รุ่น');
    if (course.selectionMode === 'approver' && !course.approverLevel) {
      return alert('กรุณาเลือกระดับหัวหน้าที่จะเป็นผู้กำหนดคลาส');
    }

    setLoadingDb(true);
    try {
      const courseId = isEditMode ? editCourseId : `course_${Date.now()}`;
      const cleanMandatoryList = mandatoryList.filter(Boolean);

      const coursePayload = {
        title: course.title || '',
        description: course.description || '',
        allow_request: Boolean(course.allowRequest),
        closing_date: course.closingDate || '',
        closing_time: course.closingTime || '',
        mandatory_list: cleanMandatoryList,
        target_conditions: course.allowRequest ? conditions : null,
        selection_mode: course.selectionMode || 'self',
        approver_level: course.selectionMode === 'approver' ? (course.approverLevel || '') : '',
        approver_ids: course.selectionMode === 'approver' ? approverIds.filter(Boolean) : [],
        assignment_groups: assignmentGroups
          .map(g => ({
            assigners: (g.assigners || []).filter(Boolean),
            participants: (g.participants || []).filter(Boolean)
          }))
          .filter(g => g.assigners.length > 0 && g.participants.length > 0),
        is_deleted: false
      };

      // 1. Save Course
      if (isEditMode) {
        const { error } = await supabase.from('courses').update(coursePayload).eq('id', courseId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('courses').insert({ id: courseId, ...coursePayload });
        if (error) throw error;
      }

      // 2. จัดการ Classes
      // - existing classes (มี _isExisting) → update
      // - new classes (ไม่มี _isExisting) → insert
      // - removed classes (อยู่ใน originalClassIds แต่ไม่อยู่ใน current classes) → soft-delete
      const currentClassIds = classes.filter(c => c._isExisting).map(c => c.id);
      const removedIds = originalClassIds.filter(id => !currentClassIds.includes(id));

      // 2a. Soft-delete removed
      for (const rid of removedIds) {
        await softDelete('classes', rid);
      }

      // 2b. Update existing / Insert new
      // - กรณี edit existing: คง sort_order เดิม (ไม่เปลี่ยนตำแหน่ง)
      // - กรณี new (insert): ให้ sort_order ต่อท้ายจาก max existing
      const maxExistingOrder = classes
        .filter(c => c._isExisting && c._origSortOrder !== undefined)
        .reduce((m, c) => Math.max(m, c._origSortOrder), -1);
      let newSortCounter = maxExistingOrder + 1;

      for (let i = 0; i < classes.length; i++) {
        const cls = classes[i];
        const sortOrder = cls._isExisting
          ? (cls._origSortOrder !== undefined ? cls._origSortOrder : i)
          : (newSortCounter++);

        const payload = {
          course_id: courseId,
          name: cls.name,
          max_seats: Number(cls.maxSeats) || 0,
          date: cls.date,
          start_time: cls.startTime,
          end_time: cls.endTime,
          location: cls.location,
          location_url: cls.locationUrl || '',
          instructor: cls.instructor || '',
          sort_order: sortOrder,
          is_deleted: false
        };

        if (cls._isExisting) {
          const { error } = await supabase.from('classes').update(payload).eq('id', cls.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('classes').insert({ id: cls.id, ...payload });
          if (error) throw error;
        }
      }

      await logAdminAction(isEditMode ? 'EDIT_COURSE' : 'CREATE_COURSE', {
        courseId,
        title: course.title,
        classCount: classes.length,
        removedClasses: removedIds.length
      });

      alert(isEditMode ? 'อัปเดตหลักสูตรเรียบร้อยแล้ว!' : 'บันทึกหลักสูตรเรียบร้อยแล้ว!');
      navigate('/admin');
    } catch (error) {
      console.error(error);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + (error.message || error));
      setLoadingDb(false);
    }
  };

  if (loadingDb && allEmployees.length === 0) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-transparent pb-12">
      <header className="app-header bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-3">
              <BrandLogo className="h-9 w-auto flex-shrink-0" />
              <h1 className="font-display text-lg sm:text-xl font-bold text-gray-900 truncate">{isEditMode ? 'แก้ไขหลักสูตร' : 'สร้างหลักสูตรใหม่'}</h1>
            </div>
          </div>
          <div className="mobile-action-rail sm:w-auto sm:flex sm:items-center sm:gap-3 sm:flex-wrap">
            <Link to="/admin" className="inline-flex items-center px-4 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors shadow-sm">
              <svg className="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              กลับหน้า Admin หลัก
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8">
        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Section 1: ข้อมูลหลักสูตร */}
          <div className="app-card rounded-2xl p-6 lg:p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
              <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">1</span>
              ข้อมูลหลักสูตร (Course Details)
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อหลักสูตร <span className="text-red-500">*</span></label>
                <input required type="text" value={course.title} onChange={e => setCourse({ ...course, title: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="เช่น การสื่อสารอย่างมีประสิทธิภาพ" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด / วัตถุประสงค์</label>
                <textarea rows="3" value={course.description} onChange={e => setCourse({ ...course, description: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="อธิบายรายละเอียดคร่าวๆ ของหลักสูตร"></textarea>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-orange-50/50 rounded-xl border border-orange-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-orange-800">วันที่ปิดรับลงทะเบียน <span className="text-red-500">*</span></label>
                  <input required type="date" value={course.closingDate} onChange={e => setCourse({ ...course, closingDate: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-orange-800">เวลาที่ปิดรับลงทะเบียน <span className="text-red-500">*</span></label>
                  <input required type="time" value={course.closingTime} onChange={e => setCourse({ ...course, closingTime: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: รายชื่อตามแผน (Mandatory) */}
          <div className="app-card rounded-2xl p-6 lg:p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900 flex items-center">
                <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">2</span>
                รายชื่อผู้เข้าร่วมหลัก (Mandatory Participants)
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportMandatoryTemplate}
                  className="px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-lg flex items-center"
                >
                  <svg className="w-4 h-4 mr-1.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Export CSV
                </button>
                <label className="px-3 py-1.5 text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg flex items-center cursor-pointer transition-colors">
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Import CSV
                  <input type="file" accept=".csv" onChange={handleImportMandatory} className="hidden" />
                </label>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-4">ระบุพนักงานที่ต้องเข้าร่วมหลักสูตรนี้โดยเฉพาะ หรือนำเข้าจากไฟล์ CSV (หัวคอลัมน์: EmployeeID)</p>

            <EmployeeMultiSelect
              allEmployees={allEmployees}
              selectedIds={mandatoryList}
              onChange={setMandatoryList}
            />
          </div>

          {/* Section 3: Allow Request */}
          <div className="app-card rounded-2xl p-6 lg:p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
              <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">3</span>
              การขอเข้าร่วม (Allow Request)
            </h2>

            <label className="flex items-start cursor-pointer group mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="flex items-center h-5 mt-0.5">
                <input
                  type="checkbox"
                  checked={course.allowRequest}
                  onChange={(e) => {
                    const isOn = e.target.checked;
                    // ถ้าเปิด allow_request → บังคับเป็น self mode (เพราะคนนอกไม่มีหัวหน้าระบุไว้)
                    setCourse({
                      ...course,
                      allowRequest: isOn,
                      ...(isOn ? { selectionMode: 'self', approverLevel: '' } : {})
                    });
                    if (isOn) setApproverIds([]);
                  }}
                  className="w-5 h-5 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                />
              </div>
              <div className="ml-3 text-sm">
                <span className="font-bold text-gray-900 text-base group-hover:text-blue-600 transition-colors">อนุญาตให้คนนอกรายชื่อกดเข้าร่วมได้ (Allow Request)</span>
                <p className="text-gray-500 mt-1">หากเปิดใช้งาน คุณสามารถระบุเงื่อนไขด้านล่างได้ว่าให้พนักงานกลุ่มไหนเห็นหลักสูตรนี้บ้าง</p>
                <p className="text-xs text-blue-600 mt-1 italic">💡 เมื่อเปิดใช้งาน รูปแบบการเลือกคลาสจะถูกบังคับเป็น "ผู้เข้าร่วมเลือกเอง" เท่านั้น</p>
              </div>
            </label>

            {course.allowRequest && (
              <div className="p-6 bg-blue-50/50 border border-blue-100 rounded-xl relative">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-blue-900">เงื่อนไขผู้มีสิทธิ์ขอเข้าร่วม (Target Audience)</h3>
                  <button
                    type="button"
                    onClick={handleClearConditions}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-white px-3 py-1 rounded-md border border-blue-200 shadow-sm transition-colors"
                  >
                    ล้างเงื่อนไข
                  </button>
                </div>
                <p className="text-xs text-blue-700 mb-5">💡 <strong>คำแนะนำ:</strong> เมื่อเลือกเงื่อนไขใด ช่องอื่นๆ จะถูกกรอง (Filter) ให้อัตโนมัติตามข้อมูลพนักงานที่มีอยู่จริง</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  <MultiSelect label="Site" options={availableOptions.site} selected={conditions.site} onChange={(v) => setConditions({ ...conditions, site: v })} placeholder="ทุก Site" />
                  <MultiSelect label="Division" options={availableOptions.division} selected={conditions.division} onChange={(v) => setConditions({ ...conditions, division: v })} placeholder="ทุก Division" />
                  <MultiSelect label="Department" options={availableOptions.dept} selected={conditions.dept} onChange={(v) => setConditions({ ...conditions, dept: v })} placeholder="ทุก Department" />
                  <MultiSelect label="Section" options={availableOptions.section} selected={conditions.section} onChange={(v) => setConditions({ ...conditions, section: v })} placeholder="ทุก Section" />
                  <MultiSelect label="Level" options={availableOptions.level} selected={conditions.level} onChange={(v) => setConditions({ ...conditions, level: v })} placeholder="ทุก Level" />
                </div>
              </div>
            )}
          </div>

          {/* Section 4: รูปแบบการเลือกคลาส */}
          <div className="app-card rounded-2xl p-6 lg:p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
              <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">4</span>
              รูปแบบการเลือกคลาส (Class Selection)
            </h2>

            {course.allowRequest && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm text-blue-800">
                  หลักสูตรนี้เปิดให้คนนอกเข้าร่วม → บังคับให้ผู้เข้าร่วมเลือกคลาสเอง<br />
                  <span className="text-xs text-blue-600">(หากต้องการให้หัวหน้าเลือก กรุณาปิดตัวเลือก "อนุญาตให้คนนอก" ในขั้นที่ 3 ก่อน)</span>
                </p>
              </div>
            )}

            <div className="space-y-3">
              <label className={`flex items-start cursor-pointer p-4 rounded-xl border-2 transition-colors ${course.selectionMode === 'self' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="selectionMode"
                  value="self"
                  checked={course.selectionMode === 'self'}
                  onChange={() => setCourse({ ...course, selectionMode: 'self', approverLevel: '' })}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="ml-3">
                  <p className="font-bold text-gray-900">ผู้เข้าร่วมเลือกคลาสเอง</p>
                  <p className="text-sm text-gray-500 mt-0.5">พนักงานเป็นผู้กดเลือกคลาสที่ต้องการเข้าอบรมเอง</p>
                </div>
              </label>

              {!course.allowRequest && (
              <label className={`flex items-start cursor-pointer p-4 rounded-xl border-2 transition-colors ${course.selectionMode === 'approver' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="selectionMode"
                  value="approver"
                  checked={course.selectionMode === 'approver'}
                  onChange={() => setCourse({ ...course, selectionMode: 'approver' })}
                  className="mt-1 w-4 h-4 text-orange-600 focus:ring-orange-500"
                />
                <div className="ml-3 flex-1">
                  <p className="font-bold text-gray-900">หัวหน้าเป็นผู้เลือกคลาสให้</p>
                  <p className="text-sm text-gray-500 mt-0.5">หัวหน้าตามระดับที่กำหนด เป็นคนเลือกคลาสให้พนักงานในสายงานในสายงาน</p>

                  {course.selectionMode === 'approver' && (
                    <div className="mt-3 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ระดับหัวหน้าขั้นต่ำ <span className="text-red-500">*</span></label>
                        <select
                          required={course.selectionMode === 'approver'}
                          value={course.approverLevel}
                          onChange={(e) => setCourse({ ...course, approverLevel: e.target.value })}
                          className="w-full sm:w-auto px-4 py-2 rounded-lg border border-orange-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="">-- เลือกระดับ --</option>
                          {['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'].map(lv => (
                            <option key={lv} value={lv}>{lv}</option>
                          ))}
                        </select>
                        <p className="text-xs text-orange-700 mt-2">
                          💡 พนักงานที่มีระดับ <strong>สูงกว่าหรือเท่ากับ</strong> ระดับนี้ จะเห็นเมนู "จัดการพนักงานในสายงาน" (เช่น เลือก L5 → L1–L5 จะเห็น)
                        </p>
                      </div>

                      <div className="pt-4 border-t border-orange-200">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ระบุรหัสหัวหน้าเจาะจง (ถ้าต้องการ)
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                          ถ้าระบุที่นี่ → จะใช้เฉพาะรายชื่อนี้เท่านั้น (override ระดับด้านบน) • หลายคนคั่นด้วย "," • ปล่อยว่าง = ใช้ตามระดับด้านบน
                        </p>
                        <div className="flex gap-2">
                          <textarea
                            rows="2"
                            value={approverIdInput}
                            onChange={(e) => setApproverIdInput(e.target.value)}
                            placeholder="เช่น 182992, 183026, 182214"
                            className="flex-1 px-3 py-2 rounded-lg border border-orange-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!approverIdInput.trim()) return;
                                const newIds = approverIdInput.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
                                const valid = newIds.filter(id => allEmployees.some(e => e.id === id));
                                const invalid = newIds.filter(id => !allEmployees.some(e => e.id === id));
                                const merged = [...new Set([...approverIds, ...valid])];
                                setApproverIds(merged);
                                setApproverIdInput('');
                                if (invalid.length > 0) {
                                  alert(`รหัสที่ไม่พบในระบบ (${invalid.length} รหัส):\n${invalid.join(', ')}`);
                                }
                              }}
                              className="px-3 py-1.5 bg-orange-500 text-white text-sm font-medium rounded hover:bg-orange-600 whitespace-nowrap"
                            >
                              เพิ่ม
                            </button>
                            <button
                              type="button"
                              onClick={() => setApproverIds([])}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-red-50 hover:text-red-600 border border-gray-200"
                            >
                              ล้าง
                            </button>
                          </div>
                        </div>

                        {approverIds.length > 0 && (
                          <div className="mt-3 p-3 bg-white border border-orange-200 rounded-lg flex flex-wrap gap-2">
                            {approverIds.map(id => {
                              const emp = allEmployees.find(e => e.id === id);
                              return (
                                <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-md text-xs">
                                  <span className="font-bold text-orange-700">{emp ? emp.level : '?'}</span>
                                  <span className="text-gray-700">{emp ? emp.id : `(ไม่พบ ${id})`}</span>
                                  <span className="text-gray-400">({id})</span>
                                  <button
                                    type="button"
                                    onClick={() => setApproverIds(approverIds.filter(x => x !== id))}
                                    className="text-orange-400 hover:text-red-600 font-bold ml-1"
                                  >
                                    &times;
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </label>
              )}
            </div>
          </div>

          {/* Section 4.5: มอบหมายผู้จัดคลาสแบบกลุ่ม (Class Assignment Groups) */}
          <div className="app-card rounded-2xl p-6 lg:p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center">
              <span className="bg-teal-100 text-teal-700 w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">+</span>
              มอบหมายผู้จัดคลาส (Class Assignment)
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              จับคู่ "ผู้จัดคลาส" กับ "ผู้เข้าร่วม" เป็นกลุ่ม — ผู้จัดคลาสในกลุ่มจะจัดคลาสให้เฉพาะผู้เข้าร่วมในกลุ่มเดียวกัน
              เพิ่มได้หลายกลุ่ม และทำงานร่วมกับโหมด "หัวหน้าเป็นผู้เลือก" ได้
            </p>

            <button
              type="button"
              onClick={() => setShowAssignModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              จัดการกลุ่มมอบหมาย
            </button>

            {/* สรุปกลุ่มที่มี */}
            {assignmentGroups.length === 0 ? (
              <p className="text-sm text-gray-400 italic mt-4">ยังไม่มีกลุ่มมอบหมาย</p>
            ) : (
              <div className="mt-4 space-y-2">
                {assignmentGroups.map((g, idx) => (
                  <div key={idx} className="p-3 bg-teal-50/70 border border-teal-200 rounded-lg text-sm">
                    <p className="font-medium text-teal-800">กลุ่มที่ {idx + 1}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      ผู้จัดคลาส {(g.assigners || []).length} คน • ผู้เข้าร่วม {(g.participants || []).length} คน
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 5: คลาสเรียน */}
          <div className="app-card rounded-2xl p-6 lg:p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900 flex items-center">
                <span className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">5</span>
                รอบการอบรม (Classes)
              </h2>
              <button type="button" onClick={handleAddClass} className="text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                เพิ่มรอบอบรม
              </button>
            </div>

            <div className="space-y-6">
              {classes.map((cls) => (
                <div key={cls.id} className="relative bg-white rounded-xl p-6 border-2 border-gray-100 hover:border-blue-200 transition-colors shadow-sm">
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button type="button" onClick={() => handleDuplicateClass(cls)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded transition-colors" title="คัดลอก (Duplicate)">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    {classes.length > 1 && (
                      <button type="button" onClick={() => handleRemoveClass(cls.id)} className="p-1.5 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded transition-colors" title="ลบ">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>

                  <div className="mb-4 pb-2 border-b border-gray-100 flex items-center">
                    <input
                      type="text"
                      value={cls.name}
                      onChange={e => updateClass(cls.id, 'name', e.target.value)}
                      className="text-base font-bold text-blue-900 bg-transparent border-none outline-none focus:ring-0 p-0 hover:bg-gray-50 rounded"
                    />
                    <svg className="w-4 h-4 ml-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                    <div className="md:col-span-4">
                      <label className="block text-xs font-medium text-gray-500 mb-1">วันที่ <span className="text-red-500">*</span></label>
                      <input required type="date" value={cls.date} onChange={e => updateClass(cls.id, 'date', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="md:col-span-4 flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">เวลาเริ่ม <span className="text-red-500">*</span></label>
                        <input required type="time" value={cls.startTime} onChange={e => updateClass(cls.id, 'startTime', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <span className="text-gray-400 mt-5">-</span>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">เวลาสิ้นสุด <span className="text-red-500">*</span></label>
                        <input required type="time" value={cls.endTime} onChange={e => updateClass(cls.id, 'endTime', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-xs font-medium text-gray-500 mb-1">สถานที่ <span className="text-red-500">*</span></label>
                      <input required type="text" value={cls.location} onChange={e => updateClass(cls.id, 'location', e.target.value)} placeholder="เช่น Meeting Room A" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Link แผนที่ (Google Maps)</label>
                      <input type="text" value={cls.locationUrl || ''} onChange={e => updateClass(cls.id, 'locationUrl', e.target.value)} placeholder="https://maps.app.goo.gl/..." className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-xs font-medium text-gray-500 mb-1">ชื่อวิทยากร</label>
                      <input type="text" value={cls.instructor} onChange={e => updateClass(cls.id, 'instructor', e.target.value)} placeholder="ระบุชื่อวิทยากร" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-xs font-medium text-gray-500 mb-1">จำนวนที่นั่งสูงสุด <span className="text-red-500">*</span></label>
                      <input required type="number" min="1" value={cls.maxSeats} onChange={e => updateClass(cls.id, 'maxSeats', e.target.value)} placeholder="เช่น 30" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mobile-sticky-actions flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4 pb-6 sm:pb-12">
            <Link to="/admin" className="inline-flex justify-center px-6 py-3 font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              ยกเลิก
            </Link>
            <button disabled={loadingDb} type="submit" className="px-8 py-3 font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors disabled:opacity-50">
              {loadingDb ? 'กำลังบันทึก...' : (isEditMode ? 'บันทึกการแก้ไข' : 'บันทึกและเปิดรับสมัคร')}
            </button>
          </div>
        </form>
      </main>

      {/* Modal: จัดการกลุ่มมอบหมายผู้จัดคลาส */}
      {showAssignModal && (
        <AssignmentGroupsModal
          groups={assignmentGroups}
          allEmployees={allEmployees}
          mandatoryList={mandatoryList}
          allowRequest={course.allowRequest}
          conditions={conditions}
          onSave={(g) => { setAssignmentGroups(g); setShowAssignModal(false); }}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  );
}

// ─── Assignment Groups Modal — จับคู่ผู้จัดคลาส ↔ ผู้เข้าร่วม ───────────────
function AssignmentGroupsModal({ groups, allEmployees, mandatoryList, allowRequest, conditions, onSave, onClose }) {
  // ทำงานบนสำเนา draft จนกว่าจะกดบันทึก
  const [draft, setDraft] = useState(() =>
    (groups || []).map(g => ({
      assigners: [...(g.assigners || [])],
      participants: [...(g.participants || [])]
    }))
  );

  const empIdSet = new Set((allEmployees || []).map(e => e.id));

  // ─── คำนวณ "รายชื่อผู้มีสิทธิ์เข้าหลักสูตรนี้" ───
  //   = mandatory_list + (ถ้า allowRequest) คนที่ match target conditions
  const eligibleIdSet = useMemo(() => {
    const s = new Set((mandatoryList || []).filter(Boolean));
    if (allowRequest && conditions) {
      (allEmployees || []).forEach(emp => {
        if (!emp || emp.is_deleted) return;
        const tc = conditions;
        const match =
          (!tc.site?.length || tc.site.includes(emp.site)) &&
          (!tc.division?.length || tc.division.includes(emp.division)) &&
          (!tc.dept?.length || tc.dept.includes(emp.dept)) &&
          (!tc.section?.length || tc.section.includes(emp.section)) &&
          (!tc.level?.length || tc.level.includes(emp.level));
        if (match) s.add(emp.id);
      });
    }
    return s;
  }, [mandatoryList, allowRequest, conditions, allEmployees]);

  // ตรวจสถานะของรหัสผู้เข้าร่วม -> 'ok' | 'outside' (ส้ม) | 'blocked' (แดง)
  const participantStatus = (id) => {
    if (eligibleIdSet.has(id)) return 'ok';
    // ไม่อยู่ในรายชื่อ: คลาสเปิด=ส้ม (เพิ่มได้), คลาสปิด=แดง (บันทึกไม่ได้)
    return allowRequest ? 'outside' : 'blocked';
  };

  // มีผู้เข้าร่วมที่เป็นสีแดง (blocked) อยู่ไหม -> ถ้ามี กดบันทึกไม่ได้
  const hasBlocked = draft.some(g =>
    (g.participants || []).some(id => participantStatus(id) === 'blocked')
  );

  const addGroup = () => setDraft([...draft, { assigners: [], participants: [] }]);
  const removeGroup = (idx) => setDraft(draft.filter((_, i) => i !== idx));

  // เพิ่มรหัสเข้าช่อง assigners/participants ของกลุ่ม idx
  //   assigners  -> ตรวจแค่ว่ามีในระบบ (เป็นใครก็ได้)
  //   participants -> ตรวจว่ามีในระบบ (สถานะ ส้ม/แดง คำนวณตอน render)
  const addIds = (idx, field, rawText) => {
    const ids = rawText.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    const valid = ids.filter(id => empIdSet.has(id));
    const invalid = ids.filter(id => !empIdSet.has(id));
    setDraft(draft.map((g, i) => {
      if (i !== idx) return g;
      return { ...g, [field]: [...new Set([...g[field], ...valid])] };
    }));
    if (invalid.length > 0) {
      alert(`รหัสที่ไม่พบในระบบ (${invalid.length} รหัส):\n${invalid.join(', ')}`);
    }
  };

  const removeId = (idx, field, id) => {
    setDraft(draft.map((g, i) =>
      i === idx ? { ...g, [field]: g[field].filter(x => x !== id) } : g
    ));
  };

  const handleSave = () => {
    if (hasBlocked) {
      alert('มีผู้เข้าร่วมที่อยู่นอกรายชื่อของหลักสูตรแบบปิด (ตัวสีแดง)\nกรุณาลบออกก่อนจึงจะบันทึกได้');
      return;
    }
    onSave(draft);
  };

  // ─── Export CSV ───
  const handleExport = () => {
    let rows = ['group,role,employee_id'];
    draft.forEach((g, idx) => {
      (g.assigners || []).forEach(id => rows.push(`${idx + 1},assigner,${id}`));
      (g.participants || []).forEach(id => rows.push(`${idx + 1},participant,${id}`));
    });
    const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assignment_groups_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Import CSV ───
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
      const startIdx = lines[0] && lines[0].toLowerCase().includes('group') ? 1 : 0;
      const map = {};   // groupNo -> { assigners:Set, participants:Set }
      let invalidCount = 0;
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const gno = cols[0], role = (cols[1] || '').toLowerCase(), eid = cols[2];
        if (!gno || !eid) continue;
        if (!empIdSet.has(eid)) { invalidCount++; continue; }
        if (!map[gno]) map[gno] = { assigners: new Set(), participants: new Set() };
        if (role === 'assigner') map[gno].assigners.add(eid);
        else if (role === 'participant') map[gno].participants.add(eid);
      }
      const imported = Object.keys(map).sort((a, b) => Number(a) - Number(b)).map(k => ({
        assigners: [...map[k].assigners],
        participants: [...map[k].participants]
      }));
      if (imported.length === 0) {
        alert('ไม่พบข้อมูลที่ถูกต้องในไฟล์ CSV');
      } else {
        setDraft(imported);
        alert(`นำเข้าสำเร็จ ${imported.length} กลุ่ม` + (invalidCount > 0 ? `\n(ข้าม ${invalidCount} รหัสที่ไม่พบในระบบ)` : ''));
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-teal-50/60 gap-2 flex-wrap">
          <h3 className="text-base sm:text-lg font-bold text-gray-900">มอบหมายผู้จัดคลาส (แบบกลุ่ม)</h3>
          <div className="flex gap-2">
            <button type="button" onClick={handleExport} className="px-3 py-1.5 text-xs font-medium border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50">
              Export CSV
            </button>
            <label className="px-3 py-1.5 text-xs font-medium border border-teal-200 bg-white text-teal-700 rounded-lg hover:bg-teal-50 cursor-pointer">
              Import CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
            </label>
            <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full" aria-label="ปิด">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-auto p-4 sm:p-6 flex-1 space-y-4">
          <p className="text-xs text-gray-500">
            รูปแบบ CSV: หัวคอลัมน์ <code className="bg-gray-100 px-1 rounded">group,role,employee_id</code> —
            role เป็น <code className="bg-gray-100 px-1 rounded">assigner</code> หรือ <code className="bg-gray-100 px-1 rounded">participant</code>
          </p>

          {/* คำอธิบายสีของผู้เข้าร่วม */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span> อยู่ในรายชื่อหลักสูตร</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span> นอกรายชื่อ (คลาสเปิด — เพิ่มได้)</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> นอกรายชื่อ (คลาสปิด — บันทึกไม่ได้)</span>
          </div>

          {draft.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-6">ยังไม่มีกลุ่ม — กด "เพิ่มกลุ่ม" ด้านล่าง</p>
          )}

          {draft.map((g, idx) => (
            <div key={idx} className="border border-teal-200 rounded-lg p-4 bg-white">
              <div className="flex justify-between items-center mb-3">
                <p className="font-bold text-teal-800">กลุ่มที่ {idx + 1}</p>
                <button type="button" onClick={() => removeGroup(idx)} className="text-red-500 hover:text-red-700 text-sm font-medium">
                  ลบกลุ่ม
                </button>
              </div>

              {/* ผู้จัดคลาส — เป็นใครก็ได้ ไม่ตรวจรายชื่อ */}
              <IdListField
                label="ผู้จัดคลาส (Assigners)"
                color="teal"
                ids={g.assigners}
                onAdd={(txt) => addIds(idx, 'assigners', txt)}
                onRemove={(id) => removeId(idx, 'assigners', id)}
              />
              {/* ผู้เข้าร่วม — ตรวจกับรายชื่อหลักสูตร แสดงสี */}
              <div className="mt-3">
                <IdListField
                  label="ผู้เข้าร่วม (Participants)"
                  color="blue"
                  ids={g.participants}
                  statusFn={participantStatus}
                  onAdd={(txt) => addIds(idx, 'participants', txt)}
                  onRemove={(id) => removeId(idx, 'participants', id)}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addGroup}
            className="w-full py-2.5 border-2 border-dashed border-teal-300 text-teal-700 rounded-lg text-sm font-medium hover:bg-teal-50 transition-colors"
          >
            + เพิ่มกลุ่ม
          </button>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3 flex-wrap">
          {hasBlocked ? (
            <p className="text-xs text-red-600 font-medium">⚠️ มีผู้เข้าร่วมนอกรายชื่อ (ตัวแดง) — ลบออกก่อนจึงจะบันทึกได้</p>
          ) : <span />}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 min-h-[40px]">
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={hasBlocked}
              className={`px-5 py-2 font-medium rounded-lg min-h-[40px] ${
                hasBlocked
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-teal-600 text-white hover:bg-teal-700'
              }`}
            >
              บันทึกกลุ่ม
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ช่องใส่รหัสพนักงาน (ใช้ใน AssignmentGroupsModal) ───
//   statusFn (optional) -> คืน 'ok' | 'outside' | 'blocked' ของแต่ละรหัส
//   ถ้าไม่ส่ง statusFn -> chip สีปกติทั้งหมด (ใช้กับช่องผู้จัดคลาส)
function IdListField({ label, color, ids, onAdd, onRemove, statusFn }) {
  const [input, setInput] = useState('');
  const isTeal = color === 'teal';
  const ring = isTeal ? 'focus:ring-teal-500 border-teal-300' : 'focus:ring-blue-500 border-blue-300';
  const btn = isTeal ? 'bg-teal-600 hover:bg-teal-700' : 'bg-blue-600 hover:bg-blue-700';
  const baseChip = isTeal ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-blue-50 border-blue-200 text-blue-700';

  // เลือกสี chip ตามสถานะ
  const chipClass = (id) => {
    if (!statusFn) return baseChip;
    const st = statusFn(id);
    if (st === 'blocked') return 'bg-red-50 border-red-300 text-red-700';
    if (st === 'outside') return 'bg-orange-50 border-orange-300 text-orange-700';
    return baseChip;
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ใส่รหัสพนักงาน คั่นด้วย , เช่น 182992, 183026"
          className={`flex-1 px-3 py-2 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 ${ring}`}
        />
        <button
          type="button"
          onClick={() => { onAdd(input); setInput(''); }}
          className={`px-3 py-1.5 text-white text-sm font-medium rounded ${btn} whitespace-nowrap`}
        >
          เพิ่ม
        </button>
      </div>
      {ids.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ids.map(id => {
            const st = statusFn ? statusFn(id) : 'ok';
            return (
              <span
                key={id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${chipClass(id)}`}
                title={st === 'blocked' ? 'นอกรายชื่อหลักสูตรแบบปิด — บันทึกไม่ได้' : st === 'outside' ? 'นอกรายชื่อ (คลาสเปิด)' : ''}
              >
                {id}
                {st === 'blocked' && <span className="text-[10px]">⛔</span>}
                {st === 'outside' && <span className="text-[10px]">นอกรายชื่อ</span>}
                <button type="button" onClick={() => onRemove(id)} className="font-bold hover:text-red-600">&times;</button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
