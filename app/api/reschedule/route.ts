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

    // Отримуємо всі незавершені завдання користувача
    const activeTasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        status: 'todo',
      },
    })

    if (activeTasks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Немає активних завдань для перепланування.',
      })
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

    // Прямий логічний пошук вилучення слів (зал = силові тренування = спорт)
    const sitLower = (situation || '').toLowerCase()
    const isDeleteRequested =
      sitLower.includes('прибер') ||
      sitLower.includes('видал') ||
      sitLower.includes('скасуй') ||
      sitLower.includes('перерв') ||
      sitLower.includes('не можу') ||
      sitLower.includes('не буде')

    if (isDeleteRequested) {
      // Шукаємо співпадіння в назвах завдань
      for (const t of activeTasks) {
        const titleLower = t.title.toLowerCase()
        if (
          (sitLower.includes('зал') && (titleLower.includes('зал') || titleLower.includes('тренуван') || titleLower.includes('спорт'))) ||
          (sitLower.includes('тренуван') && (titleLower.includes('зал') || titleLower.includes('тренуван') || titleLower.includes('спорт'))) ||
          (sitLower.includes('уроці') && (titleLower.includes('урок') || titleLower.includes('навчан'))) ||
          sitLower.includes(titleLower)
        ) {
          await prisma.task.delete({ where: { id: t.id } })
        }
      }
    }

    // Залишилися активні справи для AI-перерахунку розкладу
    const remainingTasks = await prisma.task.findMany({
      where: { userId: user.id, status: 'todo' },
    })

    if (remainingTasks.length > 0) {
      const prompt = `Поточний час: ${currentTimeStr}.
Вказівка користувача: "${situation || 'перепланувати всі справи'}"

Проаналізуй вказівку та онови тривалість і часові слоти для наступних завдань:
${JSON.stringify(remainingTasks.map((t) => ({ id: t.id, title: t.title, duration: t.duration, priority: t.priority })))}

Сформуй новий послідовний timeSlot ("HH:MM - HH:MM") для кожної справи від поточного часу ${currentTimeStr}.`

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: {
          parts: [
            {
              text: `Ти — персональний асистент. Перераховуй тривалість (compressedDuration) та timeSlot для справ. Повертай відповідь у JSON.`,
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
                  },
                  required: ['id', 'compressedDuration'],
                },
              },
            },
            required: ['rescheduledTasks'],
          },
        },
      }

      let geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (!geminiRes.ok) {
        geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        )
      }

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json()
        const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
        if (parsedText) {
          const { rescheduledTasks } = JSON.parse(parsedText)
          for (const item of rescheduledTasks) {
            await prisma.task.update({
              where: { id: item.id },
              data: {
                duration: item.compressedDuration || 15,
                timeSlot: item.newTimeSlot || null,
              },
            })
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Успішно переплановано розклад!',
    })
  } catch (error) {
    console.error('Reschedule API error:', error)
    return NextResponse.json({ error: 'Помилка перепланування' }, { status: 500 })
  }
}
