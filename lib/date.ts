/**
 * Форматує дату у локальний рядок YYYY-MM-DD без UTC-зміщення (пастки toISOString).
 */
export function formatLocalDate(dateInput?: Date | string | null): string {
  const d = dateInput ? new Date(dateInput) : new Date()
  if (isNaN(d.getTime())) {
    const fallback = new Date()
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(
      fallback.getDate()
    ).padStart(2, '0')}`
  }
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
