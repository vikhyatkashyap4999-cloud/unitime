
/**
 * Formats a 24-hour time string (HH:mm) into a 12-hour string (h:mm AM/PM).
 * @param time24 - Time in "HH:mm" format.
 */
export const formatTime12h = (time24: string): string => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
};
