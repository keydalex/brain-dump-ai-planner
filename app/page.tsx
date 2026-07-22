'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Mic,
  Send,
  Sparkles,
  CheckCircle2,
  Circle,
  Clock,
  Trash2,
  RefreshCw,
  Zap,
  HelpCircle,
  LogOut,
  ChevronDown,
  ChevronUp,
  Tag,
  CreditCard,
} from 'lucide-react'
import BottomNav from './components/BottomNav'
import HeatmapCalendar from './components/HeatmapCalendar'
import WeekTab from './components/WeekTab'
import OnboardingModal from './components/OnboardingModal'
import AuthModal from './components/AuthModal'

interface Task {
  id: string
  title: string
  notes?: string
  status: 'todo' | 'done'
  priority: number
  category: string
  duration: number
  dueDate?: string
  isCarriedOver: boolean
  subtasks?: Task[]
}

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loadingUser, setLoadingUser] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'inbox' | 'settings'>('today')
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )

  const [tasks, setTasks] = useState<Task[]>([])
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processStatus, setProcessStatus] = useState('')

  // Аудіо запис (MediaRecorder)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})

  // Отримання сесії користувача при завантаженні
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user)
        } else {
          setShowAuthModal(true)
        }
      })
      .finally(() => setLoadingUser(false))
  }, [])

  // Завантаження завдань
  const fetchTasks = async () => {
    if (!user) return
    try {
      let url = '/api/tasks'
      if (activeTab === 'inbox') {
        url += '?view=inbox'
      } else if (activeTab === 'today') {
        url += `?date=${new Date().toISOString().split('T')[0]}`
      } else if (selectedDate) {
        url += `?date=${selectedDate}`
      }

      const res = await fetch(url)
      const data = await res.json()
      if (data.tasks) {
        setTasks(data.tasks)
      }
    } catch (err) {
      console.error('Fetch tasks error:', err)
    }
  }

  useEffect(() => {
    if (user) {
      fetchTasks()
    }
  }, [user, activeTab, selectedDate])

  // Обробник тексту "Що в голові?"
  const handleSendText = async () => {
    if (!inputText.trim() || isProcessing) return
    setIsProcessing(true)
    setProcessStatus('AI розбирає завдання...')

    try {
      const res = await fetch('/api/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      })

      const data = await res.json()
      if (data.task) {
        setInputText('')
        fetchTasks()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsProcessing(false)
      setProcessStatus('')
    }
  }

  // Обробник Голосового запису (Web Audio MediaRecorder API)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        processAudioRecording(audioBlob)
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
    } catch (err) {
      alert('Не вдалося отримати доступ до мікрофона')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const processAudioRecording = async (blob: Blob) => {
    setIsProcessing(true)
    setProcessStatus('Транскрибуємо через Whisper...')

    try {
      const formData = new FormData()
      formData.append('file', blob, 'recording.webm')

      // 1. Транскрипція через Whisper API
      const transcribeRes = await fetch('/api/audio/transcribe', {
        method: 'POST',
        body: formData,
      })
      const transcribeData = await transcribeRes.json()

      if (!transcribeData.text) {
        throw new Error('Не вдалося розпізнати мову')
      }

      setProcessStatus(`Розпізнано: "${transcribeData.text}". AI аналізує...`)

      // 2. Структурування через Gemini API
      const parseRes = await fetch('/api/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcribeData.text }),
      })
      const parseData = await parseRes.json()

      if (parseData.task) {
        fetchTasks()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsProcessing(false)
      setProcessStatus('')
    }
  }

  // Перемикання статусу завдання (Done / Todo)
  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))

    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    })
  }

  // Видалення завдання
  const deleteTask = async (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id))
    await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' })
  }

  // Активація Оплати Підписки (20 грн)
  const handleSubscribe = async () => {
    try {
      const res = await fetch('/api/payment/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.pageUrl) {
        window.location.href = data.pageUrl
      } else if (data.success) {
        setUser({ ...user, isPremium: true })
        alert('🎉 Преміум підписку успішно активовано!')
      }
    } catch (err) {
      alert('Помилка обробки платежу')
    }
  }

  // Розрахунок підсумків завантаженості для Heatmap
  const taskSummaries: Record<string, { count: number; hasHighPriority: boolean }> = {}
  tasks.forEach((t) => {
    if (t.dueDate) {
      const d = t.dueDate.split('T')[0]
      if (!taskSummaries[d]) {
        taskSummaries[d] = { count: 0, hasHighPriority: false }
      }
      taskSummaries[d].count += 1
      if (t.priority === 1) {
        taskSummaries[d].hasHighPriority = true
      }
    }
  })

  if (loadingUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Sparkles className="w-8 h-8 text-[#FF5E5E] animate-spin mb-3" />
        <span className="text-xs text-[#8E8E93]">Завантажуємо твій планер...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col pb-20 relative">
      {/* Шапка мобільного застосунку */}
      <header className="p-4 flex justify-between items-center border-b border-[#232326] bg-[#0B0B0C]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF5E5E] to-[#FFAE58] flex items-center justify-center font-bold text-white text-xs shadow-md">
            BD
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Brain Dump AI
              {user?.isPremium && (
                <span className="bg-gradient-to-r from-[#FF5E5E] to-[#A78BFA] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  PRO
                </span>
              )}
            </h1>
            <span className="text-[10px] text-[#8E8E93]">{user ? user.email : 'Гість'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowOnboarding(true)}
            className="p-2 text-[#8E8E93] hover:text-white rounded-xl hover:bg-[#161618] transition-all"
            title="Гід по додатку"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {user ? (
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' })
                setUser(null)
                setShowAuthModal(true)
              }}
              className="p-2 text-[#8E8E93] hover:text-[#FF5E5E] rounded-xl hover:bg-[#161618] transition-all"
              title="Вийти"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-3 py-1.5 bg-[#FF5E5E] text-white text-xs font-semibold rounded-xl active:scale-95"
            >
              Увійти
            </button>
          )}
        </div>
      </header>

      {/* Основний контент */}
      <main className="p-4 flex-1 flex flex-col">
        {/* Головне поле вводу думок (Capture Box) */}
        <div className="bg-[#161618] border border-[#232326] rounded-2xl p-3 mb-4 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[#FF5E5E]" />
            <span className="text-xs font-semibold text-white">Що в голові?</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Надиктуй або вкинь думку..."
              disabled={isProcessing}
              className="flex-1 bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#FF5E5E]"
            />

            {/* Кнопка розпізнавання голосу */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2.5 rounded-xl transition-all active:scale-95 ${
                isRecording
                  ? 'bg-[#FF5E5E] text-white animate-pulse shadow-lg shadow-[#FF5E5E]/40'
                  : 'bg-[#1C1C1E] text-[#A78BFA] hover:text-white border border-[#232326]'
              }`}
              title="Голосовий ввід (Whisper STT)"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              onClick={handleSendText}
              disabled={isProcessing || !inputText.trim()}
              className="p-2.5 bg-[#FF5E5E] text-white rounded-xl active:scale-95 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {processStatus && (
            <div className="mt-2 text-[10px] text-[#A78BFA] flex items-center gap-1.5 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>{processStatus}</span>
            </div>
          )}
        </div>

        {/* Перемикачі екранів */}
        {activeTab === 'week' && (
          <WeekTab selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        )}

        {activeTab === 'today' && (
          <HeatmapCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            taskSummaries={taskSummaries}
          />
        )}

        {/* Налаштування та Оплата */}
        {activeTab === 'settings' && (
          <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#FF5E5E]" />
              Підписка та Інтеграції
            </h3>
            <p className="text-xs text-[#8E8E93] mb-4">
              Отримай неограничений AI-функціонал, двосторонню синхронізацію з Notion та Google Calendar.
            </p>

            <div className="bg-[#1C1C1E] p-3 rounded-xl border border-[#232326] mb-4 flex justify-between items-center">
              <div>
                <span className="text-xs font-semibold text-white block">Преміум статус</span>
                <span className="text-[10px] text-[#8E8E93]">
                  {user?.isPremium ? 'Активовано (20 грн/міс)' : 'Базовий тариф'}
                </span>
              </div>
              {!user?.isPremium && (
                <button
                  onClick={handleSubscribe}
                  className="px-3 py-1.5 bg-[#FF5E5E] text-white text-xs font-bold rounded-xl active:scale-95 shadow-md shadow-[#FF5E5E]/20"
                >
                  Оплатити 20 грн
                </button>
              )}
            </div>
          </div>
        )}

        {/* Список задач */}
        <div className="flex-1 flex flex-col gap-2">
          {tasks.length === 0 ? (
            /* Екран порожнього стану (Empty State) */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
              <div className="w-16 h-16 rounded-full bg-[#1C1C1E] border border-[#232326] flex items-center justify-center mb-3 text-[#FF5E5E]">
                <Zap className="w-8 h-8 opacity-80" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">
                Тут народжується твій спокій
              </h3>
              <p className="text-xs text-[#8E8E93] max-w-xs leading-relaxed">
                Список задач порожній. Надиктуй голосом першу задачу або кинь її в Telegram!
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const isDone = task.status === 'done'
              const isExpanded = !!expandedTaskIds[task.id]

              // Колір пріоритету
              const prioColor =
                task.priority === 1
                  ? 'border-l-4 border-l-[#FF5E5E]'
                  : task.priority === 2
                  ? 'border-l-4 border-l-[#FFAE58]'
                  : task.priority === 3
                  ? 'border-l-4 border-l-[#5EA5FF]'
                  : 'border-l-4 border-l-[#232326]'

              return (
                <div
                  key={task.id}
                  className={`bg-[#161618] border border-[#232326] rounded-2xl p-3 transition-all ${prioColor} ${
                    isDone ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Чекбокс */}
                    <button
                      onClick={() => toggleTaskStatus(task)}
                      className="text-[#8E8E93] hover:text-[#FF5E5E] transition-colors"
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-[#FF5E5E]" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    {/* Текст завдання */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium text-white truncate ${
                            isDone ? 'line-through text-[#8E8E93]' : ''
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.isCarriedOver && (
                          <span className="text-[9px] bg-[#FFAE58]/15 text-[#FFAE58] px-1.5 py-0.5 rounded font-semibold shrink-0">
                            перенесено
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-[#8E8E93] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#5EA5FF]" />
                          {task.duration} хв
                        </span>

                        <span className="text-[10px] text-[#8E8E93] flex items-center gap-1 capitalize">
                          <Tag className="w-3 h-3 text-[#A78BFA]" />
                          {task.category}
                        </span>
                      </div>
                    </div>

                    {/* Підзадачі та Видалення */}
                    <div className="flex items-center gap-1">
                      {task.subtasks && task.subtasks.length > 0 && (
                        <button
                          onClick={() =>
                            setExpandedTaskIds({
                              ...expandedTaskIds,
                              [task.id]: !isExpanded,
                            })
                          }
                          className="p-1 text-[#8E8E93] hover:text-white"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-1.5 text-[#8E8E93] hover:text-[#FF5E5E] transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Вкладені підзадачі */}
                  {isExpanded && task.subtasks && task.subtasks.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-[#232326] pl-6 flex flex-col gap-1.5">
                      {task.subtasks.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-2 text-xs text-[#8E8E93]">
                          <Circle className="w-3 h-3 text-[#FF5E5E]" />
                          <span>{sub.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </main>

      {/* Нижня навігація */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        taskCountToday={tasks.filter((t) => t.status === 'todo').length}
        taskCountInbox={tasks.filter((t) => t.category === 'inbox' && t.status === 'todo').length}
      />

      {/* Модалки */}
      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(u) => setUser(u)}
      />
    </div>
  )
}
