import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateToken } from '@/lib/auth'

export async function POST() {
  try {
    // Створюємо унікального ізольованого демо-користувача для кожного пристрою/сесії
    const uniqueDemoEmail = `demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@brain-dump.app`

    const user = await prisma.user.create({
      data: {
        email: uniqueDemoEmail,
        passwordHash: 'demo_guest_hash',
        isPremium: true, // Преміум активний для тестування всіх фіч
      },
    })

    // Створюємо унікальні інструкційні onboarding-задачі на сьогодні
    const today = new Date()

    await prisma.task.createMany({
      data: [
        {
          userId: user.id,
          title: '🎙️ Надиктувати голосом: "Сьогодні о 18:00 тренування на півтори години"',
          priority: 1,
          category: 'fitness',
          duration: 90,
          timeSlot: '18:00 - 19:30',
          dueDate: today,
        },
        {
          userId: user.id,
          title: '🔌 Натиснути (🔌) вгорі для синхронізації з Notion',
          priority: 2,
          category: 'work',
          duration: 10,
          timeSlot: '10:00 - 10:10',
          dueDate: today,
        },
        {
          userId: user.id,
          title: '⚡ Протестувати кнопку Форс-Мажор (голосом або текстом)',
          priority: 3,
          category: 'personal',
          duration: 15,
          timeSlot: '12:00 - 12:15',
          dueDate: today,
        },
      ],
    })

    const token = generateToken({ userId: user.id, email: user.email })

    const response = NextResponse.json({
      success: true,
      message: 'Персональний Демо-акаунт успішно створено!',
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
      maxAge: 7 * 24 * 60 * 60, // 7 днів приватної сесії для демо
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Demo activation error:', error)
    return NextResponse.json({ error: 'Помилка активації демо-режиму' }, { status: 500 })
  }
}
