'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  X,
} from 'lucide-react'
import BottomNav from './components/BottomNav'
import HeatmapCalendar from './components/HeatmapCalendar'
import WeekTab from './components/WeekTab'
import OnboardingModal from './components/OnboardingModal'
import AuthModal from './components/AuthModal'
import { formatLocalDate } from '@/lib/date'

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

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loadingUser, setLoadingUser] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'inbox' | 'settings'>('today')
  const [selectedDate, setSelectedDate] = useState<string>(formatLocalDate())
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const [tasks, setTasks] = useState<Task[]>([])
  const [allTaskSummaries, setAllTaskSummaries] = useState<Record<string, { count: number; hasHighPriority: boolean }>>({})
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processStatus, setProcessStatus] = useState('')
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isSyncingNotion, setIsSyncingNotion] = useState(false)

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  // Аудіо запис (MediaRecorder)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const [telegramPairCode, setTelegramPairCode] = useState<string>('')
  const [parentPageId, setParentPageId] = useState<string>('')
  const [isCreatingNotionDB, setIsCreatingNotionDB] = useState<boolean>(false)

  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-lite')
  const [draftTasks, setDraftTasks] = useState<any[] | null>(null)

  const [sortBy, setSortBy] = useState<'time' | 'priority'>('time')

  const [energyProfile, setEnergyProfile] = useState<string>('morning')
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleSituation, setRescheduleSituation] = useState('')

  const [sttModel, setSttModel] = useState<string>('whisper-1')

  useEffect(() => {
    const savedProfile = localStorage.getItem('energyProfile')
    if (savedProfile) setEnergyProfile(savedProfile)
    const savedStt = localStorage.getItem('sttModel')
    if (savedStt) setSttModel(savedStt)
  }, [])

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

  const fetchTasks = useCallback(async () => {
    if (!user) return
    try {
      let url = '/api/tasks'
      if (activeTab === 'inbox') {
        url += '?view=inbox'
      } else {
        const date = selectedDate || formatLocalDate()
        url += `?date=${date}`
      }

      const res = await fetch(url)
      const data = await res.json()
      if (data.tasks) {
        setTasks(data.tasks)
      }
    } catch (err) {
      console.error('Fetch tasks error:', err)
    }
  }, [user, activeTab, selectedDate])

  // Окремий fetch для heatmap — отримуємо к-сть задач з усіх дат
  const fetchAllSummaries = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch('/api/tasks?view=all')
      const data = await res.json()
      if (data.tasks) {
        const summaries: Record<string, { count: number; hasHighPriority: boolean }> = {}
        ;(data.tasks as Task[]).forEach((t) => {
          if (t.dueDate && t.status === 'todo') {
            const d = t.dueDate.split('T')[0]
            if (!summaries[d]) summaries[d] = { count: 0, hasHighPriority: false }
            summaries[d].count += 1
            if (t.priority === 1) summaries[d].hasHighPriority = true
          }
        })
        setAllTaskSummaries(summaries)
      }
    } catch (err) {
      console.error('Fetch all summaries error:', err)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      fetchTasks()
      fetchAllSummaries()
    }
  }, [user, activeTab, selectedDate])

  // Надіслати текст в AI
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
      if (data.drafts && data.drafts.length > 0) {
        setDraftTasks(data.drafts)
        setInputText('')
      } else if (data.error) {
        showToast(`Помилка AI: ${data.error}`, 'error')
      }
    } catch (err) {
      showToast('Помилка зв\'язку з AI. Перевір інтернет.', 'error')
    } finally {
      setIsProcessing(false)
      setProcessStatus('')
    }
  }

  // Запис голосу
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      let mimeType = 'audio/webm'
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg'
        else mimeType = ''
      }

      mediaRecorderRef.current = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => stopRecording(), 7000)
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        const recordedBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'audio/webm',
        })
        processAudioRecording(recordedBlob)
      }

      mediaRecorderRef.current.start(100)
      setIsRecording(true)

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => stopRecording(), 7000)
    } catch (err) {
      showToast('Не вдалося отримати доступ до мікрофона. Перевірте дозволи в браузері.', 'error')
    }
  }

  const stopRecording = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop())
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
    showToast(`STT модель змінено на ${val === 'whisper-1' ? 'Whisper-1' : 'GPT-4o Mini Audio'}`, 'success')
  }

  const processAudioRecording = async (blob: Blob) => {
    if (!blob || blob.size === 0) {
      showToast('Аудіозапис виявився порожнім. Надиктуйте ще раз.', 'error')
      return
    }

    setIsProcessing(true)
    setProcessStatus('🎙️ Розпізнаємо голос...')

    try {
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      const formData = new FormData()
      formData.append('file', blob, `recording.${ext}`)
      formData.append('model', sttModel)

      const transcribeRes = await fetch('/api/audio/transcribe', {
        method: 'POST',
        body: formData,
      })
      const transcribeData = await transcribeRes.json()

      if (!transcribeRes.ok || !transcribeData.text) {
        throw new Error(transcribeData.error || 'Не вдалося розпізнати мову')
      }

      const text = transcribeData.text.trim()
      setInputText(text)
      setProcessStatus('✨ AI створює список завдань...')

      const parseRes = await fetch('/api/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model: selectedModel }),
      })
      const parseData = await parseRes.json()

      if (parseData.drafts && parseData.drafts.length > 0) {
        setDraftTasks(parseData.drafts)
      } else if (parseData.error) {
        showToast(`Помилка аналізу AI: ${parseData.error}`, 'error')
      }
    } catch (err: any) {
      console.error('Audio processing error:', err)
      // Не показуємо помилку alert — просто тихий лог. Якщо є текст в полі — нехай відправить вручну
    } finally {
      setIsProcessing(false)
      setProcessStatus('')
    }
  }

  // Modal recording
  const [isRecordingModal, setIsRecordingModal] = useState(false)
  const modalRecorderRef = useRef<MediaRecorder | null>(null)
  const modalChunksRef = useRef<Blob[]>([])

  const startRecordingModal = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      let mimeType = 'audio/webm'
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'
        else mimeType = ''
      }
      modalRecorderRef.current = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      modalChunksRef.current = []

      modalRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) modalChunksRef.current.push(e.data)
      }

      modalRecorderRef.current.onstop = async () => {
        const blob = new Blob(modalChunksRef.current, { type: modalRecorderRef.current?.mimeType || 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())
        try {
          const formData = new FormData()
          formData.append('file', blob, 'modal-recording.webm')
          formData.append('model', sttModel)
          const res = await fetch('/api/audio/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.text) {
            setRescheduleSituation((prev) => (prev ? `${prev} ${data.text}` : data.text))
          }
        } catch (err) {
          console.error('Modal transcribe error:', err)
        }
      }

      modalRecorderRef.current.start(100)
      setIsRecordingModal(true)
    } catch (err) {
      showToast('Не вдалося отримати доступ до мікрофона', 'error')
    }
  }

  const stopRecordingModal = () => {
    if (modalRecorderRef.current && isRecordingModal) {
      modalRecorderRef.current.stop()
      setIsRecordingModal(false)
    }
  }

  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done'

    if (newStatus === 'done') {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#FF5E5E', '#FFAE58', '#5EA5FF', '#10B981'],
      })
      showToast('✅ Зроблено! Так тримати!', 'success')
    }

    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))

    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    })
  }

  const handleReschedule = async () => {
    if (!rescheduleSituation.trim()) {
      showToast('Опиши що сталося перед перебудовою розкладу', 'info')
      return
    }
    setIsRescheduling(true)
    try {
      const res = await fetch('/api/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation: rescheduleSituation,
          energyProfile,
        }),
      })
      const data = await res.json()
      // Завжди закриваємо модалку незалежно від результату
      setShowRescheduleModal(false)
      setRescheduleSituation('')
      await fetchTasks()
      await fetchAllSummaries()
      if (data.success) {
        showToast('⚡ Розклад успішно перебудовано!', 'success')
      } else {
        showToast(data.message || data.error || 'Перебудова завершена', 'info')
      }
    } catch (err) {
      setShowRescheduleModal(false)
      setRescheduleSituation('')
      showToast('Помилка зв\'язку з AI. Спробуй ще раз.', 'error')
    } finally {
      setIsRescheduling(false)
    }
  }

  const handleSyncNotion = async () => {
    setIsSyncingNotion(true)
    try {
      const res = await fetch('/api/notion/sync', { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      if (data.success) {
        showToast(data.message || '🎉 Завдання синхронізовано з Notion!', 'success')
      } else {
        showToast(data.error || 'Помилка синхронізації', 'error')
      }
    } catch (err) {
      showToast('Помилка синхронізації з Notion', 'error')
    } finally {
      setIsSyncingNotion(false)
    }
  }

  const deleteTask = async (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id))
    await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' })
    showToast('Завдання видалено', 'info')
  }

  const handleSubscribe = async () => {
    try {
      const res = await fetch('/api/payment/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.pageUrl) {
        window.location.href = data.pageUrl
      } else if (data.success) {
        setUser({ ...user, isPremium: true })
        showToast('🎉 Преміум підписку активовано!', 'success')
      }
    } catch (err) {
      showToast('Помилка обробки платежу', 'error')
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
      showToast('Помилка генерації коду для Telegram', 'error')
    }
  }

  const handleCreateNotionDB = async () => {
    if (!parentPageId.trim()) {
      showToast('Введіть ID батьківської сторінки Notion', 'error')
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
        showToast(data.message || 'База Notion успішно створена!', 'success')
        setParentPageId('')
      } else {
        showToast(data.error || 'Помилка створення бази Notion', 'error')
      }
    } catch (err) {
      showToast('Помилка запиту до Notion', 'error')
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
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
        setDraftTasks(null)
        setInputText('')
        showToast(`🎉 ${data.tasks?.length || draftTasks.length} завдань додано до плану!`, 'success')
        await fetchTasks()
        await fetchAllSummaries()
      } else {
        showToast(data.error || 'Помилка збереження', 'error')
      }
    } catch (err) {
      showToast('Помилка збереження завдань', 'error')
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
        await fetchTasks()
        await fetchAllSummaries()
        showToast('🎉 Демо активовано! Надиктуй голосом свою першу задачу.', 'success')
      }
    } catch (err) {
      showToast('Помилка активації демо-режиму', 'error')
    }
  }

  const handleSaveEditTitle = async (task: Task) => {
    if (!editingTitle.trim()) return
    const newTitle = editingTitle.trim()
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, title: newTitle } : t)))
    setEditingTaskId(null)
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, title: newTitle }),
    })
  }

  // Фільтрація та сортування задач
  const filteredTasks = (selectedCategory === 'all'
    ? tasks
    : tasks.filter((t) => t.category.toLowerCase() === selectedCategory.toLowerCase())
  ).sort((a, b) => {
    if (sortBy === 'priority') {
      return a.priority - b.priority
    }
    const timeA = a.timeSlot ? a.timeSlot.split('-')[0].trim() : '99:99'
    const timeB = b.timeSlot ? b.timeSlot.split('-')[0].trim() : '99:99'
    return timeA.localeCompare(timeB)
  })

  // Для heatmap — рахуємо тільки незавершені задачі
  const taskSummaries: Record<string, { count: number; hasHighPriority: boolean }> = {}
  tasks.forEach((t) => {
    if (t.dueDate && t.status === 'todo') {
      const d = t.dueDate.split('T')[0]
      if (!taskSummaries[d]) taskSummaries[d] = { count: 0, hasHighPriority: false }
      taskSummaries[d].count += 1
      if (t.priority === 1) taskSummaries[d].hasHighPriority = true
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

      {/* Toast система — замість alert() */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`w-full px-4 py-3 rounded-2xl text-xs font-semibold text-white shadow-xl backdrop-blur-md animate-in slide-in-from-top-2 duration-200 flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-[#10B981]/90 border border-[#10B981]/40'
                : toast.type === 'error'
                ? 'bg-[#FF5E5E]/90 border border-[#FF5E5E]/40'
                : 'bg-[#1C1C1E]/95 border border-[#232326]'
            }`}
          >
            <span>
              {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span className="flex-1">{toast.message}</span>
          </div>
        ))}
      </div>

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
              {user.email?.includes('demo_') && (
                <span className="text-[10px] bg-[#FFAE58]/15 text-[#FFAE58] px-2 py-1 rounded-lg font-bold">
                  Demo
                </span>
              )}
              <button
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' })
                  setUser(null)
                  setTasks([])
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
        {/* Поле вводу думок */}
        <div className="bg-[#161618] border border-[#232326] rounded-2xl p-3.5 mb-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#FF5E5E]" />
              <span className="text-xs font-semibold text-white">Що в голові?</span>
            </div>
            {processStatus && (
              <div className="text-[10px] text-[#A78BFA] flex items-center gap-1 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{processStatus}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendText()
                }
              }}
              placeholder="Надиктуй або вкинь думку..."
              disabled={isProcessing}
              rows={2}
              className="flex-1 bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#FF5E5E] min-h-[56px] max-h-[120px] resize-none overflow-y-auto"
            />

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-3 rounded-xl transition-all active:scale-95 flex items-center justify-center shrink-0 ${
                isRecording
                  ? 'bg-[#FF5E5E] text-white animate-pulse shadow-lg shadow-[#FF5E5E]/40'
                  : 'bg-[#1C1C1E] text-[#A78BFA] hover:text-white border border-[#232326]'
              }`}
              title={isRecording ? 'Зупинити запис' : 'Голосовий ввід'}
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              onClick={handleSendText}
              disabled={isProcessing || !inputText.trim()}
              className="p-3 bg-[#FF5E5E] text-white rounded-xl active:scale-95 disabled:opacity-40 flex items-center justify-center shrink-0 shadow-md shadow-[#FF5E5E]/20"
              title="Відправити AI на розбір"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* Кнопка Форс-Мажор */}
          <button
            onClick={() => setShowRescheduleModal(true)}
            className="w-full py-2.5 bg-gradient-to-r from-[#FF5E5E]/20 via-[#FFAE58]/20 to-[#FF5E5E]/20 hover:from-[#FF5E5E]/30 hover:to-[#FFAE58]/30 border border-[#FF5E5E]/40 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] mt-2.5"
          >
            <span className="text-sm animate-bounce">🚨</span>
            <span>Форс-мажор</span>
          </button>

          {/* Вибір AI та STT моделей */}
          <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-[#232326] pt-2 text-[10px] text-[#8E8E93]">
            <div className="flex items-center gap-1">
              <span>🧠</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-[#1C1C1E] border border-[#232326] text-white text-[10px] px-2 py-1 rounded-lg focus:outline-none"
              >
                <option value="gemini-3.1-flash-lite">⭐ Gemini 3.1 Flash Lite</option>
                <option value="gemini-3.5-flash-lite">⚡ Gemini 3.5 Flash Lite</option>
                <option value="gemini-3.5-flash">🔥 Gemini 3.5 Flash</option>
                <option value="gemini-2.5-flash">💎 Gemini 2.5 Flash</option>
                <option value="gemini-3.1-pro">🧠 Gemini 3.1 Pro</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span>🎙️</span>
              <select
                value={sttModel}
                onChange={(e) => handleSttModelChange(e.target.value)}
                className="bg-[#1C1C1E] border border-[#232326] text-white text-[10px] px-2 py-1 rounded-lg focus:outline-none"
              >
                <option value="whisper-1">Whisper-1</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
              </select>
            </div>
          </div>
        </div>

        {/* Фільтр категорій */}
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
              {cat === 'all' ? 'Всі' : cat}
            </button>
          ))}
        </div>

        {activeTab === 'week' && (
          <WeekTab selectedDate={selectedDate} onSelectDate={setSelectedDate} taskSummaries={allTaskSummaries} />
        )}

        {activeTab === 'today' && (
          <HeatmapCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            taskSummaries={allTaskSummaries}
          />
        )}

        {activeTab === 'settings' && (
          <div className="flex flex-col gap-4">
            {/* Підписка */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#FF5E5E]" />
                Підписка
              </h3>
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

            {/* Профіль продуктивності */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#FFAE58]" />
                Профіль продуктивності
              </h3>
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

            {/* STT модель */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Mic className="w-4 h-4 text-[#A78BFA]" />
                Модель розпізнавання голосу
              </h3>
              <select
                value={sttModel}
                onChange={(e) => handleSttModelChange(e.target.value)}
                className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none"
              >
                <option value="whisper-1">🎙️ OpenAI Whisper-1 (Найточніший)</option>
                <option value="gpt-4o-mini">🤖 GPT-4o Mini Audio (Економний)</option>
              </select>
            </div>

            {/* Telegram */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#5EA5FF]" />
                Зв'язати з Telegram-ботом
              </h3>
              <p className="text-xs text-[#8E8E93] mb-3">
                Надсилай голосові нотатки або пиши боту, щоб додавати задачі!
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
                    Надішли боту в Telegram: <code className="text-[#A78BFA] font-bold">/pair {telegramPairCode}</code>
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

            {/* Notion */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#A78BFA]" />
                Авто-створення бази у Notion
              </h3>
              <p className="text-xs text-[#8E8E93] mb-3">
                Поділися Notion-сторінкою з <strong className="text-white">Brain Dump AI Planner</strong> та встав її ID:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={parentPageId}
                  onChange={(e) => setParentPageId(e.target.value)}
                  placeholder="32-значний Page ID..."
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

        {/* Панель чернеток задач */}
        {draftTasks && draftTasks.length > 0 && (
          <div className="bg-[#1C1C1E] border border-[#FFAE58] rounded-2xl p-4 mb-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 border-b border-[#232326] pb-2">
              <span className="text-xs font-extrabold text-[#FFAE58] flex items-center gap-1.5 uppercase tracking-wider">
                🤖 AI пропонує ({draftTasks.length}):
              </span>
              <button onClick={() => setDraftTasks(null)} className="text-[10px] text-[#8E8E93] hover:text-white">
                Скасувати
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {draftTasks.map((t, idx) => (
                <div key={idx} className="bg-[#161618] border border-[#232326] rounded-xl p-3 flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-[#8E8E93] block uppercase tracking-wider font-semibold">Назва:</span>
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
                        <option value={1}>🔴 P1 High</option>
                        <option value={2}>🟠 P2 Med</option>
                        <option value={3}>🔵 P3 Low</option>
                        <option value={4}>⚪ P4</option>
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
                        value={t.duration === 0 ? '' : t.duration}
                        min={1}
                        onChange={(e) => {
                          const updated = [...draftTasks]
                          updated[idx].duration = e.target.value === '' ? 0 : Number(e.target.value)
                          setDraftTasks(updated)
                        }}
                        className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-[#232326] pt-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-[#8E8E93] block uppercase tracking-wider font-semibold">Час:</span>
                      <input
                        type="text"
                        value={t.timeSlot || ''}
                        onChange={(e) => {
                          const updated = [...draftTasks]
                          updated[idx].timeSlot = e.target.value
                          setDraftTasks(updated)
                        }}
                        placeholder="14:00 - 15:00"
                        className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-[#8E8E93] block uppercase tracking-wider font-semibold">Дата:</span>
                      <input
                        type="date"
                        value={t.dueDate || ''}
                        onChange={(e) => {
                          const updated = [...draftTasks]
                          updated[idx].dueDate = e.target.value
                          setDraftTasks(updated)
                        }}
                        className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Підзадачі у чернетці */}
                  {t.subtasks && t.subtasks.length > 0 && (
                    <div className="border-t border-[#232326] pt-2">
                      <span className="text-[9px] text-[#8E8E93] uppercase tracking-wider font-semibold">Підзадачі:</span>
                      <div className="flex flex-col gap-1 mt-1">
                        {t.subtasks.map((sub: string, subIdx: number) => (
                          <div key={subIdx} className="flex items-center gap-2 text-xs text-[#8E8E93]">
                            <Circle className="w-3 h-3 text-[#FF5E5E] shrink-0" />
                            <span>{sub}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Кнопка видалення чернетки */}
                  <button
                    onClick={() => setDraftTasks(draftTasks.filter((_, i) => i !== idx))}
                    className="self-end text-[10px] text-[#8E8E93] hover:text-[#FF5E5E] flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Прибрати цю
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleConfirmDrafts}
                disabled={isProcessing}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#FF5E5E] to-[#FFAE58] text-white text-xs font-bold rounded-xl active:scale-95 shadow-md shadow-[#FF5E5E]/20 disabled:opacity-50"
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

        {/* Сортування */}
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] text-[#8E8E93] font-semibold uppercase tracking-wider">
            Справи ({filteredTasks.filter((t) => t.status === 'todo').length} / {filteredTasks.length})
          </span>
          <div className="flex items-center gap-1 bg-[#161618] border border-[#232326] p-1 rounded-xl">
            <button
              onClick={() => setSortBy('time')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                sortBy === 'time' ? 'bg-[#FF5E5E] text-white shadow-sm' : 'text-[#8E8E93] hover:text-white'
              }`}
            >
              🕒 Час
            </button>
            <button
              onClick={() => setSortBy('priority')}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                sortBy === 'priority' ? 'bg-[#FF5E5E] text-white shadow-sm' : 'text-[#8E8E93] hover:text-white'
              }`}
            >
              🎯 Пріоритет
            </button>
          </div>
        </div>

        {/* Список задач */}
        <div className="flex-1 flex flex-col gap-2">
          {filteredTasks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-8">
              <div className="w-16 h-16 rounded-full bg-[#1C1C1E] border border-[#232326] flex items-center justify-center mb-4 text-[#FF5E5E]">
                <Zap className="w-8 h-8 opacity-80" />
              </div>
              <h3 className="text-sm font-bold text-white mb-2">Тут народжується твій спокій</h3>
              <p className="text-xs text-[#8E8E93] max-w-xs leading-relaxed">
                Надиктуй голосом першу задачу або кинь думку у поле вгорі!
              </p>
              <button
                onClick={startRecording}
                disabled={isRecording}
                className={`mt-4 px-5 py-2.5 rounded-xl font-bold text-xs text-white transition-all active:scale-95 ${
                  isRecording
                    ? 'bg-[#FF5E5E] animate-pulse'
                    : 'bg-gradient-to-r from-[#FF5E5E] to-[#FFAE58]'
                }`}
              >
                {isRecording ? '🔴 Зупинити запис' : '🎙️ Надиктувати задачу'}
              </button>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isDone = task.status === 'done'
              const isExpanded = !!expandedTaskIds[task.id]
              const isEditing = editingTaskId === task.id

              const prioColor =
                task.priority === 1
                  ? 'border-l-4 border-l-[#FF5E5E]'
                  : task.priority === 2
                  ? 'border-l-4 border-l-[#FFAE58]'
                  : task.priority === 3
                  ? 'border-l-4 border-l-[#5EA5FF]'
                  : 'border-l-4 border-l-[#232326]'

              const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(task.title)}&details=${encodeURIComponent('Brain Dump AI Planner')}`

              return (
                <div
                  key={task.id}
                  className={`bg-[#161618] border rounded-2xl p-3 transition-all ${
                    task.isCarriedOver
                      ? 'border-[#FFAE58]/40 shadow-md shadow-[#FFAE58]/10 bg-[#FFAE58]/5 border-l-4 border-l-[#FFAE58]'
                      : `border-[#232326] ${prioColor}`
                  } ${isDone ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleTaskStatus(task)}
                      className="text-[#8E8E93] hover:text-[#FF5E5E] transition-colors shrink-0"
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-[#FF5E5E]" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={() => handleSaveEditTitle(task)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditTitle(task)
                            if (e.key === 'Escape') setEditingTaskId(null)
                          }}
                          className="w-full bg-[#1C1C1E] border border-[#FFAE58] text-white text-xs rounded-lg px-2 py-1 focus:outline-none"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          {task.timeSlot && (
                            <span className="text-[10px] bg-[#FFAE58]/10 text-[#FFAE58] px-1.5 py-0.5 rounded font-extrabold shrink-0 tracking-wider">
                              {task.timeSlot}
                            </span>
                          )}
                          {task.isCarriedOver && (
                            <span className="text-[9px] bg-[#FFAE58]/15 text-[#FFAE58] px-1.5 py-0.5 rounded font-bold shrink-0 border border-[#FFAE58]/30">
                              перенесено
                            </span>
                          )}
                          <span
                            className={`text-xs font-medium text-white truncate cursor-pointer ${isDone ? 'line-through text-[#8E8E93]' : 'hover:text-[#FFAE58]'}`}
                            onDoubleClick={() => {
                              if (!isDone) {
                                setEditingTaskId(task.id)
                                setEditingTitle(task.title)
                              }
                            }}
                          >
                            {task.title}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-[#8E8E93] flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#5EA5FF]" />
                          {task.duration} хв
                        </span>
                        <span className="text-[10px] text-[#8E8E93] flex items-center gap-1 capitalize">
                          <Tag className="w-3 h-3 text-[#A78BFA]" />
                          {task.category}
                        </span>
                        {task.subtasks && task.subtasks.length > 0 && (
                          <span className="text-[10px] text-[#5EA5FF]">
                            📋 {task.subtasks.filter((s) => s.status === 'done').length}/{task.subtasks.length}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={task.priority}
                        onChange={async (e) => {
                          const newPrio = Number(e.target.value)
                          setTasks(tasks.map((t) => (t.id === task.id ? { ...t, priority: newPrio } : t)))
                          await fetch('/api/tasks', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: task.id, priority: newPrio }),
                          })
                        }}
                        className="bg-[#1C1C1E] border border-[#232326] text-white text-[10px] px-1.5 py-0.5 rounded-lg focus:outline-none cursor-pointer"
                      >
                        <option value={1}>🔴 P1</option>
                        <option value={2}>🟠 P2</option>
                        <option value={3}>🔵 P3</option>
                        <option value={4}>⚪ P4</option>
                      </select>

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
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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

                  {/* Розгорнуті підзадачі */}
                  {isExpanded && task.subtasks && task.subtasks.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-[#232326] pl-6 flex flex-col gap-1.5">
                      {task.subtasks.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center gap-2 text-xs text-[#8E8E93] cursor-pointer"
                          onClick={() => toggleTaskStatus(sub)}
                        >
                          {sub.status === 'done' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#FF5E5E] shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-[#FF5E5E] shrink-0" />
                          )}
                          <span className={sub.status === 'done' ? 'line-through opacity-60' : ''}>{sub.title}</span>
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
        setActiveTab={(tab) => {
          setActiveTab(tab)
          if (tab === 'today') {
            setSelectedDate(formatLocalDate())
          }
        }}
        taskCountToday={tasks.filter((t) => t.status === 'todo').length}
        taskCountInbox={tasks.filter((t) => t.category === 'inbox' && t.status === 'todo').length}
      />

      <OnboardingModal isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(u) => setUser(u)}
      />

      {/* Модалка Форс-Мажору */}
      {showRescheduleModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#161618] border border-[#FF5E5E]/40 w-full max-w-sm rounded-3xl p-5 relative flex flex-col shadow-2xl">
            <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
              <span className="text-lg animate-bounce">🚨</span>
              <span>Форс-мажор</span>
            </h2>

            <div className="flex flex-col gap-3.5">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[11px] text-[#8E8E93] font-medium">Що сталося?</label>
                  <button
                    onClick={isRecordingModal ? stopRecordingModal : startRecordingModal}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isRecordingModal
                        ? 'bg-[#FF5E5E] text-white animate-pulse'
                        : 'bg-[#1C1C1E] text-[#FFAE58] border border-[#FFAE58]/30'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>{isRecordingModal ? 'Запис...' : '🎙️ Надиктувати'}</span>
                  </button>
                </div>
                <textarea
                  value={rescheduleSituation}
                  onChange={(e) => setRescheduleSituation(e.target.value)}
                  placeholder="Опиши що сталося (напр: 'прибери тренування', 'зроби з зала перерву', 'зсунь план на 2 години')..."
                  className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#FF5E5E] h-24 resize-none"
                />
              </div>

              <button
                onClick={handleReschedule}
                disabled={isRescheduling}
                className="w-full mt-1 py-3 bg-gradient-to-r from-[#FF5E5E] to-[#FFAE58] text-white rounded-xl font-bold text-xs transition-all active:scale-95 disabled:opacity-40"
              >
                {isRescheduling ? '⏳ AI оптимізує розклад...' : '⚡ Перебудувати розклад'}
              </button>

              <button
                onClick={() => {
                  setShowRescheduleModal(false)
                  setRescheduleSituation('')
                }}
                className="w-full py-2.5 bg-[#232326] text-[#8E8E93] rounded-xl font-semibold text-xs active:scale-95"
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
