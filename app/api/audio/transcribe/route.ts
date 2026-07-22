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

    // ─── GPT-4o Transcribe API (нова endpoints, 500h/місяць) ───
    if (requestedModel === 'gpt-4o-transcribe' || requestedModel === 'gpt-4o-mini-transcribe') {
      try {
        const transcribeFormData = new FormData()
        transcribeFormData.append('file', audioFile, audioFile.name || 'audio.webm')
        // Новий API використовує ті ж самі ендпоінти що і whisper, але з іншою назвою моделі
        transcribeFormData.append('model', requestedModel)
        transcribeFormData.append('language', 'uk')

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: transcribeFormData,
        })

        if (res.ok) {
          const data = await res.json()
          transcribedText = data.text || ''
          console.log(`[STT] ${requestedModel} success: "${transcribedText.substring(0, 50)}..."`)
        } else {
          const errText = await res.text()
          console.warn(`[STT] ${requestedModel} failed (${res.status}):`, errText)
          // Fallback до whisper-1
        }
      } catch (err) {
        console.warn(`[STT] ${requestedModel} exception, falling back to whisper-1:`, err)
      }
    }

    // ─── GPT-4o Mini Audio completions (legacy, через chat) ───
    if (!transcribedText && requestedModel === 'gpt-4o-mini-audio') {
      try {
        const arrayBuffer = await audioFile.arrayBuffer()
        const base64Data = Buffer.from(arrayBuffer).toString('base64')

        const ext = audioFile.name?.includes('mp4') ? 'mp4' : audioFile.name?.includes('ogg') ? 'ogg' : 'webm'
        // OpenAI audio chat completions підтримує wav та mp3; для webm/ogg — fallback на whisper
        // Тому цей шлях лишаємо тільки як останній варіант

        const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            modalities: ['text'],
            messages: [{
              role: 'user',
              content: [
                { type: 'input_audio', input_audio: { data: base64Data, format: ext === 'webm' ? 'wav' : ext } },
                { type: 'text', text: 'Транскрибуй це аудіо слово в слово українською мовою. Поверни лише текст без коментарів.' },
              ],
            }],
          }),
        })

        if (gptRes.ok) {
          const gptData = await gptRes.json()
          transcribedText = gptData.choices?.[0]?.message?.content || ''
        }
      } catch (err) {
        console.warn('[STT] gpt-4o-mini-audio chat failed:', err)
      }
    }

    // ─── Whisper-1 — основний надійний fallback ───
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
      console.log(`[STT] whisper-1 fallback success`)
    }

    return NextResponse.json({ text: transcribedText })
  } catch (error) {
    console.error('[STT] Internal error:', error)
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 })
  }
}
