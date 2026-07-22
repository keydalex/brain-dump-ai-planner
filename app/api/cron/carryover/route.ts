import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    // Валідація секретного токена Vercel Cron
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Неавторизований виклик Cron' }, { status: 401 })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    // Знаходимо всі протерміновані невиконані завдання
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: 'todo',
        dueDate: {
          lt: todayStart,
        },
      },
    })

    let updatedCount = 0

    for (const task of overdueTasks) {
      const newTitle = task.title.includes('(перенесено)')
        ? task.title
        : `${task.title} (перенесено)`

      await prisma.task.update({
        where: { id: task.id },
        data: {
          dueDate: todayStart,
          isCarriedOver: true,
          title: newTitle,
        },
      })
      updatedCount++
    }

    return NextResponse.json({
      success: true,
      message: `Успішно перенесено ${updatedCount} протермінованих завдань за київським часом`,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Carryover cron error:', error)
    return NextResponse.json({ error: 'Помилка виконання cron перенесення' }, { status: 500 })
  }
}
