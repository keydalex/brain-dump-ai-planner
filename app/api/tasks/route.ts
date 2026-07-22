import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function resolveUser() {
  let user = await getCurrentUser()
  if (!user) {
    user = await prisma.user.findFirst()
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'demo@brain-dump.app',
          passwordHash: 'demo_guest_hash',
        },
      })
    }
  }
  return user
}

export async function GET(req: Request) {
  try {
    const user = await resolveUser()

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') || 'today'
    const dateStr = searchParams.get('date')

    let whereClause: any = { userId: user.id }

    if (view === 'inbox') {
      whereClause.category = 'inbox'
    } else if (dateStr) {
      const targetDate = new Date(dateStr)
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0))
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999))
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
        { priority: 'asc' },
        { createdAt: 'desc' },
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
    const user = await resolveUser()

    const body = await req.json()

    // Якщо це масив завдань для пакетного створення (Confirmation Flow)
    if (body.tasks && Array.isArray(body.tasks)) {
      const createdTasks = []
      for (const t of body.tasks) {
        let targetDate = new Date()
        if (t.dueDate) {
          const parsed = new Date(t.dueDate)
          if (!isNaN(parsed.getTime())) {
            targetDate = parsed
          }
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
            subtasks: t.subtasks && t.subtasks.length > 0 ? {
              create: t.subtasks.map((st: string) => ({
                userId: user.id,
                title: st,
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

    const { title, notes, priority, category, duration, dueDate, parentId } = body

    if (!title || title.trim() === '') {
      return NextResponse.json({ error: 'Назва завдання є обов\'язковою' }, { status: 400 })
    }

    const newTask = await prisma.task.create({
      data: {
        userId: user.id,
        title: title.trim(),
        notes: notes || null,
        priority: priority ? Number(priority) : 4,
        category: category || 'inbox',
        duration: duration ? Number(duration) : 30,
        dueDate: dueDate ? new Date(dueDate) : new Date(),
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
    const user = await resolveUser()

    const body = await req.json()
    const { id, status, title, priority, category, duration, dueDate, isCarriedOver } = body

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
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null
    if (isCarriedOver !== undefined) updateData.isCarriedOver = isCarriedOver

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
    const user = await resolveUser()

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
