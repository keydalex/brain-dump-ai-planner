'use client'

import { useState } from 'react'
import { formatLocalDate } from '@/lib/date'
import { ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'

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
    <div className="bg-[#161618] border border-[#232326] rounded-2xl p-3.5 mb-4">
      {/* Шапка календаря з кнопкою "Сьогодні" та елементами навігації */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white font-bold capitalize">
            {viewDate.toLocaleString('uk-UA', { month: 'long', year: 'numeric' })}
          </span>

          <button
            onClick={jumpToToday}
            className="text-[10px] bg-[#FF5E5E]/15 hover:bg-[#FF5E5E]/25 text-[#FF5E5E] font-bold px-2 py-0.5 rounded-lg transition-all active:scale-95"
            title="Швидке повернення на сьогодні"
          >
            Сьогодні
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => changeMonth(-1)}
            className="p-1 text-[#8E8E93] hover:text-white rounded-lg hover:bg-[#232326] transition-all"
            title="1 місяць назад"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => changeMonth(1)}
            className="p-1 text-[#8E8E93] hover:text-white rounded-lg hover:bg-[#232326] transition-all"
            title="1 місяць вперед"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => changeYear(1)}
            className="p-1 text-[#8E8E93] hover:text-white rounded-lg hover:bg-[#232326] transition-all"
            title="1 рік вперед"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Дні тижня */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-[#636366] mb-1.5">
        <span>Пн</span>
        <span>Вт</span>
        <span>Ср</span>
        <span>Чт</span>
        <span>Пт</span>
        <span>Сб</span>
        <span>Нд</span>
      </div>

      {/* Сітка днів з новими порогами насиченості (2-4, 4-6, 6-8, 8+) */}
      <div className="grid grid-cols-7 gap-1">
        {offsetArray.map((_, index) => (
          <div key={`offset-${index}`} className="h-8 rounded-lg opacity-0" />
        ))}

        {daysArray.map((day) => {
          const dateObj = new Date(currentYear, currentMonth, day)
          const dateStr = formatLocalDate(dateObj)
          const isToday =
            day === today.getDate() &&
            currentMonth === today.getMonth() &&
            currentYear === today.getFullYear()

          const isSelected = dateStr === selectedDate
          const info = taskSummaries[dateStr] || { count: 0, hasHighPriority: false }

          // Насиченість кольору за вимогами:
          // 2-4: легенький, 4-6: середній, 6-8: побільше, 8+: насичений колір
          let bgColor = 'bg-[#1C1C1E] text-[#8E8E93]'
          if (info.count > 0) {
            if (info.count >= 8 || info.hasHighPriority) {
              bgColor = 'bg-[#FF5E5E] text-white font-black shadow-md shadow-[#FF5E5E]/40'
            } else if (info.count >= 6) {
              bgColor = 'bg-[#FF5E5E]/80 text-white font-bold'
            } else if (info.count >= 4) {
              bgColor = 'bg-[#FF5E5E]/55 text-white font-medium'
            } else {
              bgColor = 'bg-[#FF5E5E]/30 text-white/90'
            }
          }

          return (
            <button
              key={day}
              onClick={() => onSelectDate(dateStr)}
              className={`h-8 rounded-lg text-xs flex flex-col items-center justify-center relative transition-all active:scale-95 ${bgColor} ${
                isSelected ? 'ring-2 ring-white scale-105 z-10 text-white font-extrabold' : ''
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
