/**
 * Повертає поточну дату або передану дату у часовому поясі Europe/Kyiv.
 * Гарантує, що YYYY-MM-DD та години/хвилини відповідають саме київському часу!
 */
export function getKyivNow(): Date {
  // Конвертуємо поточний момент часу у київську часову зону
  const now = new Date()
  const kyivStr = now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })
  return new Date(kyivStr)
}

/**
 * Форматує дату у рядок YYYY-MM-DD суворо за часовим поясом Europe/Kyiv.
 */
export function formatLocalDate(dateInput?: Date | string | null): string {
  let d: Date
  if (dateInput) {
    if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateInput
    }
    const parsed = new Date(dateInput)
    d = isNaN(parsed.getTime()) ? getKyivNow() : parsed
  } else {
    d = getKyivNow()
  }

  // Отримуємо компоненти дати суворо в київському поясі
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(d)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value

  return `${year}-${month}-${day}`
}

/**
 * Повертає поточний час у Києві у форматі HH:MM (наприклад "14:30").
 */
export function getKyivTimeStr(): string {
  const now = new Date()
  return now.toLocaleTimeString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
