import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    let user = await getCurrentUser()
    if (!user) {
      user = await prisma.user.findFirst()
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: 'demo@brain-dump.app',
            passwordHash: 'demo_guest_hash',
          },
        })
      }
    }

    const formData = await req.formData()
    const audioFile = formData.get('file') as File | null

    if (!audioFile) {
      return NextResponse.json({ error: 'Аудіофайл не знайдено' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY не налаштовано на Vercel' }, { status: 500 })
    }

    const userSettings = await prisma.settings.findUnique({
      where: { userId: user.id },
    })
    const requestedModel = (formData.get('model') as string) || userSettings?.sttModel || 'whisper-1'

    let transcribedText = ''

    if (requestedModel.startsWith('gpt-4o-mini')) {
      try {
        // Конвертація файлу в base64 для gpt-4o-mini
        const arrayBuffer = await audioFile.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const base64Data = buffer.toString('base64')

        // Визначаємо формат файлу (OpenAI підтримує wav та mp3 для input_audio)
        let audioFormat = 'wav'
        if (audioFile.name.endsWith('.mp3')) {
          audioFormat = 'mp3'
        }

        const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            modalities: ['text'],
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_audio',
                    input_audio: {
                      data: base64Data,
                      format: audioFormat,
                    },
                  },
                  {
                    type: 'text',
                    text: 'Транскрибуй це аудіо слово в слово українською мовою. Поверни лише текст транскрипції без коментарів.',
                  },
                ],
              },
            ],
          }),
        })

        if (gptRes.ok) {
          const gptData = await gptRes.json()
          transcribedText = gptData.choices?.[0]?.message?.content || ''
        } else {
          const errText = await gptRes.text()
          console.warn('gpt-4o-mini transcribe failed, falling back to whisper-1:', errText)
        }
      } catch (err) {
        console.warn('Error transcribing via gpt-4o-mini, falling back to whisper-1:', err)
      }
    }

    // Якщо gpt-4o-mini не спрацював або обрано whisper-1, використовуємо Whisper API
    if (!transcribedText) {
      const whisperFormData = new FormData()
      whisperFormData.append('file', audioFile, audioFile.name || 'audio.webm')
      whisperFormData.append('model', 'whisper-1')
      whisperFormData.append('language', 'uk')

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: whisperFormData,
      })

      if (!whisperRes.ok) {
        const errText = await whisperRes.text()
        console.error('Whisper API Error:', errText)
        return NextResponse.json({ error: 'Помилка транскрипції аудіо через Whisper' }, { status: 502 })
      }

      const whisperData = await whisperRes.json()
      transcribedText = whisperData.text
    }

    return NextResponse.json({ text: transcribedText })
  } catch (error) {
    console.error('Audio transcribe error:', error)
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 })
  }
}
