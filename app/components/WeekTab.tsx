'use client'

interface WeekTabProps {
  selectedDate: string
  onSelectDate: (dateStr: string) => void
}

export default function WeekTab({ selectedDate, onSelectDate }: WeekTabProps) {
  const today = new Date()
  
  // Генеруємо 7 днів почного тижня (з понеділка по неділю)
  const currentDayOfWeek = today.getDay()
  const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-2 mb-4">
      {weekDays.map((d) => {
        const dateStr = d.toISOString().split('T')[0]
        const isSelected = dateStr === selectedDate
        const isToday = d.toDateString() === today.toDateString()
        const dayName = d.toLocaleDateString('uk-UA', { weekday: 'short' })
        const dayNum = d.getDate()

        return (
          <button
            key={dateStr}
            onClick={() => onSelectDate(dateStr)}
            className={`flex-1 min-w-[54px] py-3 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 border ${
              isSelected
                ? 'bg-[#FF5E5E] text-white border-[#FF5E5E] shadow-lg shadow-[#FF5E5E]/20 font-bold scale-105'
                : 'bg-[#161618] text-[#8E8E93] border-[#232326] hover:text-white'
            } ${isToday && !isSelected ? 'border-[#FF5E5E]/50 text-[#FF5E5E]' : ''}`}
          >
            <span className="text-[11px] font-medium capitalize">{dayName}</span>
            <span className="text-base mt-0.5">{dayNum}</span>
          </button>
        )
      })}
    </div>
  )
}
