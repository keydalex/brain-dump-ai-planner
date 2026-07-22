'use client'

import { useState } from 'react'
import { formatLocalDate } from '@/lib/date'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface WeekTabProps {
  selectedDate: string
  onSelectDate: (dateStr: string) => void
}

export default function WeekTab({ selectedDate, onSelectDate }: WeekTabProps) {
  const [baseDate, setBaseDate] = useState(new Date())
  const today = new Date()

  // Генеруємо 7 днів тижня від baseDate
  const currentDayOfWeek = baseDate.getDay()
  const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek
  const monday = new Date(baseDate)
  monday.setDate(baseDate.getDate() + mondayOffset)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })

  const changeWeek = (offsetDays: number) => {
    const newD = new Date(baseDate)
    newD.setDate(newD.getDate() + offsetDays)
    setBaseDate(newD)
  }

  const jumpToToday = () => {
    const now = new Date()
    setBaseDate(now)
    onSelectDate(formatLocalDate(now))
  }

  return (
    <div className="mb-4">
      {/* Шапка тижневого календаря з можливістю гортати та швидким поверненням на сьогодні */}
      <div className="flex justify-between items-center mb-2 px-1">
        <button
          onClick={jumpToToday}
          className="text-[10px] bg-[#FF5E5E]/15 hover:bg-[#FF5E5E]/25 text-[#FF5E5E] font-bold px-2 py-0.5 rounded-lg transition-all active:scale-95 flex items-center gap-1"
        >
          🗓️ Сьогодні
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => changeWeek(-7)}
            className="p-1 text-[#8E8E93] hover:text-white rounded-lg hover:bg-[#232326] transition-all"
            title="Тиждень назад"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => changeWeek(7)}
            className="p-1 text-[#8E8E93] hover:text-white rounded-lg hover:bg-[#232326] transition-all"
            title="Тиждень вперед"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
        {weekDays.map((d) => {
          const dateStr = formatLocalDate(d)
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
    </div>
  )
}
