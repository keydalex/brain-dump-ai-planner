'use client'

import { useState, useEffect } from 'react'
import { X, ArrowRight } from 'lucide-react'

interface Step {
  targetId: string
  title: string
  description: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

const STEPS: Step[] = [
  {
    targetId: 'mic-btn',
    title: '🎙️ Голосовий ввід — головна фіча',
    description: 'Натисни і диктуй будь-що. AI сам витягне задачі, час, пріоритети і підзадачі. Говори природно!',
    position: 'bottom',
  },
  {
    targetId: 'send-btn',
    title: '📤 Відправка AI',
    description: 'Натисни щоб відправити набраний текст в AI. Після голосу він натискається автоматично.',
    position: 'bottom',
  },
  {
    targetId: 'force-majeure-btn',
    title: '🚨 Форс-мажор',
    description: 'Раптово щось змінилось? Натисни і скажи AI що сталося — він сам перебудує твій день.',
    position: 'top',
  },
  {
    targetId: 'category-filter',
    title: '🏷️ Фільтр категорій',
    description: 'Фільтруй задачі за темами: Work, Personal, Fitness, Study. Зручно коли задач багато.',
    position: 'bottom',
  },
  {
    targetId: 'onboarding-btn',
    title: '❓ Цей гід',
    description: 'Будь-коли повертайся сюди для підказок. Натискай ? у правому верхньому куті.',
    position: 'bottom',
  },
]

interface OnboardingTourProps {
  isOpen: boolean
  onClose: () => void
}

export default function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setStep(0)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const currentStep = STEPS[step]
    if (!currentStep) return

    const findTarget = () => {
      const el = document.getElementById(currentStep.targetId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          const rect = el.getBoundingClientRect()
          setTargetRect(rect)
        }, 300)
      } else {
        setTargetRect(null)
      }
    }

    findTarget()
  }, [step, isOpen])

  if (!isOpen) return null

  const currentStep = STEPS[step]
  const isLast = step === STEPS.length - 1

  // Позиція тултіпа відносно target
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

    const MARGIN = 12
    const TOOLTIP_W = 280

    let top = 0
    let left = Math.max(16, Math.min(window.innerWidth - TOOLTIP_W - 16, targetRect.left + targetRect.width / 2 - TOOLTIP_W / 2))

    if (currentStep.position === 'bottom') {
      top = targetRect.bottom + MARGIN
    } else {
      top = targetRect.top - MARGIN - 140
    }

    return { top, left, width: TOOLTIP_W }
  }

  // Spotlight cutout (highlight target element)
  const spotlightStyle: React.CSSProperties = targetRect
    ? {
        position: 'fixed',
        top: targetRect.top - 6,
        left: targetRect.left - 6,
        width: targetRect.width + 12,
        height: targetRect.height + 12,
        borderRadius: 16,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.78)',
        border: '2px solid rgba(255,94,94,0.8)',
        pointerEvents: 'none',
        zIndex: 998,
        transition: 'all 0.3s ease',
      }
    : {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.78)',
        pointerEvents: 'none',
        zIndex: 998,
      }

  return (
    <>
      {/* Overlay + spotlight cutout */}
      <div style={spotlightStyle} />

      {/* Тултіп */}
      <div
        className="fixed z-[999] bg-[#1C1C1E] border border-[#FF5E5E]/60 rounded-2xl p-4 shadow-2xl shadow-black/50"
        style={getTooltipStyle()}
      >
        {/* Стрілка */}
        {currentStep.position === 'bottom' && targetRect && (
          <div className="absolute -top-2 left-6 w-4 h-4 bg-[#1C1C1E] border-l border-t border-[#FF5E5E]/60 rotate-45" />
        )}
        {currentStep.position === 'top' && targetRect && (
          <div className="absolute -bottom-2 left-6 w-4 h-4 bg-[#1C1C1E] border-r border-b border-[#FF5E5E]/60 rotate-45" />
        )}

        <div className="flex items-start justify-between mb-1.5">
          <h3 className="text-sm font-bold text-white leading-snug pr-2">{currentStep.title}</h3>
          <button onClick={onClose} className="text-[#636366] hover:text-white shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-[#8E8E93] leading-relaxed mb-3">{currentStep.description}</p>

        {/* Прогрес та кнопки */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 flex-1">
            {STEPS.map((_, idx) => (
              <div key={idx} className={`h-1 rounded-full transition-all ${idx === step ? 'flex-1 bg-[#FF5E5E]' : 'w-4 bg-[#232326]'}`} />
            ))}
          </div>
          <button
            onClick={() => {
              if (isLast) { onClose(); return }
              setStep(step + 1)
            }}
            className="px-3 py-1.5 bg-[#FF5E5E] text-white text-xs font-bold rounded-xl active:scale-95 flex items-center gap-1 shrink-0"
          >
            {isLast ? 'Готово!' : 'Далі'} {!isLast && <ArrowRight className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </>
  )
}
