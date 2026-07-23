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
  Plus,
  Edit2,
  Check,
} from 'lucide-react'
import BottomNav from './components/BottomNav'
import HeatmapCalendar from './components/HeatmapCalendar'
import WeekTab from './components/WeekTab'
import OnboardingTour from './components/OnboardingTour'
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

const PRIORITY_CONFIG: Record<number, { label: string; color: string; border: string; bg: string }> = {
  1: { label: 'P1', color: '#FF5E5E', border: 'border-l-[#FF5E5E]', bg: 'bg-[#FF5E5E]/8' },
  2: { label: 'P2', color: '#FFAE58', border: 'border-l-[#FFAE58]', bg: 'bg-[#FFAE58]/5' },
  3: { label: 'P3', color: '#5EA5FF', border: 'border-l-[#5EA5FF]', bg: 'bg-[#5EA5FF]/5' },
  4: { label: 'P4', color: '#636366', border: 'border-l-[#232326]', bg: '' },
}

const CATEGORY_EMOJI: Record<string, string> = {
  inbox: '📥', work: '💻', personal: '👤', fitness: '🏋️', study: '📚',
}

// Перевірка чи два таймслоти пересікаються
function doSlotsOverlap(slotA?: string, slotB?: string): boolean {
  if (!slotA || !slotB) return false
  const parseMin = (s: string) => {
    const [h, m] = s.trim().split(':').map(Number)
    return h * 60 + m
  }
  try {
    const [startA, endA] = slotA.split('-').map(parseMin)
    const [startB, endB] = slotB.split('-').map(parseMin)
    return Math.max(startA, startB) < Math.min(endA, endB)
  } catch {
    return false
  }
}

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loadingUser, setLoadingUser] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'inbox' | 'habits' | 'settings'>('today')
  const [selectedDate, setSelectedDate] = useState<string>(formatLocalDate())
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const [tasks, setTasks] = useState<Task[]>([])
  const [allTaskSummaries, setAllTaskSummaries] = useState<Record<string, { count: number; hasHighPriority: boolean }>>({})
  const [inputText, setInputText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processStatus, setProcessStatus] = useState('')
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isSyncingNotion, setIsSyncingNotion] = useState(false)

  // Edit Mode toggle (приховує/показує 🗑️ смітники та ⬆️ ⬇️ стрілки)
  const [isEditMode, setIsEditMode] = useState(false)

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200)
  }, [])

  // Recording
  const [isRecording, setIsRecording] = useState(false)
  const [sendAnimating, setSendAnimating] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({})
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Ручне додавання підзадачі
  const [addingSubtaskParentId, setAddingSubtaskParentId] = useState<string | null>(null)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

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

  // Quick add
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [quickAddStartTime, setQuickAddStartTime] = useState('')
  const [quickAddEndTime, setQuickAddEndTime] = useState('')
  const [quickAddPriority, setQuickAddPriority] = useState(4)
  const [quickAddCategory, setQuickAddCategory] = useState('work')
  const [quickAddDuration, setQuickAddDuration] = useState(30)
  const [isQuickAdding, setIsQuickAdding] = useState(false)

  useEffect(() => {
    const savedProfile = localStorage.getItem('energyProfile')
    if (savedProfile) setEnergyProfile(savedProfile)
    const savedStt = localStorage.getItem('sttModel')
    if (savedStt) setSttModel(savedStt)
    const savedModel = localStorage.getItem('aiModel')
    if (savedModel) setSelectedModel(savedModel)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user)
        else setShowAuthModal(true)
      })
      .finally(() => setLoadingUser(false))
  }, [])

  const fetchTasks = useCallback(async () => {
    if (!user) return
    try {
      let url = '/api/tasks'
      if (activeTab === 'inbox') url += '?view=inbox'
      else url += `?date=${selectedDate || formatLocalDate()}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.tasks) setTasks(data.tasks)
    } catch (err) {
      console.error('Fetch tasks error:', err)
    }
  }, [user, activeTab, selectedDate])

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

  const handleSendText = async () => {
    if (!inputText.trim() || isProcessing) return
    setIsProcessing(true)
    setProcessStatus('AI розбирає...')
    try {
      const res = await fetch('/api/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, model: selectedModel, mode: activeTab === 'inbox' ? 'inbox' : 'today' }),
      })
      const data = await res.json()
      if (data.drafts?.length > 0) {
        setDraftTasks(data.drafts)
        setInputText('')
      } else if (data.error) {
        showToast(`Помилка AI: ${data.error}`, 'error')
      }
    } catch {
      showToast("Помилка зв'язку з AI", 'error')
    } finally {
      setIsProcessing(false)
      setProcessStatus('')
    }
  }

  const recordStartTimeRef = useRef<number>(0)

  const animateSendAndProcess = useCallback(async (blob: Blob, durationMs: number) => {
    if (durationMs < 2000) {
      showToast('Запис занадто короткий. Спробуй ще раз!', 'info')
      return
    }
    setSendAnimating(true)
    await new Promise((r) => setTimeout(r, 400))
    setSendAnimating(false)
    if (!blob || blob.size === 0) {
      showToast('Аудіо порожнє — спробуй ще раз', 'error')
      return
    }
    setIsProcessing(true)
    setProcessStatus('🎙️ Розпізнаємо голос...')
    try {
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      const formData = new FormData()
      formData.append('file', blob, `rec.${ext}`)
      formData.append('model', sttModel)

      const transcribeRes = await fetch('/api/audio/transcribe', { method: 'POST', body: formData })
      const transcribeData = await transcribeRes.json()
      if (!transcribeRes.ok || !transcribeData.text) throw new Error(transcribeData.error || 'STT error')

      const text = transcribeData.text.trim()
      setInputText(text)
      setProcessStatus('✨ AI складає план...')

      const parseRes = await fetch('/api/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model: selectedModel, mode: activeTab === 'inbox' ? 'inbox' : 'today' }),
      })
      const parseData = await parseRes.json()
      if (parseData.drafts?.length > 0) setDraftTasks(parseData.drafts)
    } catch (err: any) {
      console.error('Audio error:', err)
    } finally {
      setIsProcessing(false)
      setProcessStatus('')
    }
  }, [sttModel, selectedModel, showToast])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      let mimeType = 'audio/webm'
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      }
      mediaRecorderRef.current = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      recordStartTimeRef.current = Date.now()

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => stopRecording(), 7000)
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        stream.getTracks().forEach((t) => t.stop())
        const durationMs = Date.now() - recordStartTimeRef.current
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' })
        animateSendAndProcess(blob, durationMs)
      }

      mediaRecorderRef.current.start(100)
      setIsRecording(true)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => stopRecording(), 7000)
    } catch {
      showToast('Немає доступу до мікрофона. Перевір дозволи в браузері.', 'error')
    }
  }

  const stopRecording = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
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

  // Modal recording (for force majeure)
  const [isRecordingModal, setIsRecordingModal] = useState(false)
  const modalRecorderRef = useRef<MediaRecorder | null>(null)
  const modalChunksRef = useRef<Blob[]>([])

  const startRecordingModal = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      modalRecorderRef.current = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      modalChunksRef.current = []
      modalRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) modalChunksRef.current.push(e.data) }
      modalRecorderRef.current.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(modalChunksRef.current, { type: 'audio/webm' })
        try {
          const fd = new FormData()
          fd.append('file', blob, 'modal.webm')
          fd.append('model', sttModel)
          const res = await fetch('/api/audio/transcribe', { method: 'POST', body: fd })
          const d = await res.json()
          if (d.text) setRescheduleSituation((p) => p ? `${p} ${d.text}` : d.text)
        } catch {}
      }
      modalRecorderRef.current.start(100)
      setIsRecordingModal(true)
    } catch { showToast('Немає доступу до мікрофона', 'error') }
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
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 }, colors: ['#FF5E5E', '#FFAE58', '#5EA5FF'] })
    }
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    })
    fetchAllSummaries()
  }

  const toggleSubtaskStatus = async (parentId: string, sub: Task) => {
    const newStatus = sub.status === 'done' ? 'todo' : 'done'
    if (newStatus === 'done') {
      confetti({ particleCount: 30, spread: 40, origin: { y: 0.7 }, colors: ['#A78BFA', '#5EA5FF'] })
    }
    setTasks(tasks.map((t) =>
      t.id === parentId
        ? { ...t, subtasks: t.subtasks?.map((s) => s.id === sub.id ? { ...s, status: newStatus } : s) }
        : t
    ))
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sub.id, status: newStatus }),
    })
  }

  const handleAddManualSubtask = async (parentId: string) => {
    if (!newSubtaskTitle.trim()) return
    const title = newSubtaskTitle.trim()
    setNewSubtaskTitle('')
    setAddingSubtaskParentId(null)

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          parentId,
          priority: 4,
          category: 'inbox',
          duration: 15,
        }),
      })
      const data = await res.json()
      if (data.task) {
        showToast('✅ Підзадачу додано!', 'success')
        await fetchTasks()
      }
    } catch {
      showToast('Помилка додавання підзадачі', 'error')
    }
  }

  const handleReschedule = async () => {
    if (!rescheduleSituation.trim()) { showToast('Опиши що сталося', 'info'); return }
    setIsRescheduling(true)
    try {
      const res = await fetch('/api/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation: rescheduleSituation, energyProfile }),
      })
      const data = await res.json()
      setShowRescheduleModal(false)
      setRescheduleSituation('')
      await fetchTasks()
      await fetchAllSummaries()
      showToast(data.success ? '⚡ Розклад перебудовано!' : data.message || 'Готово', data.success ? 'success' : 'info')
    } catch {
      setShowRescheduleModal(false)
      setRescheduleSituation('')
      showToast("Помилка зв'язку з AI", 'error')
    } finally {
      setIsRescheduling(false)
    }
  }

  const handleSyncNotion = async () => {
    setIsSyncingNotion(true)
    try {
      const res = await fetch('/api/notion/sync', { method: 'POST', body: JSON.stringify({}) })
      const data = await res.json()
      showToast(data.success ? (data.message || 'Синхронізовано з Notion!') : (data.error || 'Помилка'), data.success ? 'success' : 'error')
    } catch { showToast('Помилка синхронізації', 'error') } finally { setIsSyncingNotion(false) }
  }

  const deleteTask = async (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id))
    await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' })
    fetchAllSummaries()
  }

  const handleSubscribe = async () => {
    try {
      const res = await fetch('/api/payment/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.pageUrl) window.location.href = data.pageUrl
      else if (data.success) { setUser({ ...user, isPremium: true }); showToast('🎉 Преміум активовано!', 'success') }
    } catch { showToast('Помилка платежу', 'error') }
  }

  const handleGeneratePairCode = async () => {
    try {
      const res = await fetch('/api/auth/pair-code', { method: 'POST' })
      const data = await res.json()
      if (data.pairCode) setTelegramPairCode(data.pairCode)
    } catch { showToast('Помилка генерації коду', 'error') }
  }

  const handleCreateNotionDB = async () => {
    if (!parentPageId.trim()) { showToast('Введіть ID сторінки Notion', 'error'); return }
    setIsCreatingNotionDB(true)
    try {
      const res = await fetch('/api/notion/create-db', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPageId: parentPageId.trim() }),
      })
      const data = await res.json()
      if (data.success) { showToast(data.message || 'Базу Notion створено!', 'success'); setParentPageId('') }
      else showToast(data.error || 'Помилка', 'error')
    } catch { showToast('Помилка запиту до Notion', 'error') } finally { setIsCreatingNotionDB(false) }
  }

  const handleConfirmDrafts = async () => {
    if (!draftTasks?.length) return
    setIsProcessing(true)
    setProcessStatus('Зберігаємо...')
    try {
      const isInboxTab = activeTab === 'inbox'
      const finalTasks = draftTasks.map((t) => {
        if (isInboxTab || t.category === 'inbox') {
          return {
            ...t,
            category: 'inbox',
            dueDate: null,
            timeSlot: null,
          }
        }
        return t
      })

      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: finalTasks }),
      })
      const data = await res.json()
      if (data.success) {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
        setDraftTasks(null)
        setInputText('')
        showToast(`🎉 ${data.tasks?.length || draftTasks.length} справ додано!`, 'success')
        await fetchTasks()
        await fetchAllSummaries()
      } else showToast(data.error || 'Помилка', 'error')
    } catch { showToast('Помилка збереження', 'error') } finally { setIsProcessing(false); setProcessStatus('') }
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
        showToast('🎉 Демо активовано! Надиктуй голосом першу задачу.', 'success')
      }
    } catch { showToast('Помилка демо-режиму', 'error') }
  }

  const handleSaveEditTitle = async (task: Task) => {
    if (!editingTitle.trim()) { setEditingTaskId(null); return }
    const newTitle = editingTitle.trim()
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, title: newTitle } : t)))
    setEditingTaskId(null)
    await fetch('/api/tasks', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, title: newTitle }),
    })
  }

  const handleQuickAdd = async () => {
    if (!quickAddTitle.trim()) return
    setIsQuickAdding(true)
    try {
      let finalSlot: string | null = null
      if (quickAddStartTime && quickAddEndTime) {
        finalSlot = `${quickAddStartTime} - ${quickAddEndTime}`
      } else if (quickAddStartTime && quickAddDuration) {
        const [h, m] = quickAddStartTime.split(':').map(Number)
        const endMin = h * 60 + m + Number(quickAddDuration)
        const endH = String(Math.floor(endMin / 60) % 24).padStart(2, '0')
        const endM = String(endMin % 60).padStart(2, '0')
        finalSlot = `${quickAddStartTime} - ${endH}:${endM}`
      }

      const cat = selectedCategory !== 'all' ? selectedCategory : quickAddCategory || 'inbox'
      const isInboxTask = activeTab === 'inbox' || cat === 'inbox'
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: [{
            title: quickAddTitle.trim(),
            priority: quickAddPriority,
            category: isInboxTask ? 'inbox' : cat,
            duration: Number(quickAddDuration) || 30,
            dueDate: isInboxTask ? null : (selectedDate || formatLocalDate()),
            timeSlot: isInboxTask ? null : finalSlot,
          }]
        }),
      })
      const data = await res.json()
      if (data.success) {
        setQuickAddTitle('')
        setQuickAddStartTime('')
        setQuickAddEndTime('')
        setQuickAddPriority(4)
        setShowQuickAdd(false)
        await fetchTasks()
        await fetchAllSummaries()
        showToast('✅ Задачу додано!', 'success')
      }
    } catch { showToast('Помилка', 'error') } finally { setIsQuickAdding(false) }
  }

  // Розумний обмін місцями: Зберігаємо ВЛАСНІ тривалості справ!
  // Справа A починається з першого часу, справа B починається ОДРАЗУ після неї.
  const handleSwapTasksSequentialMath = async (taskA: Task, taskB: Task) => {
    if (!taskA.timeSlot || !taskB.timeSlot) return

    const parseMin = (s: string) => {
      const [h, m] = s.trim().split(':').map(Number)
      return h * 60 + m
    }
    const formatMin = (mTotal: number) => {
      const h = String(Math.floor(mTotal / 60) % 24).padStart(2, '0')
      const m = String(mTotal % 60).padStart(2, '0')
      return `${h}:${m}`
    }

    const startA = parseMin(taskA.timeSlot.split('-')[0])
    
    // Власні тривалості справ
    const durA = taskA.duration || 30
    const durB = taskB.duration || 30

    // Коли міняємо (B стає першою, A стає другою):
    // B стає на startA і триває durB хвилин
    const newStartB = startA
    const newEndB = newStartB + durB
    const newSlotB = `${formatMin(newStartB)} - ${formatMin(newEndB)}`

    // A стає одразу після B (на newEndB) і триває свій durA
    const newStartA = newEndB
    const newEndA = newStartA + durA
    const newSlotA = `${formatMin(newStartA)} - ${formatMin(newEndA)}`

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskA.id) return { ...t, timeSlot: newSlotA }
        if (t.id === taskB.id) return { ...t, timeSlot: newSlotB }
        return t
      })
    )

    await Promise.all([
      fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: taskA.id, timeSlot: newSlotA }) }),
      fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: taskB.id, timeSlot: newSlotB }) }),
    ])
    showToast('🔄 Послідовно перераховано розклад!', 'success')
  }

  const filteredTasks = (
    selectedCategory === 'all' ? tasks : tasks.filter((t) => t.category === selectedCategory)
  ).sort((a, b) => {
    if (sortBy === 'priority') return a.priority - b.priority
    const tA = a.timeSlot ? a.timeSlot.split('-')[0].trim() : '99:99'
    const tB = b.timeSlot ? b.timeSlot.split('-')[0].trim() : '99:99'
    return tA.localeCompare(tB)
  })

  // Розрахунок відсотка виконання задач за сьогодні
  const doneTasksCount = tasks.filter((t) => t.status === 'done').length
  const totalTasksCount = tasks.length
  const completionPercent = totalTasksCount > 0 ? Math.round((doneTasksCount / totalTasksCount) * 100) : 0

  if (loadingUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#FF5E5E] to-[#FFAE58] flex items-center justify-center mb-4 animate-pulse shadow-lg shadow-[#FF5E5E]/30">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <span className="text-xs text-[#8E8E93]">Завантажуємо твій планер...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col pb-20 relative">

      {/* Toast */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4">
        {toasts.map((toast) => (
          <div key={toast.id} className={`w-full px-4 py-3 rounded-2xl text-xs font-semibold text-white shadow-2xl flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-[#10B981]/95 border border-[#10B981]/30'
            : toast.type === 'error' ? 'bg-[#FF5E5E]/95 border border-[#FF5E5E]/30'
            : 'bg-[#1C1C1E]/98 border border-[#232326]'
          }`}>
            {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
            <span className="flex-1">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="px-4 py-3 flex justify-between items-center border-b border-[#232326] bg-[#0B0B0C]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF5E5E] to-[#FFAE58] flex items-center justify-center font-black text-white text-xs shadow-md shadow-[#FF5E5E]/30">
            BD
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Brain Dump AI
              {user?.isPremium && (
                <span className="bg-gradient-to-r from-[#FF5E5E] to-[#A78BFA] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase">PRO</span>
              )}
            </h1>
            <span className="text-[10px] text-[#636366] leading-none">{user ? (user.email?.includes('demo_') ? 'Демо-режим' : user.email) : 'Гість'}</span>
          </div>
        </div>

        {/* Міні-кругова діаграма прогресу як на скріншоті з цифрою всередині */}
        <div className="flex items-center gap-3">
          {totalTasksCount > 0 && (
            <div className="flex items-center gap-2 bg-[#161618] border border-[#232326] px-2.5 py-1 rounded-xl" title={`Виконано ${doneTasksCount} з ${totalTasksCount} справ`}>
              <div className="relative w-7 h-7 flex items-center justify-center">
                <svg className="w-7 h-7 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#232326]"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#10B981] transition-all duration-500 ease-out"
                    strokeDasharray={`${completionPercent}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute text-[8px] font-extrabold text-white">{completionPercent}%</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-0.5">
            <button onClick={handleSyncNotion} disabled={isSyncingNotion} className="p-2 text-[#A78BFA] hover:text-white rounded-xl hover:bg-[#161618] transition-all" title="Синхронізувати з Notion">
              <Share2 className={`w-4 h-4 ${isSyncingNotion ? 'animate-spin' : ''}`} />
            </button>
            <button id="onboarding-btn" onClick={() => setShowOnboarding(true)} className="p-2 text-[#8E8E93] hover:text-white rounded-xl hover:bg-[#161618] transition-all" title="Гід по додатку">
              <HelpCircle className="w-4 h-4" />
            </button>
            {user ? (
              <button onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' })
                setUser(null); setTasks([]); setShowAuthModal(true)
              }} className="p-2 text-[#8E8E93] hover:text-[#FF5E5E] rounded-xl hover:bg-[#161618] transition-all" title="Вийти">
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={() => setShowAuthModal(true)} className="px-3 py-1.5 bg-[#FF5E5E] text-white text-xs font-semibold rounded-xl active:scale-95 ml-1">Увійти</button>
            )}
          </div>
        </div>
      </header>

      <main className="p-4 flex-1 flex flex-col gap-3">

        {/* Поле вводу */}
        {activeTab !== 'settings' && (
          <div id="input-area" className="bg-[#161618] border border-[#232326] rounded-2xl p-3 shadow-lg">
            {/* Слоган відповідно до режиму */}
            <p className="text-[#8E8E93] text-xs font-medium mb-2">
              {activeTab === 'inbox'
                ? 'Вивали все, що в голові (без дедлайнів) 🧠'
                : 'Скажи задачу і AI розкладе її по часу 🪄'}
            </p>
            <div className="flex items-start gap-2.5">
              {/* Велика мобільна кнопка мікрофона */}
              <button
                id="mic-btn"
                onClick={isRecording ? stopRecording : startRecording}
                className={`shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 border ${
                  isRecording
                    ? 'bg-[#EF4444] border-red-400 text-white shadow-lg shadow-[#EF4444]/40 animate-pulse ring-4 ring-[#EF4444]/30'
                    : 'bg-gradient-to-br from-[#FF5E5E] to-[#FFAE58] border-white/20 text-white shadow-lg shadow-[#FF5E5E]/30 hover:scale-105'
                }`}
                title={isRecording ? 'Зупинити запис' : 'Голосовий ввід'}
              >
                <Mic className={`w-8 h-8 ${isRecording ? 'animate-bounce text-white' : 'text-white'}`} />
              </button>

              <div className="flex-1 min-w-0">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText() }
                  }}
                  placeholder={isRecording ? '🔴 Запис іде...' : (activeTab === 'inbox' ? 'Вивали все, що в голові (без дедлайнів) 🧠' : 'Що в голові? Надиктуй або напиши...')}
                  disabled={isProcessing || isRecording}
                  rows={2}
                  className="w-full bg-transparent text-white text-sm rounded-xl focus:outline-none min-h-[52px] max-h-[100px] resize-none placeholder:text-[#636366]"
                />
                {processStatus && (
                  <div className="text-[10px] text-[#A78BFA] flex items-center gap-1 animate-pulse mt-0.5">
                    <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                    <span>{processStatus}</span>
                  </div>
                )}
              </div>

              <button
                id="send-btn"
                onClick={handleSendText}
                disabled={isProcessing || !inputText.trim()}
                className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${
                  sendAnimating
                    ? 'bg-[#10B981] scale-90 shadow-lg shadow-[#10B981]/40'
                    : inputText.trim()
                    ? 'bg-gradient-to-br from-[#FF5E5E] to-[#FFAE58] text-white shadow-md shadow-[#FF5E5E]/30'
                    : 'bg-[#232326] opacity-40 text-[#8E8E93]'
                }`}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>

            {/* Форс-мажор + моделі */}
            <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-[#1C1C1E]">
              <button
                id="force-majeure-btn"
                onClick={() => setShowRescheduleModal(true)}
                className="flex-1 py-2 bg-gradient-to-r from-[#FF5E5E]/15 to-[#FFAE58]/15 hover:from-[#FF5E5E]/25 hover:to-[#FFAE58]/25 border border-[#FF5E5E]/30 text-white font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-98"
              >
                <span>🚨</span> Форс-мажор
              </button>

              <select
                value={selectedModel}
                onChange={(e) => { setSelectedModel(e.target.value); localStorage.setItem('aiModel', e.target.value) }}
                className="bg-[#1C1C1E] border border-[#232326] text-[#8E8E93] text-[10px] px-1.5 py-2 rounded-xl focus:outline-none"
              >
                <option value="gemini-3.1-flash-lite">⭐ Gemini 3.1 Flash Lite (500 RPD)</option>
                <option value="gemini-3.5-flash-lite">⚡ Gemini 3.5 Flash Lite (500 RPD)</option>
                <option value="gemini-2.5-flash-lite">💎 Gemini 2.5 Flash Lite (500 RPD)</option>
                <option value="gemini-2-flash-lite">🛡️ Gemini 2 Flash Lite (500 RPD)</option>
              </select>
            </div>
          </div>
        )}

        {/* Фільтр категорій */}
        {activeTab !== 'settings' && (
          <div id="category-filter" className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { key: 'all', label: 'All' },
              { key: 'work', label: '💻 Work' },
              { key: 'personal', label: '👤 Personal' },
              { key: 'fitness', label: '🏋️ Fitness' },
              { key: 'study', label: '📚 Study' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setSelectedCategory(key)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === key ? 'bg-[#FF5E5E] text-white' : 'bg-[#161618] text-[#8E8E93] border border-[#232326]'
                }`}
              >{label}</button>
            ))}
          </div>
        )}

        {/* Календарі */}
        {activeTab === 'week' && (
          <WeekTab selectedDate={selectedDate} onSelectDate={setSelectedDate} taskSummaries={allTaskSummaries} />
        )}
        {activeTab === 'today' && (
          <HeatmapCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} taskSummaries={allTaskSummaries} />
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="flex flex-col gap-3">
            {/* Підписка */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><CreditCard className="w-4 h-4 text-[#FF5E5E]" /> Підписка</h3>
              <div className="bg-[#1C1C1E] p-3 rounded-xl border border-[#232326] flex justify-between items-center">
                <div>
                  <span className="text-xs font-semibold text-white block">Преміум</span>
                  <span className="text-[10px] text-[#8E8E93]">{user?.isPremium ? 'Активовано ✅' : 'Базовий тариф'}</span>
                </div>
                {!user?.isPremium && (
                  <button onClick={handleSubscribe} className="px-3 py-1.5 bg-[#FF5E5E] text-white text-xs font-bold rounded-xl active:scale-95">Оплатити 20 грн</button>
                )}
              </div>
            </div>

            {/* STT модель */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Mic className="w-4 h-4 text-[#A78BFA]" /> Розпізнавання голосу</h3>
              <select value={sttModel} onChange={(e) => handleSttModelChange(e.target.value)} className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none">
                <option value="whisper-1">🎙️ OpenAI Whisper-1 (14 год / $5 — Золотий Стандарт)</option>
                <option value="gpt-4o-mini-transcribe">⚡ GPT-4o Mini Transcribe (28 год / $5 — Найдешевший)</option>
              </select>
              <p className="text-[10px] text-[#636366] mt-2">gpt-4o-mini-transcribe — найдешевша модель (у 2 рази дешевша за Whisper)</p>
            </div>

            {/* Профіль енергії */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Clock className="w-4 h-4 text-[#FFAE58]" /> Профіль продуктивності</h3>
              <select value={energyProfile} onChange={(e) => { setEnergyProfile(e.target.value); localStorage.setItem('energyProfile', e.target.value) }} className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none">
                <option value="morning">🌅 Ранок — складні справи вранці</option>
                <option value="evening">🌌 Вечір — складні справи ввечері</option>
              </select>
            </div>

            {/* Telegram */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#5EA5FF]" /> Telegram-бот</h3>
              <p className="text-xs text-[#8E8E93] mb-3">Надсилай голосові нотатки боту — вони з'являться тут автоматично</p>
              {telegramPairCode ? (
                <div className="bg-[#1C1C1E] p-3 rounded-xl border border-[#232326] text-center">
                  <span className="text-[10px] text-[#8E8E93] block uppercase tracking-wider mb-1">Код підключення:</span>
                  <span className="text-2xl font-mono font-extrabold text-[#FFAE58] tracking-widest block mb-1">{telegramPairCode}</span>
                  <p className="text-[10px] text-[#8E8E93]">Надішли боту: <code className="text-[#A78BFA]">/pair {telegramPairCode}</code></p>
                </div>
              ) : (
                <button onClick={handleGeneratePairCode} className="w-full py-2 bg-[#1C1C1E] hover:bg-[#232326] border border-[#232326] text-white text-xs font-semibold rounded-xl transition-all active:scale-95">
                  Генерувати код
                </button>
              )}
            </div>

            {/* Notion */}
            <div className="bg-[#161618] border border-[#232326] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Share2 className="w-4 h-4 text-[#A78BFA]" /> База у Notion</h3>
              <p className="text-xs text-[#8E8E93] mb-3">Поділися Notion-сторінкою з <strong className="text-white">Brain Dump AI Planner</strong> та встав її ID:</p>
              <div className="flex gap-2">
                <input type="text" value={parentPageId} onChange={(e) => setParentPageId(e.target.value)} placeholder="32-значний Page ID..." className="flex-1 bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#A78BFA]" />
                <button onClick={handleCreateNotionDB} disabled={isCreatingNotionDB} className="px-3 py-2 bg-[#A78BFA] text-white text-xs font-bold rounded-xl active:scale-95 disabled:opacity-50">
                  {isCreatingNotionDB ? '...' : 'Створити'}
                </button>
              </div>
            </div>
          </div>
        )}



        {/* Чернетки */}
        {draftTasks && draftTasks.length > 0 && (
          <div className="bg-[#1C1C1E] border border-[#FFAE58]/60 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 border-b border-[#232326] pb-2">
              <span className="text-xs font-extrabold text-[#FFAE58] uppercase tracking-wider">
                🤖 AI пропонує {draftTasks.length} справ{draftTasks.length > 1 ? 'и' : 'у'}:
              </span>
              <button onClick={() => { setDraftTasks(null); setInputText('') }} className="text-[10px] text-[#636366] hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex flex-col gap-2.5">
              {draftTasks.map((t, idx) => {
                const pc = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG[4]
                return (
                  <div key={idx} className={`bg-[#161618] border border-[#232326] border-l-4 ${pc.border} rounded-xl p-3`}>
                    <input type="text" value={t.title}
                      onChange={(e) => { const u = [...draftTasks]; u[idx].title = e.target.value; setDraftTasks(u) }}
                      className="w-full bg-transparent text-white text-sm font-medium focus:outline-none mb-2"
                    />
                    {activeTab !== 'inbox' && t.category !== 'inbox' ? (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input type="text" value={t.timeSlot || ''} onChange={(e) => { const u = [...draftTasks]; u[idx].timeSlot = e.target.value; setDraftTasks(u) }} placeholder="⏰ Час (напр. 14:00-15:00)" className="bg-[#1C1C1E] border border-[#232326] text-white text-[11px] rounded-lg px-2 py-1.5 focus:outline-none" />
                        <input type="date" value={t.dueDate || ''} onChange={(e) => { const u = [...draftTasks]; u[idx].dueDate = e.target.value; setDraftTasks(u) }} className="bg-[#1C1C1E] border border-[#232326] text-white text-[11px] rounded-lg px-2 py-1.5 focus:outline-none" />
                      </div>
                    ) : (
                      <div className="text-[10px] text-[#A78BFA] bg-[#1C1C1E] px-2.5 py-1 rounded-lg border border-[#232326] mb-2 font-medium">
                        📥 Збережеться в Inbox без дати й часу
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <select value={t.priority} onChange={(e) => { const u = [...draftTasks]; u[idx].priority = Number(e.target.value); setDraftTasks(u) }} className="flex-1 bg-[#1C1C1E] border border-[#232326] text-white text-[11px] rounded-lg px-2 py-1.5 focus:outline-none">
                        <option value={1}>🔴 P1 — Терміново</option>
                        <option value={2}>🟠 P2 — Важливо</option>
                        <option value={3}>🔵 P3 — Normal</option>
                        <option value={4}>⚪ P4 — Низький</option>
                      </select>
                      <select value={t.category} onChange={(e) => { const u = [...draftTasks]; u[idx].category = e.target.value; setDraftTasks(u) }} className="flex-1 bg-[#1C1C1E] border border-[#232326] text-white text-[11px] rounded-lg px-2 py-1.5 focus:outline-none">
                        <option value="inbox">📥 Inbox</option>
                        <option value="work">💻 Work</option>
                        <option value="personal">👤 Personal</option>
                        <option value="fitness">🏋️ Fitness</option>
                        <option value="study">📚 Study</option>
                      </select>
                      <input type="number" value={t.duration || ''} onChange={(e) => { const u = [...draftTasks]; u[idx].duration = Number(e.target.value) || 0; setDraftTasks(u) }} placeholder="хв" min={1} className="w-14 bg-[#1C1C1E] border border-[#232326] text-white text-[11px] rounded-lg px-2 py-1.5 focus:outline-none text-center" />
                    </div>
                    {t.subtasks?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[#232326] flex flex-col gap-1">
                        {t.subtasks.map((s: string, si: number) => (
                          <div key={si} className="text-[11px] text-[#8E8E93] flex items-center gap-1.5"><Circle className="w-3 h-3 text-[#A78BFA]" />{s}</div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => setDraftTasks(draftTasks.filter((_, i) => i !== idx))} className="mt-2 text-[10px] text-[#636366] hover:text-[#FF5E5E] flex items-center gap-1"><X className="w-3 h-3" /> Прибрати</button>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 flex gap-2">
              <button onClick={handleConfirmDrafts} disabled={isProcessing} className="flex-1 py-3 bg-gradient-to-r from-[#FF5E5E] to-[#FFAE58] text-white text-sm font-bold rounded-xl active:scale-95 disabled:opacity-50">
                ✅ Підтвердити всі
              </button>
              <button onClick={() => { setDraftTasks(null); setInputText('') }} className="px-4 py-3 bg-[#232326] text-[#8E8E93] text-xs font-bold rounded-xl active:scale-95">
                Скасувати
              </button>
            </div>
          </div>
        )}

        {/* Список задач */}
        {(activeTab === 'today' || activeTab === 'week' || activeTab === 'inbox') && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#636366] font-semibold uppercase tracking-wider">
                {filteredTasks.filter((t) => t.status === 'todo').length} активних
              </span>

              <div className="flex items-center gap-2">
                {/* Кнопка "Edit Mode" — приховує/показує 🗑️ та стрілки */}
                <button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-xl border flex items-center gap-1 transition-all ${
                    isEditMode
                      ? 'bg-[#FF5E5E] text-white border-[#FF5E5E]'
                      : 'bg-[#161618] text-[#8E8E93] border-[#232326] hover:text-white'
                  }`}
                >
                  {isEditMode ? <Check className="w-3 h-3" /> : <Edit2 className="w-3 h-3" />}
                  <span>{isEditMode ? 'Готово' : 'Edit'}</span>
                </button>

                <div className="flex items-center gap-1 bg-[#161618] border border-[#232326] p-0.5 rounded-xl">
                  <button onClick={() => setSortBy('time')} className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${sortBy === 'time' ? 'bg-[#FF5E5E] text-white' : 'text-[#636366]'}`}>🕒 Час</button>
                  <button onClick={() => setSortBy('priority')} className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all ${sortBy === 'priority' ? 'bg-[#FF5E5E] text-white' : 'text-[#636366]'}`}>🎯 Пріор.</button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-[#1C1C1E] border border-[#232326] flex items-center justify-center mb-4">
                    <Zap className="w-7 h-7 text-[#FF5E5E] opacity-60" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2">Тут народжується твій спокій</h3>
                  <p className="text-xs text-[#636366] max-w-xs mb-5">Надиктуй голосом першу задачу — AI сам розбере і розкладе по часу!</p>
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`px-6 py-3 rounded-2xl font-bold text-sm text-white transition-all active:scale-95 ${isRecording ? 'bg-[#FF5E5E] animate-pulse shadow-lg shadow-[#FF5E5E]/40' : 'bg-gradient-to-r from-[#FF5E5E] to-[#A78BFA] shadow-md'}`}
                  >
                    {isRecording ? '🔴 Зупинити запис' : '🎙️ Надиктувати задачу'}
                  </button>
                </div>
              ) : (
                filteredTasks.map((task, idx) => {
                  const isDone = task.status === 'done'
                  const isExpanded = !!expandedTaskIds[task.id]
                  const isEditing = editingTaskId === task.id
                  const pc = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[4]
                  const doneCount = task.subtasks?.filter((s) => s.status === 'done').length || 0
                  const totalSubs = task.subtasks?.length || 0

                  // Перевірка на конфлікт часу
                  const hasConflict = !!(
                    task.timeSlot &&
                    filteredTasks.some((other) => other.id !== task.id && doSlotsOverlap(task.timeSlot, other.timeSlot))
                  )

                  const prevTask = idx > 0 ? filteredTasks[idx - 1] : null
                  const nextTask = idx < filteredTasks.length - 1 ? filteredTasks[idx + 1] : null

                  return (
                    <div key={task.id}
                      className={`bg-[#161618] border border-[#232326] border-l-4 ${
                        task.isCarriedOver ? 'border-l-[#FFAE58] bg-[#FFAE58]/5' : pc.border
                      } rounded-2xl overflow-hidden transition-all ${isDone ? 'opacity-55' : ''}`}
                    >
                      {/* Основний рядок */}
                      <div className="flex items-start gap-2.5 p-3">
                        {/* Чекбокс + розгортання підзадач — КРАЙНІ ЛІВІ */}
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          <button onClick={() => toggleTaskStatus(task)} className="text-[#636366] hover:text-[#FF5E5E] transition-colors">
                            {isDone ? <CheckCircle2 className="w-5 h-5 text-[#FF5E5E]" /> : <Circle className="w-5 h-5" />}
                          </button>

                          {totalSubs > 0 && (
                            <button
                              onClick={() => setExpandedTaskIds({ ...expandedTaskIds, [task.id]: !isExpanded })}
                              className="p-1 text-[#5EA5FF] hover:text-white transition-colors"
                              title="Розгорнути підзадачі"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          )}
                        </div>

                        {/* Текст + мета */}
                        <div className="flex-1 min-w-0">
                          {/* Час + Конфлікт */}
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            {task.timeSlot && (
                              <input
                                type="text"
                                defaultValue={task.timeSlot}
                                onBlur={async (e) => {
                                  const val = e.target.value.trim()
                                  if (!val || val === task.timeSlot) return
                                  try {
                                    const [s, en] = val.split('-').map((t) => t.trim())
                                    const [sh, sm] = s.split(':').map(Number)
                                    const [eh, em] = en.split(':').map(Number)
                                    const calcDur = (eh * 60 + em) - (sh * 60 + sm)
                                    const finalDur = calcDur > 0 ? calcDur : task.duration
                                    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, timeSlot: val, duration: finalDur } : t)))
                                    await fetch('/api/tasks', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: task.id, timeSlot: val, duration: finalDur }),
                                    })
                                    showToast(`⏱️ Оновлено: ${val} (${finalDur} хв)`, 'success')
                                  } catch {
                                    showToast('Формат часу: 14:00 - 15:30', 'error')
                                  }
                                }}
                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold tracking-wide border focus:outline-none w-28 bg-[#1C1C1E] ${
                                  hasConflict
                                    ? 'bg-[#FF5E5E]/20 text-[#FF5E5E] border-[#FF5E5E]/40 animate-pulse'
                                    : 'text-[#FFAE58] border-[#232326] focus:border-[#FFAE58]'
                                }`}
                                title="Редагувати час (напр: 14:00 - 15:30)"
                              />
                            )}
                            {hasConflict && (
                              <button
                                onClick={() => {
                                  setRescheduleSituation(`Конфлікт часу у справі "${task.title}". Посунь наступну справу або переплануй!`)
                                  setShowRescheduleModal(true)
                                }}
                                className="text-[9px] bg-[#FF5E5E]/25 hover:bg-[#FF5E5E]/40 text-[#FF5E5E] px-1.5 py-0.5 rounded-md font-bold border border-[#FF5E5E]/50 transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                title="Натисни для вирішення конфлікту"
                              >
                                ⚠️ Конфлікт часу
                              </button>
                            )}
                            {task.isCarriedOver && (
                              <span className="text-[9px] bg-[#FFAE58]/10 text-[#FFAE58]/80 px-1.5 py-0.5 rounded-md border border-[#FFAE58]/20">перенесено</span>
                            )}
                          </div>

                          {/* Назва */}
                          {isEditing ? (
                            <input autoFocus value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={() => handleSaveEditTitle(task)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEditTitle(task); if (e.key === 'Escape') setEditingTaskId(null) }}
                              className="w-full bg-[#1C1C1E] border border-[#FFAE58] text-white text-sm rounded-lg px-2 py-1 focus:outline-none"
                            />
                          ) : (
                            <span
                              className={`text-sm font-medium block leading-snug cursor-pointer ${isDone ? 'line-through text-[#636366]' : 'text-white'}`}
                              onDoubleClick={() => { if (!isDone) { setEditingTaskId(task.id); setEditingTitle(task.title) } }}
                            >
                              {task.title}
                            </span>
                          )}

                          {/* Мета-рядок */}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="text-[10px] text-[#636366] flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#5EA5FF]" />
                              <input
                                type="number"
                                defaultValue={task.duration}
                                min={1}
                                onBlur={async (e) => {
                                  const newDur = Number(e.target.value)
                                  if (!newDur || newDur === task.duration) return
                                  let newSlot = task.timeSlot
                                  if (task.timeSlot) {
                                    try {
                                      const [s] = task.timeSlot.split('-').map((t) => t.trim())
                                      const [sh, sm] = s.split(':').map(Number)
                                      const endMin = sh * 60 + sm + newDur
                                      const eh = String(Math.floor(endMin / 60) % 24).padStart(2, '0')
                                      const em = String(endMin % 60).padStart(2, '0')
                                      newSlot = `${s} - ${eh}:${em}`
                                    } catch {}
                                  }
                                  setTasks(tasks.map((t) => (t.id === task.id ? { ...t, duration: newDur, timeSlot: newSlot } : t)))
                                  await fetch('/api/tasks', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: task.id, duration: newDur, timeSlot: newSlot }),
                                  })
                                  showToast(`⏱️ Тривалість оновлено (${newDur} хв)`, 'success')
                                }}
                                className="w-10 bg-[#1C1C1E] border border-[#232326] text-white text-[10px] rounded px-1 text-center focus:outline-none focus:border-[#5EA5FF]"
                                title="Редагувати тривалість у хвилинах (авто-перерахунок часу)"
                              /> хв
                            </span>
                            <span className="text-[10px] text-[#636366] flex items-center gap-0.5 capitalize">
                              {CATEGORY_EMOJI[task.category] || '📌'} {task.category}
                            </span>
                            {totalSubs > 0 && (
                              <span className="text-[10px] text-[#5EA5FF]">📋 {doneCount}/{totalSubs}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Рядок дій (Notion-стиль) */}
                      <div className="flex items-center gap-1 px-3 pb-2.5 border-t border-[#1C1C1E]">
                        <select
                          value={task.priority}
                          onChange={async (e) => {
                            const newPrio = Number(e.target.value)
                            setTasks(tasks.map((t) => (t.id === task.id ? { ...t, priority: newPrio } : t)))
                            await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, priority: newPrio }) })
                          }}
                          className="bg-transparent text-[10px] text-[#636366] hover:text-white focus:outline-none cursor-pointer pr-1"
                          style={{ color: pc.color }}
                        >
                          <option value={1}>🔴 P1</option>
                          <option value={2}>🟠 P2</option>
                          <option value={3}>🔵 P3</option>
                          <option value={4}>⚪ P4</option>
                        </select>

                        {/* Кнопки обміну місцями — ТІЛЬКИ в Edit Mode */}
                        {isEditMode && prevTask && (
                          <button onClick={() => handleSwapTasksSequentialMath(task, prevTask)} className="p-1 text-[#FFAE58] text-xs font-bold rounded hover:bg-[#1C1C1E]" title="Пересунути вгору (послідовний обмін часу)">
                            ▲
                          </button>
                        )}
                        {isEditMode && nextTask && (
                          <button onClick={() => handleSwapTasksSequentialMath(task, nextTask)} className="p-1 text-[#FFAE58] text-xs font-bold rounded hover:bg-[#1C1C1E]" title="Пересунути вниз (послідовний обмін часу)">
                            ▼
                          </button>
                        )}

                        <div className="flex-1" />

                        {/* Кнопка швидкого ручного додавання підзадачі */}
                        <button
                          onClick={() => {
                            setAddingSubtaskParentId(addingSubtaskParentId === task.id ? null : task.id)
                            setExpandedTaskIds({ ...expandedTaskIds, [task.id]: true })
                          }}
                          className="text-[10px] text-[#5EA5FF] hover:text-white font-semibold flex items-center gap-0.5 px-2 py-0.5 rounded-lg hover:bg-[#1C1C1E]"
                        >
                          <Plus className="w-3 h-3" /> Підзадача
                        </button>

                        {(() => {
                          const rawDate = typeof task.dueDate === 'string' ? task.dueDate.split('T')[0] : (task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : formatLocalDate())
                          const dateClean = rawDate.replace(/-/g, '')
                          let startISO = `${dateClean}T090000Z`
                          let endISO = `${dateClean}T100000Z`
                          if (task.timeSlot) {
                            const [startT, endT] = task.timeSlot.split('-').map((s) => s.trim().replace(':', ''))
                            if (startT && endT) {
                              startISO = `${dateClean}T${startT}00`
                              endISO = `${dateClean}T${endT}00`
                            }
                          }
                          const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(task.title)}&details=${encodeURIComponent('Сплановано у Brain Dump AI Planner')}&dates=${startISO}/${endISO}&add=${encodeURIComponent(user?.email || '')}`
                          return (
                            <a
                              href={gcalUrl}
                              target="_blank" rel="noreferrer"
                              className="p-1.5 text-[#636366] hover:text-[#5EA5FF] transition-colors rounded-lg hover:bg-[#1C1C1E]"
                              title="Додати в Google Календар зі сповіщенням"
                            >
                              <CalendarIcon className="w-3.5 h-3.5" />
                            </a>
                          )
                        })()}

                        {/* Видалити — ТІЛЬКИ в Edit Mode */}
                        {isEditMode && (
                          <button onClick={() => deleteTask(task.id)} className="p-1.5 text-[#FF5E5E] hover:text-red-400 transition-colors rounded-lg hover:bg-[#1C1C1E]" title="Видалити задачу">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Поле додавання підзадачі вручну */}
                      {addingSubtaskParentId === task.id && (
                        <div className="px-3 pb-2.5 pt-1 border-t border-[#1C1C1E] flex items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={newSubtaskTitle}
                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddManualSubtask(task.id)
                              if (e.key === 'Escape') setAddingSubtaskParentId(null)
                            }}
                            placeholder="Назва підзадачі..."
                            className="flex-1 bg-[#1C1C1E] border border-[#5EA5FF] text-white text-xs rounded-xl px-2.5 py-1.5 focus:outline-none"
                          />
                          <button
                            onClick={() => handleAddManualSubtask(task.id)}
                            disabled={!newSubtaskTitle.trim()}
                            className="px-3 py-1.5 bg-[#5EA5FF] text-white text-xs font-bold rounded-xl active:scale-95 disabled:opacity-40"
                          >
                            Додати
                          </button>
                        </div>
                      )}

                      {/* Розгорнуті підзадачі */}
                      {isExpanded && task.subtasks && task.subtasks.length > 0 && (
                        <div className="px-3 pb-3 border-t border-[#1C1C1E] flex flex-col gap-1.5 pt-2.5">
                          {task.subtasks.map((sub) => (
                            <div key={sub.id} className="flex items-center gap-2 cursor-pointer" onClick={() => toggleSubtaskStatus(task.id, sub)}>
                              <div className="shrink-0">
                                {sub.status === 'done'
                                  ? <CheckCircle2 className="w-4 h-4 text-[#A78BFA]" />
                                  : <Circle className="w-4 h-4 text-[#636366]" />
                                }
                              </div>
                              <span className={`text-xs ${sub.status === 'done' ? 'line-through text-[#636366]' : 'text-[#8E8E93]'}`}>{sub.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Швидке додавання вручну (тільки для Planner) */}
            {activeTab !== 'inbox' && (
              !showQuickAdd ? (
                <button onClick={() => setShowQuickAdd(true)} className="w-full py-3 border-2 border-dashed border-[#232326] hover:border-[#FF5E5E]/50 text-[#636366] hover:text-[#FF5E5E] rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-98 mt-1">
                  <Plus className="w-4 h-4" /> Швидко додати задачу
                </button>
              ) : (
                <div className="bg-[#161618] border border-[#FF5E5E]/40 rounded-2xl p-3 flex flex-col gap-2 mt-1">
                  <input autoFocus type="text" value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); if (e.key === 'Escape') { setShowQuickAdd(false); setQuickAddTitle('') } }}
                    placeholder="Назва задачі..."
                    className="w-full bg-transparent text-white text-sm focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-[#8E8E93]">Початок:</span>
                      <input type="time" value={quickAddStartTime} onChange={(e) => setQuickAddStartTime(e.target.value)} className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-2 py-1.5 focus:outline-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-[#8E8E93]">Кінець (або тривалість):</span>
                      <input type="time" value={quickAddEndTime} onChange={(e) => setQuickAddEndTime(e.target.value)} className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-2 py-1.5 focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={quickAddPriority} onChange={(e) => setQuickAddPriority(Number(e.target.value))} className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-2 py-1.5 focus:outline-none">
                      <option value={1}>🔴 P1</option>
                      <option value={2}>🟠 P2</option>
                      <option value={3}>🔵 P3</option>
                      <option value={4}>⚪ P4</option>
                    </select>
                    <select value={selectedCategory !== 'all' ? selectedCategory : quickAddCategory} onChange={(e) => setQuickAddCategory(e.target.value)} className="bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-2 py-1.5 focus:outline-none capitalize">
                      <option value="inbox">📥 Inbox</option>
                      <option value="work">💻 Work</option>
                      <option value="personal">👤 Personal</option>
                      <option value="fitness">🏋️ Fitness</option>
                      <option value="study">📚 Study</option>
                    </select>
                    <input type="number" value={quickAddDuration} onChange={(e) => setQuickAddDuration(Number(e.target.value) || 30)} placeholder="хв" min={5} className="w-16 bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-2 py-1.5 focus:outline-none" />
                    <div className="flex-1" />
                    <button onClick={handleQuickAdd} disabled={!quickAddTitle.trim() || isQuickAdding} className="px-3 py-1.5 bg-[#FF5E5E] text-white text-xs font-bold rounded-xl active:scale-95 disabled:opacity-40">
                      {isQuickAdding ? '...' : 'Додати'}
                    </button>
                    <button onClick={() => { setShowQuickAdd(false); setQuickAddTitle('') }} className="p-1.5 text-[#636366] hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        setActiveTab={(tab) => { setActiveTab(tab); if (tab === 'today') setSelectedDate(formatLocalDate()) }}
        taskCountToday={tasks.filter((t) => t.status === 'todo').length}
        taskCountInbox={tasks.filter((t) => t.category === 'inbox' && t.status === 'todo').length}
      />

      <OnboardingTour isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={(u) => setUser(u)} />

      {/* Форс-мажор модалка */}
      {showRescheduleModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#161618] border border-[#FF5E5E]/30 w-full max-w-sm rounded-3xl p-5 shadow-2xl">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <span className="animate-bounce">🚨</span> Форс-мажор
            </h2>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-[#8E8E93]">Що сталося?</label>
              <button onClick={isRecordingModal ? stopRecordingModal : startRecordingModal} className={`p-2.5 rounded-2xl flex items-center justify-center transition-all ${isRecordingModal ? 'bg-[#FF5E5E] text-white animate-pulse shadow-lg shadow-[#FF5E5E]/40' : 'bg-[#1C1C1E] text-[#FFAE58] border border-[#FFAE58]/40 hover:bg-[#232326]'}`} title="Голосовий ввід">
                <Mic className="w-5 h-5" />
              </button>
            </div>
            <textarea value={rescheduleSituation} onChange={(e) => setRescheduleSituation(e.target.value)}
              placeholder="Опиши ситуацію (напр: 'прибери тренування', 'зсунь план на 2 год')..."
              className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#FF5E5E] h-24 resize-none mb-3"
            />
            <button onClick={handleReschedule} disabled={isRescheduling} className="w-full py-3 bg-gradient-to-r from-[#FF5E5E] to-[#FFAE58] text-white rounded-xl font-bold text-sm active:scale-95 disabled:opacity-40 mb-2">
              {isRescheduling ? '⏳ AI перебудовує...' : '⚡ Перебудувати розклад'}
            </button>
            <button onClick={() => { setShowRescheduleModal(false); setRescheduleSituation('') }} className="w-full py-2.5 bg-[#232326] text-[#8E8E93] rounded-xl text-xs active:scale-95">Скасувати</button>
          </div>
        </div>
      )}
    </div>
  )
}
