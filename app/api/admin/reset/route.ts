import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const secret = body.secret || ''

    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Видаляємо завдання, налаштування та користувачів
    await prisma.task.deleteMany()
    await (prisma as any).settings?.deleteMany?.().catch(() => {})
    await prisma.user.deleteMany()

    return NextResponse.json({ success: true, message: 'Всі користувачі та дані успішно очищені!' })
  } catch (error) {
    console.error('Reset error:', error)
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
  }
}
