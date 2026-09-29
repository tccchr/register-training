import { supabase } from '../supabase';

/**
 * Convert get_class_seat_counts() rows into a { [classId]: count } lookup.
 */
export function seatCountRowsToMap(rows = []) {
  return (rows || []).reduce((acc, row) => {
    if (row?.class_id != null) acc[row.class_id] = Number(row.booked_count) || 0;
    return acc;
  }, {});
}

/**
 * Fetch identity-free seat counts from the database.
 * Falls back to currently visible reservation rows during a staged rollout so the UI
 * does not become unusable before the migration has been applied.
 */
export async function fetchClassSeatCounts(fallbackReservations = []) {
  const { data, error } = await supabase.rpc('get_class_seat_counts');
  if (!error) return seatCountRowsToMap(data || []);

  console.warn('get_class_seat_counts unavailable; using visible reservations as fallback', error);
  return (fallbackReservations || []).reduce((acc, reservation) => {
    if (!reservation?.is_deleted && reservation?.class_id) {
      acc[reservation.class_id] = (acc[reservation.class_id] || 0) + 1;
    }
    return acc;
  }, {});
}
