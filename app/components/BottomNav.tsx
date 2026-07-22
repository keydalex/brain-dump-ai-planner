'use client'

import { Calendar, CalendarDays, Inbox, Settings, Sparkles } from 'lucide-react'

interface BottomNavProps {
  activeTab: 'today' | 'week' | 'inbox' | 'settings'
  setActiveTab: (tab: 'today' | 'week' | 'inbox' | 'settings') => void
  taskCountToday: number
  taskCountInbox: number
}

export default function BottomNav({
  activeTab,
  setActiveTab,
  taskCountToday,
  taskCountInbox,
}: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-[#161618]/90 backdrop-blur-xl border-t border-[#232326] px-6 py-3 flex justify-between items-center z-50">
      <button
        onClick={() => setActiveTab('today')}
        className={`flex flex-col items-center gap-1 transition-all ${
          activeTab === 'today' ? 'text-[#FF5E5E] scale-105' : 'text-[#8E8E93] hover:text-white'
        }`}
      >
        <div className="relative">
          <Calendar className="w-5 h-5" />
          {taskCountToday > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-[#FF5E5E] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {taskCountToday}
            </span>
          )}
        </div>
        <span className="text-[11px] font-medium">Today</span>
      </button>

      <button
        onClick={() => setActiveTab('week')}
        className={`flex flex-col items-center gap-1 transition-all ${
          activeTab === 'week' ? 'text-[#FF5E5E] scale-105' : 'text-[#8E8E93] hover:text-white'
        }`}
      >
        <CalendarDays className="w-5 h-5" />
        <span className="text-[11px] font-medium">Week</span>
      </button>

      <button
        onClick={() => setActiveTab('inbox')}
        className={`flex flex-col items-center gap-1 transition-all ${
          activeTab === 'inbox' ? 'text-[#FF5E5E] scale-105' : 'text-[#8E8E93] hover:text-white'
        }`}
      >
        <div className="relative">
          <Inbox className="w-5 h-5" />
          {taskCountInbox > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-[#A78BFA] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {taskCountInbox}
            </span>
          )}
        </div>
        <span className="text-[11px] font-medium">Inbox</span>
      </button>

      <button
        onClick={() => setActiveTab('settings')}
        className={`flex flex-col items-center gap-1 transition-all ${
          activeTab === 'settings' ? 'text-[#FF5E5E] scale-105' : 'text-[#8E8E93] hover:text-white'
        }`}
      >
        <Settings className="w-5 h-5" />
        <span className="text-[11px] font-medium">Settings</span>
      </button>
    </div>
  )
}
