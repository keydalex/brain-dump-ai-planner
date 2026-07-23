import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const formData = await req.formData()
    const audioFile = formData.get('file') as File | null

    if (!audioFile) {
      return NextResponse.json({ error: 'Аудіофайл не знайдено' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY не налаштовано' }, { status: 500 })
    }

    const requestedModel = (formData.get('model') as string) || 'whisper-1'

    let transcribedText = ''

    // ─── 1. GPT-4o Mini Transcribe (найдешевша) ───
    if (requestedModel === 'gpt-4o-mini-transcribe') {
      try {
        const transcribeFormData = new FormData()
        transcribeFormData.append('file', audioFile, audioFile.name || 'audio.webm')
        transcribeFormData.append('model', 'gpt-4o-mini-transcribe')
        transcribeFormData.append('language', 'uk')

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: transcribeFormData,
        })

        if (res.ok) {
          const data = await res.json()
          transcribedText = data.text || ''
          console.log(`[STT] gpt-4o-mini-transcribe success: "${transcribedText.substring(0, 50)}..."`)
        } else {
          const errText = await res.text()
          console.warn(`[STT] gpt-4o-mini-transcribe failed (${res.status}):`, errText)
        }
      } catch (err) {
        console.warn(`[STT] gpt-4o-mini-transcribe exception, falling back to whisper-1:`, err)
      }
    }

    // ─── 2. Whisper-1 — золотий стандарт (дефолт & fallback) ───
    if (!transcribedText) {
      const whisperFD = new FormData()
      whisperFD.append('file', audioFile, audioFile.name || 'audio.webm')
      whisperFD.append('model', 'whisper-1')
      whisperFD.append('language', 'uk')

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperFD,
      })

      if (!whisperRes.ok) {
        const errText = await whisperRes.text()
        console.error('[STT] Whisper-1 error:', errText)
        return NextResponse.json({ error: 'Помилка розпізнавання мови' }, { status: 502 })
      }

      const whisperData = await whisperRes.json()
      transcribedText = whisperData.text || ''
      console.log(`[STT] whisper-1 success`)
    }

    return NextResponse.json({ text: transcribedText })
  } catch (error) {
    console.error('[STT] Internal error:', error)
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 })
  }
}
