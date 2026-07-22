'use client'

interface TaskSummary {
  dueDate: string
  count: number
  hasHighPriority: boolean
}

interface HeatmapCalendarProps {
  selectedDate: string
  onSelectDate: (dateStr: string) => void
  taskSummaries: Record<string, { count: number; hasHighPriority: boolean }>
}

export default function HeatmapCalendar({
  selectedDate,
  onSelectDate,
  taskSummaries,
}: HeatmapCalendarProps) {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()

  // Отримуємо кількість днів у поточному місяці
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay()

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const offsetArray = Array.from({ length: (firstDayOfWeek + 6) % 7 }, (_, i) => i)

  return (
    <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8E8E93]">
          Календар навантаження (Heatmap)
        </h3>
        <span className="text-xs text-[#A78BFA] font-medium">
          {today.toLocaleString('uk-UA', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* Дні тижня */}
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-[#636366] mb-1.5">
        <span>Пн</span>
        <span>Вт</span>
        <span>Ср</span>
        <span>Чт</span>
        <span>Пт</span>
        <span>Сб</span>
        <span>Нд</span>
      </div>

      {/* Сітка днів */}
      <div className="grid grid-cols-7 gap-1.5">
        {offsetArray.map((_, index) => (
          <div key={`offset-${index}`} className="h-8 rounded-lg opacity-0" />
        ))}

        {daysArray.map((day) => {
          const dateObj = new Date(currentYear, currentMonth, day)
          const dateStr = dateObj.toISOString().split('T')[0]
          const isToday = day === today.getDate()
          const isSelected = dateStr === selectedDate

          const info = taskSummaries[dateStr] || { count: 0, hasHighPriority: false }

          // Визначення кольору завантаженості (GitHub Contribution Style)
          let bgColor = 'bg-[#1C1C1E]'
          if (info.count > 0) {
            if (info.hasHighPriority) {
              bgColor = 'bg-[#FF5E5E]/80 text-white font-bold'
            } else if (info.count >= 4) {
              bgColor = 'bg-[#FFAE58] text-black font-bold'
            } else {
              bgColor = 'bg-[#5EA5FF]/60 text-white font-medium'
            }
          }

          return (
            <button
              key={day}
              onClick={() => onSelectDate(dateStr)}
              className={`h-8 rounded-lg text-xs flex flex-col items-center justify-center relative transition-all active:scale-95 ${bgColor} ${
                isSelected ? 'ring-2 ring-white scale-105 z-10' : ''
              } ${isToday ? 'border border-[#FF5E5E]' : ''}`}
            >
              <span>{day}</span>
              {info.count > 0 && (
                <span className="text-[9px] leading-none opacity-90">{info.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
