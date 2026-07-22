'use client'

import { useState } from 'react'
import { formatLocalDate } from '@/lib/date'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface WeekTabProps {
  selectedDate: string
  onSelectDate: (dateStr: string) => void
  taskSummaries?: Record<string, { count: number; hasHighPriority: boolean }>
}

export default function WeekTab({ selectedDate, onSelectDate, taskSummaries = {} }: WeekTabProps) {
  const [baseDate, setBaseDate] = useState(new Date())
  const today = new Date()

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

  // Місяць/рік для заголовка
  const weekLabel = (() => {
    const first = weekDays[0]
    const last = weekDays[6]
    const month1 = first.toLocaleDateString('uk-UA', { month: 'short' })
    const month2 = last.toLocaleDateString('uk-UA', { month: 'short' })
    if (first.getMonth() === last.getMonth()) {
      return `${month1} ${first.getFullYear()}`
    }
    return `${month1} — ${month2} ${last.getFullYear()}`
  })()

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8E8E93] font-medium capitalize">{weekLabel}</span>
          <button
            onClick={jumpToToday}
            className="text-[10px] bg-[#FF5E5E]/15 hover:bg-[#FF5E5E]/25 text-[#FF5E5E] font-bold px-2 py-0.5 rounded-lg transition-all active:scale-95"
          >
            Сьогодні
          </button>
        </div>

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

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
        {weekDays.map((d) => {
          const dateStr = formatLocalDate(d)
          const isSelected = dateStr === selectedDate
          const isToday = d.toDateString() === today.toDateString()
          const dayName = d.toLocaleDateString('uk-UA', { weekday: 'short' })
          const dayNum = d.getDate()
          const info = taskSummaries[dateStr] || { count: 0, hasHighPriority: false }

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={`flex-1 min-w-[44px] py-2.5 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 border gap-0.5 relative ${
                isSelected
                  ? 'bg-[#FF5E5E] text-white border-[#FF5E5E] shadow-lg shadow-[#FF5E5E]/20 font-bold scale-105'
                  : isToday
                  ? 'bg-[#FF5E5E]/10 border-[#FF5E5E]/50 text-[#FF5E5E]'
                  : info.hasHighPriority
                  ? 'bg-[#FF5E5E]/20 border-[#FF5E5E]/30 text-white'
                  : info.count > 0
                  ? 'bg-[#161618] border-[#FFAE58]/30 text-[#8E8E93] hover:text-white'
                  : 'bg-[#161618] text-[#8E8E93] border-[#232326] hover:text-white'
              }`}
            >
              <span className="text-[10px] font-medium capitalize leading-none">{dayName}</span>
              <span className="text-sm font-bold leading-tight">{dayNum}</span>
              {info.count > 0 ? (
                <span
                  className={`text-[9px] font-extrabold leading-none px-1.5 py-0.5 rounded-full ${
                    isSelected
                      ? 'bg-white/30 text-white'
                      : info.hasHighPriority
                      ? 'bg-[#FF5E5E] text-white'
                      : 'bg-[#FFAE58]/30 text-[#FFAE58]'
                  }`}
                >
                  {info.count}
                </span>
              ) : (
                <span className="h-[16px]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
