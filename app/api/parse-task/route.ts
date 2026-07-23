import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { formatLocalDate, getKyivTimeStr } from '@/lib/date'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const { text, model, mode } = await req.json()
    if (!text || text.trim() === '') {
      return NextResponse.json({ error: 'Текст для аналізу порожній' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY не налаштовано' }, { status: 500 })
    }

    const activeModel = model || 'gemini-3.5-flash-lite'
    const todayStr = formatLocalDate()
    const currentTimeStr = getKyivTimeStr()
    const isInboxMode = mode === 'inbox'
    
    const now = new Date()
    const weekdays = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота']
    const currentDayOfWeek = weekdays[now.getDay()]

    const prompt = `СИСТЕМНІ ЗМІННІ:
Сьогоднішня дата за Києвом: ${todayStr} (формат YYYY-MM-DD). 
Поточний день тижня: ${currentDayOfWeek}. 
Поточний час за Києвом: ${currentTimeStr}.
${isInboxMode ? 'РЕЖИМ INBOX: Замовчуванням dueDate = null та timeSlot = null!' : ''}

<raw_data_input>
${text}
</raw_data_input>`

    const responseSchema = isInboxMode ? {
      type: 'OBJECT',
      properties: {
        tasks: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING', description: 'Назва завдання українською мовою' },
              category: { type: 'STRING', description: 'Категорія: inbox, work, personal, fitness, study' },
              priority: { type: 'INTEGER', description: 'Пріоритет: 1, 2, 3, або 4' },
              duration: { type: 'INTEGER', description: 'Очікувана тривалість у хвилинах' },
              dueDate: { type: 'STRING', nullable: true, description: 'Дата YYYY-MM-DD або null' },
              timeSlot: { type: 'STRING', nullable: true, description: 'Інтервал HH:MM - HH:MM або null' },
              subtasks: {
                type: 'ARRAY',
                items: { type: 'STRING' },
              },
            },
            required: ['title', 'priority', 'duration'],
          },
        },
      },
      required: ['tasks'],
    } : {
      type: 'OBJECT',
      properties: {
        tasks: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING', description: 'Назва завдання українською мовою' },
              category: { type: 'STRING', description: 'Категорія: inbox, work, personal, fitness, study' },
              priority: { type: 'INTEGER', description: 'Пріоритет: 1, 2, 3, або 4' },
              duration: { type: 'INTEGER', description: 'Очікувана тривалість у хвилинах' },
              dueDate: { type: 'STRING', description: 'Дата YYYY-MM-DD. ОБОВ’ЯЗКОВА.' },
              timeSlot: { type: 'STRING', nullable: true, description: 'Інтервал HH:MM - HH:MM або null' },
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
    }

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: `Ти — AI-планувальник. Аналізуй сирі думки користувача всередині тегів <raw_data_input>...</raw_data_input> та розбивай їх на масив структурованих завдань.

ПРАВИЛА РОЗРАХУНКУ ДАТИ ТА ЧАСУ (Europe/Kyiv):
1. У режимі INBOX (${isInboxMode ? 'АКТИВНИЙ' : 'НЕ АКТИВНИЙ'}): Якщо користувач ЯВНО не вказав дату або час, ти ПОВИНЕН повернути null для dueDate та timeSlot.
2. Для звичайного режиму PLANNER: Якщо дата не вказана, за замовчуванням dueDate = "${todayStr}".
3. Якщо каже "завтра", дата = "${todayStr}" + 1 день.
4. Якщо каже "через N днів" (наприклад "через 2 дні", "через 3 дні"), точна дата = "${todayStr}" + N днів.
5. Якщо згадано день тижня ("в суботу", "у вівторок", "у четвер", "в п'ятницю", "за сб"), знайди найближчу наступну дату цього дня тижня відносно сьогоднішнього дня (${currentDayOfWeek}, ${todayStr}).
6. Якщо вказано відносний час ("через 2 години", "через 30 хв", "через півгодини"), обчисли timeSlot у форматі HH:MM - HH:MM від поточного київського часу (${currentTimeStr}).

АЛГОРИТМ ПРИЗНАЧЕННЯ ПРІОРИТЕТІВ (Пріоритет 1-4, Дерево рішень):
- P1: Термінові дедлайни, слова "терміново", "сьогодні здати", аварії, важливі зустрічі.
- P2: Важливі особисті цілі, просування проектів, тренування, навчання.
- P3: Регулярні побутові задачі (прибирання, магазин), адміністративна рутина.
- P4: Дрібні думки без дати.

ПРИКЛАДИ РОЗБОРУ (Few-Shot Examples):
1. <raw_data_input>терміново здати звіт до 15:00</raw_data_input> -> priority: 1, category: "work", duration: 60, dueDate: "${todayStr}", timeSlot: "15:00 - 16:00"
2. <raw_data_input>на завтра зробити тренування</raw_data_input> -> priority: 2, category: "fitness", duration: 60, dueDate: "${todayStr}", timeSlot: null
3. <raw_data_input>купити хліб та молоко</raw_data_input> -> priority: 3, category: "personal", duration: 20, dueDate: "${todayStr}", timeSlot: null`,
          },
        ],
      },
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema,
      },
    }

    // Спроба 1: Обрана 500 RPD модель
    let geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    // Страховка 1: gemini-3.5-flash-lite (500 RPD)
    if (!geminiRes.ok && activeModel !== 'gemini-3.5-flash-lite') {
      console.warn(`Model ${activeModel} failed, retrying with gemini-3.5-flash-lite...`)
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
    }

    // Страховка 2: gemini-3.1-flash-lite (500 RPD)
    if (!geminiRes.ok) {
      console.warn(`Fallback to gemini-3.1-flash-lite...`)
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
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

    let { tasks } = JSON.parse(parsedText)

    // 🛡️ ПОСТ-ОБРОБКА ТА ЖОРСТКІ ДИКТАТИ (TypeScript Post-Processing Hardcodes)
    if (Array.isArray(tasks)) {
      tasks = tasks.map((t: any) => {
        const textLower = (t.title || text).toLowerCase()
        const isUrgent = textLower.includes('терміново') || textLower.includes('аварія') || textLower.includes('важливо') || textLower.includes('негайно')

        let priority = isUrgent ? 1 : (t.priority || 3)
        let dueDate = t.dueDate

        if (mode === 'force') {
          priority = isUrgent || t.priority === 1 ? 1 : (t.priority || 1)
          dueDate = todayStr
        } else if (isInboxMode) {
          return {
            ...t,
            category: 'inbox',
            dueDate: null,
            timeSlot: null,
            priority,
          }
        } else {
          // Режим PLANNER (Today / Week)
          if (!dueDate || dueDate === 'null') {
            dueDate = todayStr // Жорстко гарантуємо дату сьогодні
          }
        }

        return {
          ...t,
          priority,
          dueDate,
        }
      })
    }

    return NextResponse.json({ success: true, drafts: tasks })
  } catch (error) {
    console.error('Parse task API error:', error)
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 })
  }
}
