import { supabase } from '../supabase';

/**
 * Soft delete — set is_deleted = true แทนการลบจริง
 * พยายาม set deleted_at ด้วย — ถ้า column ไม่มี (เก่า) ก็ fallback แค่ is_deleted
 */
export const softDelete = async (tableName, id) => {
  // ลอง update with deleted_at ก่อน
  let { error } = await supabase
    .from(tableName)
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);

  // ถ้า error เพราะ column ไม่มี → fallback แค่ is_deleted
  if (error && /deleted_at/.test(error.message || '')) {
    const fallback = await supabase
      .from(tableName)
      .update({ is_deleted: true })
      .eq('id', id);
    error = fallback.error;
  }

  if (error) {
    console.error(`softDelete ${tableName}/${id}:`, error);
    throw error;
  }
  return true;
};
