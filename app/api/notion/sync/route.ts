import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { syncTaskToNotion } from '@/lib/notion'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const { taskId } = await req.json()

    if (taskId) {
      const pageId = await syncTaskToNotion(taskId, user.id)
      return NextResponse.json({ success: true, notionPageId: pageId })
    }

    // Синхронізуємо всі активні завдання
    const userTasks = await prisma.task.findMany({
      where: { userId: user.id },
    })

    let syncedCount = 0
    for (const t of userTasks) {
      const pageId = await syncTaskToNotion(t.id, user.id)
      if (pageId) syncedCount++
    }

    return NextResponse.json({
      success: true,
      message: `Успішно синхронізовано ${syncedCount} завдань з Notion!`,
    })
  } catch (error) {
    console.error('Notion sync API error:', error)
    return NextResponse.json({ error: 'Помилка синхронізації з Notion' }, { status: 500 })
  }
}
