import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const { text } = await req.json()
    if (!text || text.trim() === '') {
      return NextResponse.json({ error: 'Текст для аналізу порожній' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY не налаштовано' }, { status: 500 })
    }

    const todayStr = new Date().toISOString().split('T')[0]

    const prompt = `Сьогоднішня дата: ${todayStr}. Проаналізуй цей текст та перетвори його у структуроване завдання: "${text}"`

    // Виклик Gemini REST API із суворим JSON розбором та temperature=0
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [
              {
                text: 'Ти — AI-планувальник Todoist. Аналізуй сирі думки користувача українською мовою та витягуй з них суть задачі, пріоритет (1 - High, 2 - Medium, 3 - Low, 4 - None), очікувану тривалість у хвилинах, категорію та підзадачі (якщо згадано слово "підзадачі" або є перелік).',
              },
            ],
          },
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING', description: 'Коротка чітка назва завдання українською мовою' },
                category: { type: 'STRING', description: 'Категорія: inbox, work, personal, fitness, study' },
                priority: { type: 'INTEGER', description: 'Пріоритет: 1 (найвищий High), 2 (Medium), 3 (Low), 4 (None)' },
                duration: { type: 'INTEGER', description: 'Очікувана тривалість у хвилинах' },
                dueDate: { type: 'STRING', description: 'Дата у форматі YYYY-MM-DD' },
                subtasks: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                  description: 'Масив назв вкладених підзадач',
                },
              },
              required: ['title', 'priority', 'duration'],
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

    const parsedTask = JSON.parse(parsedText)

    // Обчислення дати
    let targetDate = new Date()
    if (parsedTask.dueDate) {
      const parsedDate = new Date(parsedTask.dueDate)
      if (!isNaN(parsedDate.getTime())) {
        targetDate = parsedDate
      }
    }

    // Створення головного завдання в Supabase
    const createdTask = await prisma.task.create({
      data: {
        userId: user.id,
        title: parsedTask.title,
        priority: parsedTask.priority || 4,
        category: parsedTask.category || 'inbox',
        duration: parsedTask.duration || 30,
        dueDate: targetDate,
        subtasks: parsedTask.subtasks && parsedTask.subtasks.length > 0 ? {
          create: parsedTask.subtasks.map((st: string) => ({
            userId: user.id,
            title: st,
            priority: 4,
            category: parsedTask.category || 'inbox',
            duration: 15,
            dueDate: targetDate,
          }))
        } : undefined,
      },
      include: {
        subtasks: true,
      },
    })

    return NextResponse.json({ task: createdTask, parsedRaw: parsedTask })
  } catch (error) {
    console.error('Parse task API error:', error)
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 })
  }
}
