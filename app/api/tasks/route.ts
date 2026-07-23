import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function resolveUser(req?: Request) {
  // Суворо читаємо тільки поточного авторизованого юзера з cookie
  const user = await getCurrentUser()
  if (!user) {
    return null
  }
  return user
}

export async function GET(req: Request) {
  try {
    const user = await resolveUser(req)
    if (!user) {
      return NextResponse.json({ tasks: [] })
    }

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') || 'today'
    const dateStr = searchParams.get('date')

    let whereClause: any = { userId: user.id, parentId: null }

    if (view === 'inbox') {
      whereClause.category = 'inbox'
    } else if (view === 'all') {
      // Для heatmap — всі задачі без фільтрації дати
      // whereClause вже містить userId
    } else if (dateStr) {
      // Використовуємо локальну дату без UTC-drift:
      // будуємо startOfDay і endOfDay як local midnight
      const [year, month, day] = dateStr.split('-').map(Number)
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)
      whereClause.dueDate = {
        gte: startOfDay,
        lte: endOfDay,
      }
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        subtasks: true,
      },
      orderBy: [
        { timeSlot: 'asc' },
        { priority: 'asc' },
        { createdAt: 'asc' },
      ],
    })

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return NextResponse.json({ error: 'Помилка завантаження завдань' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await resolveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const body = await req.json()

    if (body.tasks && Array.isArray(body.tasks)) {
      const createdTasks = []
      for (const t of body.tasks) {
        const isInbox = t.category === 'inbox' || !t.dueDate
        let targetDate: Date | null = null
        if (!isInbox && t.dueDate) {
          if (typeof t.dueDate === 'string' && t.dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [y, m, d] = t.dueDate.split('-').map(Number)
            targetDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
          } else {
            const parsed = new Date(t.dueDate)
            if (!isNaN(parsed.getTime())) targetDate = parsed
          }
        } else if (!isInbox) {
          const now = new Date()
          targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0))
        }

        const newTask = await prisma.task.create({
          data: {
            userId: user.id,
            title: t.title.trim(),
            notes: t.notes || null,
            priority: t.priority ? Number(t.priority) : 4,
            category: t.category || 'inbox',
            duration: t.duration ? Number(t.duration) : 30,
            dueDate: targetDate,
            timeSlot: isInbox ? null : (t.timeSlot || null),
            subtasks: t.subtasks && t.subtasks.length > 0 ? {
              create: t.subtasks.map((st: string) => ({
                userId: user.id,
                title: typeof st === 'string' ? st : (st as any).title || String(st),
                priority: 4,
                category: t.category || 'inbox',
                duration: 15,
                dueDate: targetDate,
              }))
            } : undefined,
          },
          include: { subtasks: true },
        })
        createdTasks.push(newTask)
      }
      return NextResponse.json({ success: true, tasks: createdTasks })
    }

    // Одиночне завдання
    const { title, notes, priority, category, duration, dueDate, parentId, timeSlot } = body

    if (!title || title.trim() === '') {
      return NextResponse.json({ error: 'Назва завдання є обов\'язковою' }, { status: 400 })
    }

    const isSingleInbox = (category === 'inbox' || !dueDate) && category === 'inbox'
    let targetDate: Date | null = null
    if (dueDate) {
      if (typeof dueDate === 'string' && dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = dueDate.split('-').map(Number)
        targetDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
      } else {
        const parsed = new Date(dueDate)
        if (!isNaN(parsed.getTime())) targetDate = parsed
      }
    } else if (!isSingleInbox) {
      const now = new Date()
      targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0))
    }

    const newTask = await prisma.task.create({
      data: {
        userId: user.id,
        title: title.trim(),
        notes: notes || null,
        priority: priority ? Number(priority) : 4,
        category: category || 'inbox',
        duration: duration ? Number(duration) : 30,
        dueDate: targetDate,
        timeSlot: isSingleInbox ? null : (timeSlot || null),
        parentId: parentId || null,
      },
      include: {
        subtasks: true,
      },
    })

    return NextResponse.json({ task: newTask })
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json({ error: 'Помилка створення завдання' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await resolveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const body = await req.json()
    const { id, status, title, priority, category, duration, dueDate, isCarriedOver, timeSlot } = body

    if (!id) {
      return NextResponse.json({ error: 'ID завдання є обов\'язковим' }, { status: 400 })
    }

    const existing = await prisma.task.findFirst({
      where: { id, userId: user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Завдання не знайдено' }, { status: 404 })
    }

    const updateData: any = {}
    if (status !== undefined) updateData.status = status
    if (title !== undefined) updateData.title = title
    if (priority !== undefined) updateData.priority = Number(priority)
    if (category !== undefined) updateData.category = category
    if (duration !== undefined) updateData.duration = Number(duration)
    if (isCarriedOver !== undefined) updateData.isCarriedOver = isCarriedOver
    if (timeSlot !== undefined) updateData.timeSlot = timeSlot
    if (dueDate !== undefined) {
      if (typeof dueDate === 'string' && dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = dueDate.split('-').map(Number)
        updateData.dueDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
      } else {
        updateData.dueDate = dueDate ? new Date(dueDate) : null
      }
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        subtasks: true,
      },
    })

    return NextResponse.json({ task: updatedTask })
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json({ error: 'Помилка оновлення завдання' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await resolveUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID завдання є обов\'язковим' }, { status: 400 })
    }

    const existing = await prisma.task.findFirst({
      where: { id, userId: user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Завдання не знайдено' }, { status: 404 })
    }

    await prisma.task.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json({ error: 'Помилка видалення завдання' }, { status: 500 })
  }
}
