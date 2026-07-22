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

    // Відправляємо аудіофайл у Whisper API із мовною позначкою 'uk'
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
    return NextResponse.json({ text: whisperData.text })
  } catch (error) {
    console.error('Audio transcribe error:', error)
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 })
  }
}
