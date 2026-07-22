import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatLocalDate } from '@/lib/date'

async function resolveUser() {
  let user = await getCurrentUser()
  if (!user) {
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { notionToken: { not: null } },
          { email: { not: 'demo@brain-dump.app' } }
        ]
      }
    })
    if (!user) {
      user = await prisma.user.findFirst()
    }
  }
  return user
}

export async function POST(req: Request) {
  try {
    const user = await resolveUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 400 })
    }

    const { text, model } = await req.json()
    if (!text || text.trim() === '') {
      return NextResponse.json({ error: 'Текст для аналізу порожній' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY не налаштовано' }, { status: 500 })
    }

    // Визначаємо валідну модель Gemini
    let activeModel = model || 'gemini-2.5-flash'
    if (activeModel.includes('3.6') || activeModel.includes('3.5') || activeModel.includes('3.1')) {
      activeModel = 'gemini-2.5-flash'
    }

    const now = new Date()
    const todayStr = formatLocalDate(now)
    const currentTimeStr = now.toLocaleTimeString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    
    const weekdays = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота']
    const currentDayOfWeek = weekdays[now.getDay()]

    const prompt = `Сьогоднішня дата: ${todayStr}. День тижня: ${currentDayOfWeek}. Поточний час: ${currentTimeStr}. 
Проаналізуй цей текст, розбий його на окремі плани, якщо їх там декілька, та обчисли правильний день, час і тривалість: "${text}"`

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: `Ти — AI-планувальник. Аналізуй сирі думки користувача українською мовою та розбивай їх на масив структурованих завдань. 
Враховуй такі правила розбору:
1. Якщо в тексті згадано кілька різних справ/планів, ОБОВ'ЯЗКОВО виділи їх в окремі об'єкти в масиві.
2. Розраховуй тривалість (duration) інтелектуально (наприклад, "на 5 годин" = 300 хв).
3. ОБОВ'ЯЗКОВО вираховуй та формуй timeSlot як проміжок часу через тире у форматі "HH:MM - HH:MM" (наприклад, "14:00 - 19:00").
4. Визначай правильний день dueDate (у форматі YYYY-MM-DD): 
   - Якщо згадано дату типу "8 серпня" або "8.08" — вистави конкретний день (наприклад "2026-08-08").
   - Якщо вказано "сьогодні", став дату ${todayStr}.
   - Якщо вказано "завтра" — став дату завтрашнього дня.
   - За замовчуванням став дату ${todayStr}.
5. Визначення пріоритету:
   - Якщо вжито слова "важливий", "найважливіший", "терміново", "важливе", "пріоритет" — ОБОВ'ЯЗКОВО виставляй priority = 1 (High).
   - Інакше 2 (Medium), 3 (Low), 4 (None).
6. Категорія: inbox, work, personal, fitness, study.`,
          },
        ],
      },
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            tasks: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  title: { type: 'STRING', description: 'Назва завдання українською мовою' },
                  category: { type: 'STRING', description: 'Категорія: inbox, work, personal, fitness, study' },
                  priority: { type: 'INTEGER', description: 'Пріоритет: 1-4' },
                  duration: { type: 'INTEGER', description: 'Очікувана тривалість у хвилинах' },
                  dueDate: { type: 'STRING', description: 'Дата у форматі YYYY-MM-DD' },
                  timeSlot: { type: 'STRING', description: 'Інтервал часу, наприклад, "14:00 - 19:00"' },
                  subtasks: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                  },
                },
                required: ['title', 'priority', 'duration', 'dueDate'],
              },
            },
          },
          required: ['tasks'],
        },
      },
    }

    let geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    if (!geminiRes.ok) {
      console.warn(`Model ${activeModel} failed, retrying with gemini-1.5-flash...`)
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API Error:', errText)
      return NextResponse.json({ error: 'Помилка аналізу AI' }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!parsedText) {
      return NextResponse.json({ error: 'Порожня відповідь від AI' }, { status: 500 })
    }

    const { tasks } = JSON.parse(parsedText)

    return NextResponse.json({ success: true, drafts: tasks })
  } catch (error) {
    console.error('Parse task API error:', error)
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 })
  }
}
