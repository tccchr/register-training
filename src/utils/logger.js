import { supabase } from '../supabase';

export const logAdminAction = async (action, details) => {
  try {
    // ดึง actor จาก Supabase session (อีเมลผู้ใช้ที่ login อยู่)
    let actor = 'Admin';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (email) actor = `Admin (${email})`;
    } catch (e) {
      // ถ้าดึง session ไม่ได้ ใช้ค่า default 'Admin'
      console.warn('logAdminAction: cannot get session', e);
    }

    // เรียกผ่าน RPC function ที่ฝั่ง Supabase เพื่อความปลอดภัย
    await supabase.rpc('log_action', {
      p_action: action,
      p_details: details,
      p_actor: actor
    });
  } catch (error) {
    console.error('Failed to log action:', error);
  }
};
