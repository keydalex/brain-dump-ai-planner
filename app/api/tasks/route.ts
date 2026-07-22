import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') || 'today'
    const dateStr = searchParams.get('date')

    let whereClause: any = { userId: user.id }

    if (view === 'inbox') {
      whereClause.category = 'inbox'
    } else if (dateStr) {
      // Фільтр за конкретною датою
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
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const body = await req.json()
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
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const body = await req.json()
    const { id, status, title, priority, category, duration, dueDate, isCarriedOver } = body

    if (!id) {
      return NextResponse.json({ error: 'ID завдання є обов\'язковим' }, { status: 400 })
    }

    // Перевіряємо, чи належить задача користувачу
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
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID завдання є обов\'язковим' }, { status: 400 })
    }

    // Перевірка прав
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
