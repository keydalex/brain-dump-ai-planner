import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createNotionDatabase } from '@/lib/notion'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const { parentPageId } = await req.json()
    if (!parentPageId) {
      return NextResponse.json(
        { error: 'Введіть ID батьківської сторінки Notion (parentPageId)' },
        { status: 400 }
      )
    }

    // Створюємо нову порожню преміум базу у Notion
    const databaseId = await createNotionDatabase(parentPageId, user.notionToken || undefined)

    // Зберігаємо databaseId у профілі користувача
    await prisma.user.update({
      where: { id: user.id },
      data: { notionDatabaseId: databaseId },
    })

    return NextResponse.json({
      success: true,
      message: '🎉 Порожню базу даних Notion успішно створено та прив\'язано!',
      databaseId,
    })
  } catch (error: any) {
    console.error('Create Notion DB API error:', error)
    return NextResponse.json({ error: error.message || 'Помилка створення бази даних Notion' }, { status: 500 })
  }
}
