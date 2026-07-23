import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatLocalDate, getKyivTimeStr } from '@/lib/date'

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

    const currentTimeStr = getKyivTimeStr()
    const todayStr = formatLocalDate()

    const prompt = `Поточний час у Києві: ${currentTimeStr}, дата: ${todayStr}.
Профіль енергії користувача: "${energyProfile || 'morning'}".
Вказівка форс-мажору користувача: "${situation || 'перепланувати всі справи'}"

Наявні активні завдання користувача:
${JSON.stringify(activeTasks.map((t) => ({ id: t.id, title: t.title, duration: t.duration, priority: t.priority, timeSlot: t.timeSlot, dueDate: t.dueDate, category: t.category })))}

Ти — потужний AI-диспечер розкладу. Виконай вимоги користувача у гнучкому режимі:
1. Зміна пріоритетів: Якщо кажуть "це найважливіше", "оце дуже треба" — встановлюй newPriority: 1 або 2.
2. Стиснення часу й усунення прогалин: Якщо треба скоротити тривалість справи або видалити кілька справ, перераховуй newTimeSlot для наступних справ послідовно без порожніх прогалин у часі, починаючи від поточного київського часу ${currentTimeStr}.
3. Підзадачі: Якщо просять додати кроки/підзадачі до наявної справи — вказуй їх у newSubtasksToAdd. Якщо створюєш нові справи — заповнюй subtasks.
4. Масове видалення та зсув на зараз: Можеш видаляти кілька справ (action: "delete") та зсувати решту активних справ на поточний час.
5. Трансформація у відпочинок: Якщо сказано "зроби з залу/роботи відпочинок" — змінюй newTitle = "Відпочинок / Перерва", newCategory = "personal".
6. Стиснення вечора на 30% та перенесення P3/P4 на завтра: Скорочуй вечірні справи на 30% (newDuration = duration * 0.7), а справи пріоритету P3/P4 перенось на завтра (newDueDate = "${todayStr}" + 1 день) відповідно до профілю продуктивності (${energyProfile || 'morning'}).`

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: `Ти — AI-диспечер розкладу. Завжди повертай структуровану JSON інструкцію для оновлення завдань.`,
          },
        ],
      },
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            tasksToUpdate: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING' },
                  action: { type: 'STRING', description: 'update, delete, або replace' },
                  newTitle: { type: 'STRING' },
                  newDuration: { type: 'INTEGER' },
                  newTimeSlot: { type: 'STRING' },
                  newDueDate: { type: 'STRING', description: 'YYYY-MM-DD' },
                  newCategory: { type: 'STRING', description: 'inbox, work, personal, fitness, study' },
                  newPriority: { type: 'INTEGER', description: '1, 2, 3, або 4' },
                  newSubtasksToAdd: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Масив нових підзадач' },
                },
                required: ['id', 'action'],
              },
            },
            newTasksToCreate: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  title: { type: 'STRING' },
                  duration: { type: 'INTEGER' },
                  timeSlot: { type: 'STRING' },
                  priority: { type: 'INTEGER' },
                  category: { type: 'STRING' },
                  subtasks: { type: 'ARRAY', items: { type: 'STRING' } },
                },
                required: ['title'],
              },
            },
          },
          required: ['tasksToUpdate'],
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
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
        const { tasksToUpdate, newTasksToCreate } = JSON.parse(parsedText)

        await prisma.$transaction(async (tx) => {
          if (Array.isArray(tasksToUpdate)) {
            for (const item of tasksToUpdate) {
              if (item.action === 'delete') {
                await tx.task.delete({ where: { id: item.id } }).catch(() => {})
              } else if (item.action === 'update' || item.action === 'replace') {
                const updateData: any = {}
                if (item.newTitle) updateData.title = item.newTitle
                if (item.newDuration) updateData.duration = item.newDuration
                if (item.newPriority) updateData.priority = item.newPriority
                if (item.newTimeSlot !== undefined) updateData.timeSlot = item.newTimeSlot
                if (item.newCategory) updateData.category = item.newCategory
                if (item.newDueDate) {
                  const [y, m, d] = item.newDueDate.split('-').map(Number)
                  updateData.dueDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
                }
                if (Array.isArray(item.newSubtasksToAdd) && item.newSubtasksToAdd.length > 0) {
                  updateData.subtasks = {
                    create: item.newSubtasksToAdd.map((st: string) => ({
                      userId: user.id,
                      title: st,
                      priority: 4,
                      category: item.newCategory || 'inbox',
                      duration: 15,
                    })),
                  }
                }
                await tx.task.update({
                  where: { id: item.id },
                  data: updateData,
                }).catch(() => {})
              }
            }
          }

          if (Array.isArray(newTasksToCreate) && newTasksToCreate.length > 0) {
            const [y, m, d] = todayStr.split('-').map(Number)
            const targetDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
            for (const nt of newTasksToCreate) {
              await tx.task.create({
                data: {
                  userId: user.id,
                  title: nt.title,
                  duration: nt.duration || 30,
                  timeSlot: nt.timeSlot || null,
                  priority: nt.priority || 3,
                  category: nt.category || 'inbox',
                  dueDate: targetDate,
                  subtasks: Array.isArray(nt.subtasks) && nt.subtasks.length > 0 ? {
                    create: nt.subtasks.map((st: string) => ({
                      userId: user.id,
                      title: st,
                      priority: 4,
                      category: nt.category || 'inbox',
                      duration: 15,
                    })),
                  } : undefined,
                },
              })
            }
          }
        })
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
