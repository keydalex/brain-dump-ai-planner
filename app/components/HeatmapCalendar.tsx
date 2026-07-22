'use client'

import { useState } from 'react'
import { formatLocalDate } from '@/lib/date'
import { ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'

interface HeatmapCalendarProps {
  selectedDate: string
  onSelectDate: (dateStr: string) => void
  taskSummaries: Record<string, { count: number; hasHighPriority: boolean }>
}

export default function HeatmapCalendar({ selectedDate, onSelectDate, taskSummaries }: HeatmapCalendarProps) {
  const [viewDate, setViewDate] = useState(new Date())

  const currentYear = viewDate.getFullYear()
  const currentMonth = viewDate.getMonth()
  const today = new Date()

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay()
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const offsetArray = Array.from({ length: (firstDayOfWeek + 6) % 7 }, (_, i) => i)

  const changeMonth = (offset: number) => {
    const newD = new Date(viewDate)
    newD.setMonth(newD.getMonth() + offset)
    setViewDate(newD)
  }

  const changeYear = (offset: number) => {
    const newD = new Date(viewDate)
    newD.setFullYear(newD.getFullYear() + offset)
    setViewDate(newD)
  }

  const jumpToToday = () => {
    const now = new Date()
    setViewDate(now)
    onSelectDate(formatLocalDate(now))
  }

  return (
    <div className="bg-[#161618] border border-[#232326] rounded-2xl p-3.5 mb-3">
      {/* Шапка */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white font-bold capitalize">
            {viewDate.toLocaleString('uk-UA', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={jumpToToday} className="text-[10px] bg-[#FF5E5E]/15 hover:bg-[#FF5E5E]/25 text-[#FF5E5E] font-bold px-2 py-0.5 rounded-lg transition-all active:scale-95">
            Сьогодні
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => changeMonth(-1)} className="p-1 text-[#636366] hover:text-white rounded-lg hover:bg-[#232326] transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => changeMonth(1)} className="p-1 text-[#636366] hover:text-white rounded-lg hover:bg-[#232326] transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => changeYear(1)} className="p-1 text-[#636366] hover:text-white rounded-lg hover:bg-[#232326] transition-all">
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Дні тижня */}
      <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-semibold text-[#636366] mb-1.5 uppercase tracking-wider">
        <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span>
        <span className="text-[#FFAE58]/70">Сб</span><span className="text-[#FF5E5E]/70">Нд</span>
      </div>

      {/* Сітка */}
      <div className="grid grid-cols-7 gap-1">
        {offsetArray.map((_, index) => <div key={`off-${index}`} className="h-9 rounded-xl opacity-0" />)}

        {daysArray.map((day) => {
          const dateObj = new Date(currentYear, currentMonth, day)
          const dateStr = formatLocalDate(dateObj)
          const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()
          const isSelected = dateStr === selectedDate
          const info = taskSummaries[dateStr] || { count: 0, hasHighPriority: false }
          const { count, hasHighPriority } = info

          // Логіка кольорів:
          // Сьогодні — завжди яскраво сяє
          // Дні з задачами — 4 рівні насиченості за к-стю
          // Дні з P1 задачами — червоний відтінок
          let dayStyle = ''
          let textColor = 'text-[#636366]'
          let showRing = false

          if (isSelected && isToday) {
            dayStyle = 'bg-[#FF5E5E] ring-2 ring-white ring-offset-2 ring-offset-[#161618] shadow-lg shadow-[#FF5E5E]/50'
            textColor = 'text-white'
          } else if (isSelected) {
            dayStyle = 'bg-[#FF5E5E] shadow-md shadow-[#FF5E5E]/30'
            textColor = 'text-white'
          } else if (isToday) {
            // Сьогодні — пульсуюче сяяння
            dayStyle = 'bg-[#FF5E5E]/20 ring-2 ring-[#FF5E5E]/80 shadow-md shadow-[#FF5E5E]/20'
            textColor = 'text-[#FF5E5E] font-extrabold'
          } else if (count > 0) {
            // Рівні насиченості залежно від к-сті задач
            if (hasHighPriority) {
              // P1 задачі — помаранчево-червоний
              if (count >= 8) dayStyle = 'bg-[#FF5E5E]/55'
              else if (count >= 4) dayStyle = 'bg-[#FF5E5E]/38'
              else dayStyle = 'bg-[#FF5E5E]/22'
              textColor = 'text-[#FF5E5E]'
            } else {
              // Звичайні задачі — синьо-фіолетовий (не конфліктує з сьогодні)
              if (count >= 12) {
                dayStyle = 'bg-[#A78BFA]/40'
                textColor = 'text-[#A78BFA]'
              } else if (count >= 8) {
                dayStyle = 'bg-[#A78BFA]/28'
                textColor = 'text-[#A78BFA]/90'
              } else if (count >= 4) {
                dayStyle = 'bg-[#5EA5FF]/22'
                textColor = 'text-[#5EA5FF]/80'
              } else {
                // 1-3 задачі — ледь помітний
                dayStyle = 'bg-[#5EA5FF]/12'
                textColor = 'text-[#8E8E93]'
              }
            }
          } else {
            dayStyle = 'bg-[#1C1C1E]'
          }

          return (
            <button
              key={day}
              onClick={() => onSelectDate(dateStr)}
              className={`h-9 rounded-xl text-xs flex flex-col items-center justify-center relative transition-all active:scale-90 ${dayStyle} ${textColor} ${isToday ? 'animate-[todayGlow_2s_ease-in-out_infinite]' : ''}`}
            >
              <span className="leading-none font-semibold">{day}</span>
              {count > 0 && (
                <span className="text-[8px] leading-none opacity-70 mt-0.5">{count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
