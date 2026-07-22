import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const { situation, strategy, energyProfile } = await req.json()

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

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

    const now = new Date()
    const currentTimeStr = now.toLocaleTimeString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const prompt = `Поточний час: ${currentTimeStr}.
Вказівка/ситуація від користувача: "${situation || 'оптимізувати розклад'}"
Стратегія: "${strategy || 'compress'}"
Профіль енергії: "${energyProfile || 'morning'}".

Проаналізуй вказівку та онови список завдань:
1. Якщо користувач каже "прибери повністю", "не вийде взагалі", "видали", "скасуй", "прибери [назва]" — ОБОВ'ЯЗКОВО познач isDeleted: true для відповідного завдання.
2. Якщо попросив перенести справу (наприклад "перенеси уроки на завтра" або "на 2 дні"), вкажи moveToDaysAhead (наприклад 1 для завтра, 2 для післязавтра).
3. Для справ, що залишаються на сьогодні, перерахуй тривалість (compressedDuration) та створи послідовний timeSlot ("HH:MM - HH:MM") починаючи з ${currentTimeStr}.

Завдання: ${JSON.stringify(
      activeTasks.map((t) => ({ id: t.id, title: t.title, duration: t.duration, priority: t.priority }))
    )}.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [
              {
                text: `Ти — персональний асистент-планувальник. Виконуй команди видалення ("прибери повністю", "видали"), перенесення та стиснення. Повертай відповідь строго в JSON.`,
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
                      newTimeSlot: { type: 'STRING' },
                      isDeleted: { type: 'BOOLEAN' },
                      moveToDaysAhead: { type: 'INTEGER' },
                    },
                    required: ['id', 'compressedDuration'],
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
      return NextResponse.json({ error: 'Помилка зв\'язку з AI. Спробуйте ще раз.' }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!parsedText) {
      return NextResponse.json({ error: 'Порожня відповідь AI' }, { status: 500 })
    }

    const { rescheduledTasks } = JSON.parse(parsedText)

    let updatedCount = 0

    for (const item of rescheduledTasks) {
      if (item.isDeleted) {
        await prisma.task.delete({ where: { id: item.id } })
      } else if (item.moveToDaysAhead && item.moveToDaysAhead > 0) {
        const targetDate = new Date()
        targetDate.setDate(targetDate.getDate() + item.moveToDaysAhead)
        await prisma.task.update({
          where: { id: item.id },
          data: {
            dueDate: targetDate,
            isCarriedOver: true,
          },
        })
      } else {
        await prisma.task.update({
          where: { id: item.id },
          data: {
            duration: item.compressedDuration || 15,
            timeSlot: item.newTimeSlot || null,
          },
        })
      }
      updatedCount++
    }

    return NextResponse.json({
      success: true,
      message: `Успішно оновлено ${updatedCount} завдань!`,
    })
  } catch (error) {
    console.error('Reschedule API error:', error)
    return NextResponse.json({ error: 'Помилка перепланування' }, { status: 500 })
  }
}
