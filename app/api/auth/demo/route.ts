import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateToken } from '@/lib/auth'

export async function POST() {
  try {
    const email = 'demo@brain-dump.app'

    // Створюємо або очищуємо демо-користувача
    let user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: 'demo_guest_hash',
          isPremium: true, // Вмикаємо преміум для демо щоб показати всі фічі!
        },
      })
    }

    // Видаляємо всі попередні демо-завдання
    await prisma.task.deleteMany({
      where: { userId: user.id },
    })

    // Створюємо 3 красиві інтерактивні onboarding-задачі
    const today = new Date()
    
    await prisma.task.createMany({
      data: [
        {
          userId: user.id,
          title: '🎙️ Надиктувати голосом: "Сьогодні о 18:00 тренування на півтори години"',
          priority: 1,
          category: 'fitness',
          duration: 90,
          dueDate: today,
        },
        {
          userId: user.id,
          title: '🔌 Натиснути кнопку (🔌) вгорі для синхронізації з Notion',
          priority: 2,
          category: 'work',
          duration: 10,
          dueDate: today,
        },
        {
          userId: user.id,
          title: '⚡ Протестувати Форс-Мажор (якщо не встигаєш)',
          priority: 3,
          category: 'personal',
          duration: 15,
          dueDate: today,
        },
      ],
    })

    const token = generateToken({ userId: user.id, email: user.email })

    const response = NextResponse.json({
      success: true,
      message: 'Демо-режим успішно активовано!',
      user: {
        id: user.id,
        email: user.email,
        isPremium: user.isPremium,
        createdAt: user.createdAt,
      },
    })

    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1 * 60 * 60, // 1 година сесії для демо
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Demo activation error:', error)
    return NextResponse.json({ error: 'Помилка активації демо-режиму' }, { status: 500 })
  }
}
