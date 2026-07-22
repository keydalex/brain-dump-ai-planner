'use client'

import { useState, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
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
  Share2,
  Calendar as CalendarIcon,
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
  timeSlot?: string
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
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const [tasks, setTasks] = useState<Task[]>([])
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processStatus, setProcessStatus] = useState('')
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isSyncingNotion, setIsSyncingNotion] = useState(false)

  // Аудіо запис (MediaRecorder)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})

  const [telegramPairCode, setTelegramPairCode] = useState<string>('')
  const [parentPageId, setParentPageId] = useState<string>('')
  const [isCreatingNotionDB, setIsCreatingNotionDB] = useState<boolean>(false)

  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.6-flash')
  const [draftTasks, setDraftTasks] = useState<any[] | null>(null)

  const [energyProfile, setEnergyProfile] = useState<string>('morning')
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleSituation, setRescheduleSituation] = useState('')
  const [rescheduleStrategy, setRescheduleStrategy] = useState('compress')

  const [sttModel, setSttModel] = useState<string>('whisper-1')

  useEffect(() => {
    const savedProfile = localStorage.getItem('energyProfile')
    if (savedProfile) {
      setEnergyProfile(savedProfile)
    }
    const savedStt = localStorage.getItem('sttModel')
    if (savedStt) {
      setSttModel(savedStt)
    }
  }, [])

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
        body: JSON.stringify({ text: inputText, model: selectedModel }),
      })

      const data = await res.json()
      if (data.drafts) {
        setDraftTasks(data.drafts)
        setInputText('')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsProcessing(false)
      setProcessStatus('')
    }
  }

  // Запис голосу
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

  const handleSttModelChange = async (val: string) => {
    setSttModel(val)
    localStorage.setItem('sttModel', val)
    if (user) {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sttModel: val }),
      })
    }
  }

  const processAudioRecording = async (blob: Blob) => {
    setIsProcessing(true)
    setProcessStatus('Транскрибуємо аудіо...')

    try {
      const formData = new FormData()
      formData.append('file', blob, 'recording.webm')
      formData.append('model', sttModel)

      const transcribeRes = await fetch('/api/audio/transcribe', {
        method: 'POST',
        body: formData,
      })
      const transcribeData = await transcribeRes.json()

      if (!transcribeData.text) {
        throw new Error('Не вдалося розпізнати мову')
      }

      setProcessStatus(`Розпізнано: "${transcribeData.text}". AI аналізує...`)

      const parseRes = await fetch('/api/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcribeData.text, model: selectedModel }),
      })
      const parseData = await parseRes.json()
      if (parseData.drafts) {
        setDraftTasks(parseData.drafts)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsProcessing(false)
      setProcessStatus('')
    }
  }

  // Перемикання статусу (із запуск Конфетті при виконанні)
  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    
    if (newStatus === 'done') {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#FF5E5E', '#FFAE58', '#5EA5FF', '#10B981'],
      })
    }

    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))

    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    })
  }

  // Перепланування Форс-Мажор
  const handleReschedule = async () => {
    setIsRescheduling(true)
    try {
      const res = await fetch('/api/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation: rescheduleSituation,
          strategy: rescheduleStrategy,
          energyProfile,
        }),
      })
      const data = await res.json()
      if (data.success) {
        alert('⚡ AI успішно перепланував твій день відповідно до твоєї ситуації!')
        setShowRescheduleModal(false)
        setRescheduleSituation('')
        fetchTasks()
      }
    } catch (err) {
      alert('Помилка перепланування')
    } finally {
      setIsRescheduling(false)
    }
  }

  // Ручна синхронізація з Notion
  const handleSyncNotion = async () => {
    setIsSyncingNotion(true)
    try {
      const res = await fetch('/api/notion/sync', { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) {
        alert(data.message || '🎉 Завдання успішно синхронізовано з Notion!')
      }
    } catch (err) {
      alert('Помилка синхронізації з Notion')
    } finally {
      setIsSyncingNotion(false)
    }
  }

  const deleteTask = async (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id))
    await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' })
  }

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

  const handleGeneratePairCode = async () => {
    try {
      const res = await fetch('/api/auth/pair-code', { method: 'POST' })
      const data = await res.json()
      if (data.pairCode) {
        setTelegramPairCode(data.pairCode)
      }
    } catch (err) {
      alert('Помилка генерації коду для Telegram')
    }
  }

  const handleCreateNotionDB = async () => {
    if (!parentPageId.trim()) {
      alert('Введіть ID батьківської сторінки Notion')
      return
    }
    setIsCreatingNotionDB(true)
    try {
      const res = await fetch('/api/notion/create-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPageId: parentPageId.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message || 'Базу Notion успішно створено!')
        setParentPageId('')
      } else {
        alert(data.error || 'Помилка створення бази Notion')
      }
    } catch (err) {
      alert('Помилка запиту до Notion')
    } finally {
      setIsCreatingNotionDB(false)
    }
  }

  const handleConfirmDrafts = async () => {
    if (!draftTasks || draftTasks.length === 0) return
    setIsProcessing(true)
    setProcessStatus('Зберігаємо завдання...')

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: draftTasks }),
      })
      const data = await res.json()
      if (data.success) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        })
        setDraftTasks(null)
        fetchTasks()
      }
    } catch (err) {
      alert('Помилка збереження завдань')
    } finally {
      setIsProcessing(false)
      setProcessStatus('')
    }
  }

  const handleActivateDemo = async () => {
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setUser(data.user)
        setShowAuthModal(false)
        fetchTasks()
        alert('🎉 Демо-режим активовано! Ми очистили задачі та підготували 3 прості кроки для ознайомлення. Спробуй надиктувати голос або підключити Notion!')
      }
    } catch (err) {
      alert('Помилка активації демо-режиму')
    }
  }

  // Фільтрація задач за категорією
  const filteredTasks = selectedCategory === 'all'
    ? tasks
    : tasks.filter((t) => t.category.toLowerCase() === selectedCategory.toLowerCase())

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

        <div className="flex items-center gap-1">
          <button
            onClick={handleSyncNotion}
            disabled={isSyncingNotion}
            className="p-2 text-[#A78BFA] hover:text-white rounded-xl hover:bg-[#161618] transition-all"
            title="Синхронізувати з Notion"
          >
            <Share2 className={`w-4 h-4 ${isSyncingNotion ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setShowOnboarding(true)}
            className="p-2 text-[#8E8E93] hover:text-white rounded-xl hover:bg-[#161618] transition-all"
            title="Гід по додатку"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {user ? (
            <div className="flex items-center gap-1.5">
              {user.email === 'demo@brain-dump.app' && (
                <span className="text-[10px] bg-[#FFAE58]/15 text-[#FFAE58] px-2 py-1 rounded-lg font-bold">
                  Demo
                </span>
              )}
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
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleActivateDemo}
                className="px-2.5 py-1.5 bg-[#FFAE58]/20 text-[#FFAE58] hover:bg-[#FFAE58]/30 text-xs font-bold rounded-xl active:scale-95 transition-all"
              >
                Спробувати Демо
              </button>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-3 py-1.5 bg-[#FF5E5E] text-white text-xs font-semibold rounded-xl active:scale-95"
              >
                Увійти
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="p-4 flex-1 flex flex-col">
        {/* Головне поле вводу думок */}
        <div className="bg-[#161618] border border-[#232326] rounded-2xl p-3 mb-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#FF5E5E]" />
              <span className="text-xs font-semibold text-white">Що в голові?</span>
            </div>

            <button
              onClick={() => setShowRescheduleModal(true)}
              className="text-[10px] bg-[#FFAE58]/15 text-[#FFAE58] hover:bg-[#FFAE58]/25 font-bold px-2 py-1 rounded-lg flex items-center gap-1 transition-all active:scale-95"
            >
              <Zap className="w-3 h-3 animate-pulse" />
              Форс-Мажор
            </button>
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

          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-[#8E8E93]">
              <span>Модель AI:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-[#1C1C1E] border border-[#232326] text-white text-[10px] px-1.5 py-0.5 rounded focus:outline-none"
              >
                <option value="gemini-3.6-flash">Gemini 3.6 Flash (Reasoning)</option>
                <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              </select>
            </div>
            
            {processStatus && (
              <div className="text-[10px] text-[#A78BFA] flex items-center gap-1.5 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{processStatus}</span>
              </div>
            )}
          </div>
        </div>

        {/* Слайдер категорії */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
          {['all', 'inbox', 'work', 'personal', 'fitness', 'study'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-xl text-[11px] font-semibold capitalize whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-[#FF5E5E] text-white'
                  : 'bg-[#161618] text-[#8E8E93] border border-[#232326]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

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

        {activeTab === 'settings' && (
          <div className="flex flex-col gap-4">
            {/* Карточка підписки */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#FF5E5E]" />
                Підписка та Інтеграції
              </h3>
              <p className="text-xs text-[#8E8E93] mb-4">
                Отримай необмежений AI-функціонал, двосторонню синхронізацію з Notion та Google Calendar.
              </p>

              <div className="bg-[#1C1C1E] p-3 rounded-xl border border-[#232326] flex justify-between items-center">
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

            {/* Карточка налаштувань продуктивності */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#FFAE58]" />
                Профіль продуктивності (Енергія)
              </h3>
              <p className="text-xs text-[#8E8E93] mb-3">
                Обери, в який час ти найбільш продуктивний, щоб AI автоматично планував складні справи туди:
              </p>

              <select
                value={energyProfile}
                onChange={(e) => {
                  setEnergyProfile(e.target.value)
                  localStorage.setItem('energyProfile', e.target.value)
                }}
                className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none"
              >
                <option value="morning">🌅 Ранок — складні справи планувати на ранок</option>
                <option value="evening">🌌 Вечір — складні справи планувати на вечір</option>
              </select>
            </div>

            {/* Карточка налаштувань Speech-to-Text */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Mic className="w-4 h-4 text-[#A78BFA]" />
                Модель розпізнавання голосу (STT)
              </h3>
              <p className="text-xs text-[#8E8E93] mb-3">
                Обери модель розшифровки голосових повідомлень на сайті та в Telegram:
              </p>

              <select
                value={sttModel}
                onChange={(e) => handleSttModelChange(e.target.value)}
                className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none"
              >
                <option value="whisper-1">🎙️ OpenAI Whisper-1 (Максимальна точність)</option>
                <option value="gpt-4o-mini">🤖 GPT-4o Mini Audio (Швидка та економна)</option>
              </select>
            </div>

            {/* Карточка Telegram-бота */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#5EA5FF]" />
                Зв'язати з Telegram-ботом
              </h3>
              <p className="text-xs text-[#8E8E93] mb-3">
                Надсилай голосові нотатки або пиши боту, щоб додавати задачі миттєво з Telegram!
              </p>

              {telegramPairCode ? (
                <div className="bg-[#1C1C1E] p-3 rounded-xl border border-[#232326] text-center">
                  <span className="text-[10px] text-[#8E8E93] block uppercase tracking-wider font-semibold mb-1">
                    Код підключення:
                  </span>
                  <span className="text-lg font-mono font-extrabold text-[#FFAE58] tracking-widest block mb-2">
                    {telegramPairCode}
                  </span>
                  <p className="text-[10px] text-[#8E8E93]">
                    Надішли цей код боту в Telegram командою:<br />
                    <code className="text-[#A78BFA] font-bold">/pair {telegramPairCode}</code>
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleGeneratePairCode}
                  className="w-full py-2 bg-[#1C1C1E] hover:bg-[#232326] border border-[#232326] text-white text-xs font-semibold rounded-xl transition-all active:scale-95"
                >
                  Генерувати код для Telegram
                </button>
              )}
            </div>

            {/* Авто-створення Notion */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#A78BFA]" />
                Авто-створення бази у Notion
              </h3>
              <p className="text-xs text-[#8E8E93] mb-3">
                Створи нову порожню сторінку в Notion, поділися нею з інтеграцією <strong className="text-white">Brain Dump AI Planner</strong> та встав її ID (32 символи) нижче:
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={parentPageId}
                  onChange={(e) => setParentPageId(e.target.value)}
                  placeholder="Встав 32-значний Page ID..."
                  className="flex-1 bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#A78BFA]"
                />
                <button
                  onClick={handleCreateNotionDB}
                  disabled={isCreatingNotionDB}
                  className="px-3 py-2 bg-[#A78BFA] text-white text-xs font-bold rounded-xl active:scale-95 disabled:opacity-50"
                >
                  {isCreatingNotionDB ? 'Створення...' : 'Створити'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Панель чернеток задач для перевірки (AI Draft Confirmation Flow) */}
        {draftTasks && draftTasks.length > 0 && (
          <div className="bg-[#1C1C1E] border border-[#FFAE58] rounded-2xl p-4 mb-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 border-b border-[#232326] pb-2">
              <span className="text-xs font-extrabold text-[#FFAE58] flex items-center gap-1.5 uppercase tracking-wider">
                🤖 AI пропонує такі справи ({draftTasks.length}):
              </span>
              <button
                onClick={() => setDraftTasks(null)}
                className="text-[10px] text-[#8E8E93] hover:text-white"
              >
                Скасувати
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {draftTasks.map((t, idx) => (
                <div key={idx} className="bg-[#161618] border border-[#232326] rounded-xl p-3 flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-[#8E8E93] block uppercase tracking-wider font-semibold">Назва завдання:</span>
                    <input
                      type="text"
                      value={t.title}
                      onChange={(e) => {
                        const updated = [...draftTasks]
                        updated[idx].title = e.target.value
                        setDraftTasks(updated)
                      }}
                      className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#FFAE58]"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-[#8E8E93] block uppercase tracking-wider font-semibold">Пріоритет:</span>
                      <select
                        value={t.priority}
                        onChange={(e) => {
                          const updated = [...draftTasks]
                          updated[idx].priority = Number(e.target.value)
                          setDraftTasks(updated)
                        }}
                        className="bg-[#1C1C1E] border border-[#232326] text-white text-[11px] rounded-lg px-2.5 py-1.5 focus:outline-none"
                      >
                        <option value={1}>🔴 P1 - High</option>
                        <option value={2}>🟠 P2 - Medium</option>
                        <option value={3}>🔵 P3 - Low</option>
                        <option value={4}>⚪ P4 - None</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-[#8E8E93] block uppercase tracking-wider font-semibold">Категорія:</span>
                      <select
                        value={t.category}
                        onChange={(e) => {
                          const updated = [...draftTasks]
                          updated[idx].category = e.target.value
                          setDraftTasks(updated)
                        }}
                        className="bg-[#1C1C1E] border border-[#232326] text-white text-[11px] rounded-lg px-2.5 py-1.5 focus:outline-none"
                      >
                        <option value="inbox">📥 Inbox</option>
                        <option value="work">💻 Work</option>
                        <option value="personal">👤 Personal</option>
                        <option value="fitness">🏋️ Fitness</option>
                        <option value="study">📚 Study</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-[#8E8E93] block uppercase tracking-wider font-semibold">Тривалість (хв):</span>
                      <input
                        type="number"
                        value={t.duration}
                        onChange={(e) => {
                          const updated = [...draftTasks]
                          updated[idx].duration = Number(e.target.value)
                          setDraftTasks(updated)
                        }}
                        className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#FFAE58]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-[#232326] pt-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-[#8E8E93] block uppercase tracking-wider font-semibold">Час (timeSlot):</span>
                      <input
                        type="text"
                        value={t.timeSlot || ''}
                        onChange={(e) => {
                          const updated = [...draftTasks]
                          updated[idx].timeSlot = e.target.value
                          setDraftTasks(updated)
                        }}
                        placeholder="напр. 18:20-18:55"
                        className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#FFAE58]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-[#8E8E93] block uppercase tracking-wider font-semibold">Дата (due date):</span>
                      <input
                        type="date"
                        value={t.dueDate || ''}
                        onChange={(e) => {
                          const updated = [...draftTasks]
                          updated[idx].dueDate = e.target.value
                          setDraftTasks(updated)
                        }}
                        className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#FFAE58]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleConfirmDrafts}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#FF5E5E] to-[#FFAE58] text-white text-xs font-bold rounded-xl active:scale-95 shadow-md shadow-[#FF5E5E]/20"
              >
                ✅ Підтвердити та додати справи
              </button>
              <button
                onClick={() => setDraftTasks(null)}
                className="px-4 py-2.5 bg-[#232326] text-[#8E8E93] text-xs font-bold rounded-xl active:scale-95"
              >
                Скасувати
              </button>
            </div>
          </div>
        )}

        {/* Список задач */}
        <div className="flex-1 flex flex-col gap-2">
          {filteredTasks.length === 0 ? (
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
            filteredTasks.map((task) => {
              const isDone = task.status === 'done'
              const isExpanded = !!expandedTaskIds[task.id]

              const prioColor =
                task.priority === 1
                  ? 'border-l-4 border-l-[#FF5E5E]'
                  : task.priority === 2
                  ? 'border-l-4 border-l-[#FFAE58]'
                  : task.priority === 3
                  ? 'border-l-4 border-l-[#5EA5FF]'
                  : 'border-l-4 border-l-[#232326]'

              const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                task.title
              )}&details=${encodeURIComponent('Створено в Brain Dump AI Planner')}`

              return (
                <div
                  key={task.id}
                  className={`bg-[#161618] border border-[#232326] rounded-2xl p-3 transition-all ${prioColor} ${
                    isDone ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
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

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {task.timeSlot && (
                          <span className="text-[10px] bg-[#FFAE58]/10 text-[#FFAE58] px-1.5 py-0.5 rounded font-extrabold shrink-0 tracking-wider">
                            {task.timeSlot}
                          </span>
                        )}
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

                    <div className="flex items-center gap-1">
                      <a
                        href={gcalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-[#8E8E93] hover:text-[#5EA5FF]"
                        title="Додати в Google Календар"
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                      </a>

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

      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        taskCountToday={tasks.filter((t) => t.status === 'todo').length}
        taskCountInbox={tasks.filter((t) => t.category === 'inbox' && t.status === 'todo').length}
      />

      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(u) => setUser(u)}
      />

      {/* Модалка Форс-Мажору (AI Reschedule Dialog) */}
      {showRescheduleModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#161618] border border-[#FFAE58] w-full max-w-sm rounded-3xl p-6 relative flex flex-col shadow-2xl">
            <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#FFAE58] animate-pulse" />
              ⚡ AI Форс-Мажор Перепланування
            </h2>
            <p className="text-xs text-[#8E8E93] mb-4">
              Опиши AI, що трапилось, і він перебудує твій розклад на сьогодні.
            </p>

            <div className="flex flex-col gap-3.5">
              <div>
                <label className="text-[11px] text-[#8E8E93] block mb-1">Що сталося?</label>
                <textarea
                  value={rescheduleSituation}
                  onChange={(e) => setRescheduleSituation(e.target.value)}
                  placeholder="наприклад: 'я захворів', 'залишилось всього 2 години', 'потрібно звільнити час після 18:00'"
                  className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#FFAE58] h-20 resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#8E8E93] block mb-1">Стратегія перепланування:</label>
                <select
                  value={rescheduleStrategy}
                  onChange={(e) => setRescheduleStrategy(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none"
                >
                  <option value="compress">✂️ Спресувати та пришвидшити поточні справи</option>
                  <option value="defer">📅 Перенести неважливі справи (P3/P4) на завтра</option>
                </select>
              </div>

              <button
                onClick={handleReschedule}
                disabled={isRescheduling}
                className="w-full mt-2 py-3 bg-gradient-to-r from-[#FF5E5E] to-[#FFAE58] text-white rounded-xl font-bold text-xs transition-all active:scale-95 disabled:opacity-50"
              >
                {isRescheduling ? 'AI оптимізує розклад...' : '⚡ Перебудувати розклад'}
              </button>

              <button
                onClick={() => setShowRescheduleModal(false)}
                className="w-full py-3 bg-[#232326] text-[#8E8E93] rounded-xl font-semibold text-xs active:scale-95"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
