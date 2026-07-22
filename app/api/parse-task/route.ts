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
      return NextResponse.json({ error: 'Необхідно зареєструватись' }, { status: 400 })
    }

    const { text, model } = await req.json()
    if (!text || text.trim() === '') {
      return NextResponse.json({ error: 'Текст для аналізу порожній' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY не налаштовано на Vercel' }, { status: 500 })
    }

    // Дозволяємо вибір моделі (за замовчуванням gemini-3.6-flash)
    const activeModel = model || 'gemini-3.6-flash'

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

    // Виклик Gemini REST API із суворим JSON розбором та temperature=0
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [
              {
                text: `Ти — AI-планувальник Todoist. Аналізуй сирі думки користувача українською мовою та розбивай їх на масив структурованих завдань. 
Враховуй такі правила розбору:
1. Якщо в тексті згадано кілька різних справ/планів, ОБОВ'ЯЗКОВО виділи їх в окремі об'єкти в масиві.
2. Розраховуй тривалість (duration) інтелектуально:
   - Якщо вказано конкретний інтервал (наприклад, "о 18:20... до 18:55"), розрахуй тривалість (з 18:20 до 18:55 = 35 хвилин).
   - Якщо вказано поточний час (наприклад, "зараз 18:42, треба доробити до 20:00"), розрахуй тривалість від поточного часу до дедлайну (20:00 - 18:42 = 78 хвилин).
   - Якщо тривалість не вказано явно, оціни логічно за типом справи (пробіжка = 45 хв, прибирання = 60 хв, перегляд лекції = 90 хв, зателефонувати мамі = 15 хв). Не став завжди 30 хв!
3. ОБОВ'ЯЗКОВО вираховуй та формуй timeSlot як повноцінний проміжок часу через тире у форматі "HH:MM - HH:MM" (наприклад, "15:15 - 17:15"). Якщо користувач вказав час початку (наприклад, "о 15:15" або "починаю в 15:15") та тривалість (наприклад, "на 2 години"), автоматично обчисли час закінчення та збережи у вигляді "15:15 - 17:15".
4. Визначай правильний день dueDate (у форматі YYYY-MM-DD): 
   - Якщо вказано "сьогодні" або дата відповідає сьогоднішній, став сьогоднішню дату (${todayStr}).
   - Якщо вказано "завтра" — став дату завтрашнього дня.
   - Якщо вказано день тижня (наприклад, "в п'ятницю") — став дату найближчої наступної п'ятниці, виходячи з того, що сьогодні ${currentDayOfWeek} (${todayStr}).
   - Якщо вказано конкретне число (наприклад, "22.07" або "25 липня") — став відповідну дату.
   - Якщо дата не вказана взагалі, за замовчуванням став сьогоднішню дату (${todayStr}).
5. Витягуй пріоритет (1 - High, 2 - Medium, 3 - Low, 4 - None) та категорію (inbox, work, personal, fitness, study).
6. Витягуй підзадачі, якщо вони є.`,
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
                      timeSlot: { type: 'STRING', description: 'Інтервал часу, наприклад, "18:20-18:55" або "18:00"' },
                      subtasks: {
                        type: 'ARRAY',
                        items: { type: 'STRING' },
                        description: 'Масив назв вкладених підзадач',
                      },
                    },
                    required: ['title', 'priority', 'duration', 'dueDate'],
                  },
                },
              },
              required: ['tasks'],
            },
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API Error:', errText)
      return NextResponse.json({ error: 'Помилка розпізнавання AI' }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!parsedText) {
      return NextResponse.json({ error: 'Порожня відповідь від AI' }, { status: 500 })
    }

    const { tasks } = JSON.parse(parsedText)

    // Повертаємо чернетки (drafts) користувачу для підтвердження та коригування перед записом у базу
    return NextResponse.json({ success: true, drafts: tasks })
  } catch (error) {
    console.error('Parse task API error:', error)
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 })
  }
}
