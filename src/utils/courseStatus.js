export const getClassEndDateTime = (cls) => {
  if (!cls?.date) return null;
  const time = cls.end_time || cls.start_time || '23:59';
  const value = new Date(`${cls.date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
};

export const getCourseEndDateTime = (course) => {
  const dates = (course?.classes || [])
    .map(getClassEndDateTime)
    .filter(Boolean);

  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map(d => d.getTime())));
};

export const isClassFinished = (cls, now = new Date()) => {
  const end = getClassEndDateTime(cls);
  return !!end && end < now;
};

export const isCourseFinished = (course, now = new Date()) => {
  const end = getCourseEndDateTime(course);
  return !!end && end < now;
};

export const getCourseStatus = (course, now = new Date()) =>
  isCourseFinished(course, now) ? 'Finish' : 'Wait';

export const getCourseClosingDateTime = (course) => {
  if (!course?.closing_date || !course?.closing_time) return null;
  const value = new Date(`${course.closing_date}T${course.closing_time}`);
  return Number.isNaN(value.getTime()) ? null : value;
};

export const getClosingSortValue = (course, now = new Date()) => {
  const closing = getCourseClosingDateTime(course);
  if (!closing) return Number.MAX_SAFE_INTEGER;
  const diff = closing.getTime() - now.getTime();
  return diff >= 0 ? diff : Number.MAX_SAFE_INTEGER + Math.abs(diff);
};
