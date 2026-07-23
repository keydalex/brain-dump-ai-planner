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
${JSON.stringify(activeTasks.map((t) => ({ id: t.id, title: t.title, duration: t.duration, priority: t.priority, timeSlot: t.timeSlot, dueDate: t.dueDate })))}

Ти — потужний AI-диспечер розкладу. Виконай вимоги користувача у гнучкому режимі:
1. Якщо вказано вилучити/замінити/скасувати конкретну справу (наприклад "прибери зал", "зроби з зала перерву"), знайди її за подібністю назви й заповни action: "delete".
2. Якщо вказано замінити справу іншою (наприклад "замість зала постав гуляння"), заповни action: "replace" або "create_new" і створи нову справу з новими параметрами.
3. Якщо треба посунути, розтягнути, стиснути або перенести справи на пізніше — обчисли нові часові слоти timeSlot у форматі "HH:MM - HH:MM" починаючи від ${currentTimeStr} або від нового часу.
4. Якщо справ забагато на сьогодні, перенеси частину менш важливих на завтра (${todayStr} + 1 день).`

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: `Ти — AI-диспечер. Завжди повертай JSON інструкцію для оновлення завдань.`,
          },
        ],
      },
      generationConfig: {
        temperature: 0,
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

        if (Array.isArray(tasksToUpdate)) {
          for (const item of tasksToUpdate) {
            if (item.action === 'delete') {
              await prisma.task.delete({ where: { id: item.id } }).catch(() => {})
            } else if (item.action === 'update' || item.action === 'replace') {
              const updateData: any = {}
              if (item.newTitle) updateData.title = item.newTitle
              if (item.newDuration) updateData.duration = item.newDuration
              if (item.newTimeSlot !== undefined) updateData.timeSlot = item.newTimeSlot
              if (item.newCategory) updateData.category = item.newCategory
              if (item.newDueDate) {
                const [y, m, d] = item.newDueDate.split('-').map(Number)
                updateData.dueDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
              }
              await prisma.task.update({
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
            await prisma.task.create({
              data: {
                userId: user.id,
                title: nt.title,
                duration: nt.duration || 30,
                timeSlot: nt.timeSlot || null,
                priority: nt.priority || 3,
                category: nt.category || 'inbox',
                dueDate: targetDate,
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
