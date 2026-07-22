import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    // Отримуємо всі активні завдання на сьогодні
    const activeTasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        status: 'todo',
        dueDate: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    })

    if (activeTasks.length === 0) {
      return NextResponse.json({ message: 'Немає активних завдань на сьогодні для перепланування.' })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY не налаштовано' }, { status: 500 })
    }

    const prompt = `У мене форс-мажор і обмаль часу! Оціни та переплануй ці завдання на сьогодні: ${JSON.stringify(
      activeTasks.map((t) => ({ id: t.id, title: t.title, duration: t.duration, priority: t.priority }))
    )}. Скороти тривалість важких задач або перенеси найменш важливі (P4) на завтра.`

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
                text: 'Ти — експерт з перепланування завдань у форс-мажорних ситуаціях. Оптимізуй час і поверни оновлений списком завдань у форматі JSON.',
              },
            ],
          },
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                rescheduledTasks: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      id: { type: 'STRING' },
                      compressedDuration: { type: 'INTEGER' },
                      moveToTomorrow: { type: 'BOOLEAN' },
                    },
                    required: ['id', 'compressedDuration', 'moveToTomorrow'],
                  },
                },
              },
              required: ['rescheduledTasks'],
            },
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      return NextResponse.json({ error: 'Помилка AI перепланування' }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!parsedText) {
      return NextResponse.json({ error: 'Порожня відповідь AI' }, { status: 500 })
    }

    const { rescheduledTasks } = JSON.parse(parsedText)

    let updatedCount = 0

    for (const item of rescheduledTasks) {
      if (item.moveToTomorrow) {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        await prisma.task.update({
          where: { id: item.id },
          data: {
            dueDate: tomorrow,
            isCarriedOver: true,
          },
        })
      } else {
        await prisma.task.update({
          where: { id: item.id },
          data: {
            duration: item.compressedDuration || 15,
          },
        })
      }
      updatedCount++
    }

    return NextResponse.json({
      success: true,
      message: `Успішно переплановано ${updatedCount} завдань!`,
    })
  } catch (error) {
    console.error('Reschedule API error:', error)
    return NextResponse.json({ error: 'Помилка перепланування' }, { status: 500 })
  }
}
