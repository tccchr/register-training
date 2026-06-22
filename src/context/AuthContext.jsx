import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

/**
 * AuthContext — จัดการ session / role / employee profile กลางทั้งระบบ
 *
 * Flow:
 *   1. ผู้ใช้ login ผ่าน Microsoft 365 (Supabase OAuth - azure provider)
 *   2. Supabase คืน session ที่มี email ของ user
 *   3. เอา email ไป map กับ employees table -> ได้ profile (id, name, division, level, ...)
 *   4. เช็ค admin_users table -> ได้ role (admin / user)
 *
 * สำคัญ — ข้อควรระวังของ Supabase:
 *   ห้าม await Supabase call (เช่น .from().select()) ข้างใน callback ของ
 *   onAuthStateChange โดยตรง เพราะ callback ทำงานภายใต้ navigator lock เดียวกับ
 *   getSession()/auto-refresh -> จะ deadlock ค้าง การโหลด profile จึงต้อง defer
 *   ออกมานอก callback (ใช้ setTimeout 0 / queueMicrotask)
 *
 * State ที่ให้:
 *   session    — Supabase session object (null = ยังไม่ login)
 *   email      — email ของ user ที่ login
 *   employee   — record จาก employees table (null = email ไม่อยู่ในระบบ)
 *   isAdmin    — boolean
 *   loading    — กำลังเช็ค session
 *   notRegistered — login M365 สำเร็จ แต่ email ไม่มีใน employees
 */

const AuthContext = createContext(null);

// timeout กันค้าง: เผื่อกรณีเลวร้ายจริงๆ (เน็ตหลุด / Supabase ไม่ตอบ)
// flow ปกติจะปลด loading เร็วกว่านี้มาก timer นี้แทบไม่ถูกใช้
const AUTH_INIT_TIMEOUT_MS = 12000;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notRegistered, setNotRegistered] = useState(false);

  const mountedRef = useRef(true);
  const sessionRef = useRef(null);
  const profileEmailRef = useRef(null);

  // --- โหลด profile จาก email ---
  // หมายเหตุ: ฟังก์ชันนี้ "ห้าม" ถูก await โดยตรงภายใน callback ของ onAuthStateChange
  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession?.user?.email) {
      profileEmailRef.current = null;
      if (mountedRef.current) {
        setEmployee(null);
        setIsAdmin(false);
        setNotRegistered(false);
      }
      return;
    }

    const email = currentSession.user.email.toLowerCase();

    try {
      // 1. หา employee จาก email
      const { data: empData } = await supabase
        .from('employees')
        .select('*')
        .ilike('email', email)
        .eq('is_deleted', false)
        .maybeSingle();

      // 2. เช็ค admin
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('email')
        .ilike('email', email)
        .maybeSingle();

      if (!mountedRef.current) return;

      profileEmailRef.current = email;

      if (empData) {
        setEmployee(empData);
        setNotRegistered(false);
      } else {
        // login M365 สำเร็จ แต่ email ไม่อยู่ใน master table
        setEmployee(null);
        setNotRegistered(true);
      }
      setIsAdmin(!!adminData);
    } catch (err) {
      console.error('loadProfile error:', err);
      if (mountedRef.current) {
        profileEmailRef.current = null;
        setEmployee(null);
        setIsAdmin(false);
      }
    }
  }, []);

  // --- เช็ค session ตอนเปิดแอป + ฟังการเปลี่ยนแปลง ---
  useEffect(() => {
    mountedRef.current = true;

    // safety timeout: เผื่อกรณีเลวร้ายจริงๆ -> ปลด loading กันหน้าเว็บค้างถาวร
    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) {
        console.warn('Auth init timeout — ปลด loading เพื่อกันหน้าเว็บค้าง');
        setLoading(false);
      }
    }, AUTH_INIT_TIMEOUT_MS);

    const finishLoading = () => {
      clearTimeout(safetyTimer);
      if (mountedRef.current) setLoading(false);
    };

    // จัดการ session ที่ได้รับ — โหลด profile แล้วปลด loading
    const handleSession = async (s) => {
      sessionRef.current = s;
      if (mountedRef.current) setSession(s);
      try {
        await loadProfile(s);
      } catch (err) {
        console.error('handleSession loadProfile error:', err);
      } finally {
        finishLoading();
      }
    };

    // ฟัง auth state — callback นี้ "ห้าม" await Supabase call โดยตรง
    // จึง defer การโหลด profile ออกมาด้วย setTimeout(0) เพื่อหลุดจาก navigator lock
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        const nextEmail = s?.user?.email?.toLowerCase() || null;

        // อัปเดต session แบบ synchronous ได้ (ไม่ใช่ Supabase call)
        sessionRef.current = s;
        if (mountedRef.current) setSession(s);

        // TOKEN_REFRESHED มักเกิดตอนกลับมาแท็บเดิม ไม่จำเป็นต้อง reload employee/admin profile
        if (_event === 'TOKEN_REFRESHED') {
          finishLoading();
          return;
        }

        // ลดการ reload profile ซ้ำเมื่อ Supabase ยิง SIGNED_IN/INITIAL_SESSION ด้วย user เดิม
        if ((_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION') && nextEmail && profileEmailRef.current === nextEmail) {
          finishLoading();
          return;
        }

        // โหลด profile แบบ deferred — หลุดออกจาก lock context ของ callback
        setTimeout(() => {
          if (!mountedRef.current) return;
          loadProfile(s).finally(finishLoading);
        }, 0);
      }
    );

    // โหลด session ครั้งแรกตอนเปิดแอป
    // onAuthStateChange จะยิง event INITIAL_SESSION ให้อยู่แล้ว แต่เรียก getSession()
    // เพิ่มเพื่อความชัวร์ (เช่นกรณี callback ยิงช้า)
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        if (mountedRef.current) handleSession(s);
      })
      .catch((err) => {
        console.error('getSession error:', err);
        finishLoading();
      });

    return () => {
      mountedRef.current = false;
      clearTimeout(safetyTimer);
      subscription?.unsubscribe();
    };
  }, [loadProfile]);

  // --- login ด้วย Microsoft 365 (Azure provider) ---
  // forceSelectAccount = true -> บังคับ Microsoft แสดงหน้าเลือก account
  //   ใช้ตอนผู้ใช้กด "เข้าด้วยอีเมลอื่น / สลับผู้ใช้" จะได้ไม่ login อัตโนมัติด้วย account เดิม
  const signInWithMicrosoft = useCallback(async (forceSelectAccount = false) => {
    // base URL — รองรับ HashRouter บน GitHub Pages
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email openid profile',
        redirectTo,
        // prompt=select_account -> Microsoft จะถามให้เลือก account เสมอ
        ...(forceSelectAccount ? { queryParams: { prompt: 'select_account' } } : {})
      }
    });
    if (error) throw error;
  }, []);

  // --- logout ---
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('signOut error:', err);
    }
    sessionRef.current = null;
    profileEmailRef.current = null;
    setSession(null);
    setEmployee(null);
    setIsAdmin(false);
    setNotRegistered(false);
  }, []);

  const value = {
    session,
    email: session?.user?.email || null,
    employee,
    isAdmin,
    loading,
    notRegistered,
    isAuthenticated: !!session,
    signInWithMicrosoft,
    signOut,
    reloadProfile: () => loadProfile(session)
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
