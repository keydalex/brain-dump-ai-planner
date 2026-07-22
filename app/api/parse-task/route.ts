import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { formatLocalDate } from '@/lib/date'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const { text, model } = await req.json()
    if (!text || text.trim() === '') {
      return NextResponse.json({ error: 'Текст для аналізу порожній' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY не налаштовано' }, { status: 500 })
    }

    // За замовчуванням Gemini 3.1 Flash Lite (має величезний ліміт 500 RPD)
    const activeModel = model || 'gemini-3.1-flash-lite'

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
   - ОБОВ'ЯЗКОВО став сьогоднішню дату (${todayStr}) за замовчуванням. Навіть якщо вказано час, який уже минув сьогодні, ВСЕ ОДНО став сьогоднішню дату (${todayStr}). НЕ перенось справи на завтра самовільно!
   - Тільки якщо користувач чітко сказав "завтра", став дату завтрашнього дня.
   - Якщо згадано дату типу "8 серпня" або "8.08" — вистави конкретний день ("2026-08-08").
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

    // Основна спроба обраною моделлю
    let geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    // Страховка 1: Якщо обрана модель перевищила ліміт RPD, пробуємо gemini-3.1-flash-lite (500 RPD)
    if (!geminiRes.ok && activeModel !== 'gemini-3.1-flash-lite') {
      console.warn(`Model ${activeModel} failed, retrying with gemini-3.1-flash-lite...`)
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
    }

    // Страховка 2: gemini-3.5-flash-lite (500 RPD)
    if (!geminiRes.ok) {
      console.warn(`Fallback to gemini-3.5-flash-lite...`)
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
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
