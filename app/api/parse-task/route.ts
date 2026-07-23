import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { formatLocalDate, getKyivTimeStr } from '@/lib/date'

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

    // Дефолтна модель — Gemini 3.5 Flash Lite
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
${isInboxMode ? 'РЕЖИМ ВХІДНИХ (INBOX): Замовчуванням dueDate = null та timeSlot = null!' : ''}

<raw_data_input>
${text}
</raw_data_input>`

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: `Ти — AI-планувальник. Аналізуй сирі думки користувача всередині тегів <raw_data_input>...</raw_data_input> та розбивай їх на масив структурованих завдань.

ПРАВИЛА РОЗРАХУНКУ ДАТИ ТА ЧАСУ (dueDate / timeSlot):
1. У режимі INBOX (${isInboxMode ? 'АКТИВНИЙ' : 'НЕ АКТИВНИЙ'}): Якщо користувач ЯВНО не вказав дату або час (наприклад "завтра", "о 15:00", "в суботу"), ти ПОВИНЕН повернути null для dueDate та timeSlot. ЗАБОРОНЕНО генерувати або підставляти поточну дату за замовчуванням у режимі Inbox!
2. Для звичайного режиму: Якщо дата не вказана, за замовчуванням dueDate = "${todayStr}".
3. Якщо користувач каже "завтра", дата = "${todayStr}" + 1 день.
4. Якщо згадано день тижня ("в суботу", "за сб", "у четвер", "в п'ятницю"), знайди найближчу наступну дату цього дня тижня відносно сьогоднільного дня (${currentDayOfWeek}, ${todayStr}).
5. Обчислюй відносний час ("через 2 години", "через 30 хв") від поточного київського часу (${currentTimeStr}).

АЛГОРИТМ ПРИЗНАЧЕННЯ ПРІОРИТЕТІВ (Пріоритет 1-4, Дерево рішень):
КРОК 1 (Priority = 1): Термінові дедлайни, слова "терміново", "сьогодні здати", критична робота, важливі зустрічі, іспити, лікарі.
КРОК 2 (Priority = 2): Важливі особисті цілі, просування проектів, тренування, навчання, основні робочі плани.
КРОК 3 (Priority = 3): Регулярні побутові задачі (прибирання, магазин), адміністративна рутина (пошта, дзвінки).
КРОК 4 (Priority = 4): Абстрактні ідеї, нотатки, колись подивитись фільм, роздуми без часової прив'язки.

ІНШІ ПРАВИЛА:
- Вираховуй тривалість (duration) у хвилинах.
- Вкладай підзадачі у масив subtasks.
- Категорія: inbox, work, personal, fitness, study.`,
          },
        ],
      },
      generationConfig: {
        temperature: 0.0,
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
        },
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

    const { tasks } = JSON.parse(parsedText)

    return NextResponse.json({ success: true, drafts: tasks })
  } catch (error) {
    console.error('Parse task API error:', error)
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 })
  }
}
