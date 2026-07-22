'use client'

import { useState } from 'react'
import { CheckCircle2, Mic, Sparkles, Zap, ArrowRight, X } from 'lucide-react'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState(0)

  if (!isOpen) return null

  const steps = [
    {
      icon: <Sparkles className="w-12 h-12 text-[#FF5E5E]" />,
      title: 'Ласкаво просимо в Brain Dump AI!',
      description: 'Твій особистий асистент продуктивності. Забудь про хаос у нотатках — AI сам розбере твої думки та заповнить розклад.',
    },
    {
      icon: <Mic className="w-12 h-12 text-[#A78BFA]" />,
      title: 'Голосовий ввід українською',
      description: 'Натискай мікрофон та диктуй усе підряд. Завдяки OpenAI Whisper та Gemini, AI витягне назву, тривалість, дедлайн та підзадачі.',
    },
    {
      icon: <Zap className="w-12 h-12 text-[#FFAE58]" />,
      title: 'Автоматичний Carryover та Notion',
      description: 'Невиконані задачі автоматично переносяться на завтра о 00:00 за київським часом. Синхронізуй їх у Notion та Google Календар.',
    },
  ]

  const current = steps[step]

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-[#161618] border border-[#232326] w-full max-w-sm rounded-3xl p-6 relative flex flex-col items-center text-center shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#8E8E93] hover:text-white p-1 rounded-full"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4 p-4 rounded-2xl bg-[#1C1C1E] border border-[#232326]">
          {current.icon}
        </div>

        <h2 className="text-lg font-bold text-white mb-2">{current.title}</h2>
        <p className="text-xs text-[#8E8E93] leading-relaxed mb-6">
          {current.description}
        </p>

        {/* Прогрес крапки */}
        <div className="flex gap-1.5 mb-6">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === step ? 'w-6 bg-[#FF5E5E]' : 'w-1.5 bg-[#232326]'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => {
            if (step < steps.length - 1) {
              setStep(step + 1)
            } else {
              onClose()
            }
          }}
          className="w-full py-3.5 bg-[#FF5E5E] text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-[#FF5E5E]/25"
        >
          {step < steps.length - 1 ? (
            <>
              Далі <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              Розпочати! <CheckCircle2 className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
