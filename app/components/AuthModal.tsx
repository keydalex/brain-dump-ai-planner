'use client'

import { useState } from 'react'
import { LogIn, UserPlus, Lock, Mail, AlertCircle } from 'lucide-react'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: any) => void
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Сталася помилка')
      }

      onSuccess(data.user)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-[#161618] border border-[#232326] w-full max-w-sm rounded-3xl p-6 relative flex flex-col shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            {isLogin ? <LogIn className="w-5 h-5 text-[#FF5E5E]" /> : <UserPlus className="w-5 h-5 text-[#A78BFA]" />}
            {isLogin ? 'Вхід у систему' : 'Створити акаунт'}
          </h2>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#FF5E5E]/10 border border-[#FF5E5E]/30 text-[#FF5E5E] rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label className="text-[11px] text-[#8E8E93] font-medium block mb-1">Email адреса</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#8E8E93] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl pl-10 pr-3 py-3 focus:outline-none focus:border-[#FF5E5E]"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[#8E8E93] font-medium block mb-1">Пароль</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#8E8E93] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#1C1C1E] border border-[#232326] text-white text-xs rounded-xl pl-10 pr-3 py-3 focus:outline-none focus:border-[#FF5E5E]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 bg-[#FF5E5E] text-white rounded-xl font-semibold text-xs transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Обробка...' : isLogin ? 'Увійти' : 'Зареєструватися'}
          </button>
        </form>

        <div className="mt-4 text-center flex flex-col gap-2.5">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-[#8E8E93] hover:text-white transition-colors"
          >
            {isLogin ? 'Немає акаунту? Реєстрація' : 'Вже є акаунт? Увійти'}
          </button>

          <div className="border-t border-[#232326] my-1" />

          <button
            type="button"
            onClick={async () => {
              setLoading(true)
              setError('')
              try {
                const res = await fetch('/api/auth/demo', { method: 'POST' })
                const data = await res.json()
                if (res.ok && data.success) {
                  onSuccess(data.user)
                  onClose()
                } else {
                  throw new Error(data.error || 'Помилка запуску демо')
                }
              } catch (err: any) {
                setError(err.message)
              } finally {
                setLoading(false)
              }
            }}
            className="w-full py-3 bg-[#FFAE58]/10 hover:bg-[#FFAE58]/20 text-[#FFAE58] border border-[#FFAE58]/20 rounded-xl font-bold text-xs transition-all active:scale-95"
          >
            ⚡ Спробувати Демо-режим (В один клік)
          </button>
        </div>
      </div>
    </div>
  )
}
