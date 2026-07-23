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

    const today = new Date()

    // 1. Справи на сьогодні (3 стандарні ситуації)
    await prisma.task.create({
      data: {
        userId: user.id,
        title: 'Робочий зідзвон з командою та обговорення плану',
        priority: 1,
        category: 'work',
        duration: 60,
        timeSlot: '10:00 - 11:00',
        dueDate: today,
        subtasks: {
          create: [
            { userId: user.id, title: 'Підготувати аженду', priority: 3, category: 'work', duration: 15 },
            { userId: user.id, title: 'Надіслати підсумки зустрічі', priority: 3, category: 'work', duration: 15 },
          ],
        },
      },
    })

    await prisma.task.createMany({
      data: [
        {
          userId: user.id,
          title: 'Силове тренування у залі',
          priority: 2,
          category: 'fitness',
          duration: 60,
          timeSlot: '15:00 - 16:00',
          dueDate: today,
        },
        {
          userId: user.id,
          title: 'Вечірнє читання книги та планування тижня',
          priority: 3,
          category: 'personal',
          duration: 45,
          timeSlot: '19:00 - 19:45',
          dueDate: today,
        },
      ],
    })

    // 2. Справи на 25.07.2026 (5 коротких ситуацій з підпунктами)
    const targetDate25 = new Date(Date.UTC(2026, 6, 25, 12, 0, 0, 0)) // 25 липня 2026

    await prisma.task.create({
      data: {
        userId: user.id,
        title: 'Аналіз та перевірка звітів за квартал',
        priority: 1,
        category: 'work',
        duration: 45,
        timeSlot: '09:30 - 10:15',
        dueDate: targetDate25,
        subtasks: {
          create: [
            { userId: user.id, title: 'Звірити фінансові показники', priority: 3, category: 'work', duration: 15 },
            { userId: user.id, title: 'Затвердити з керівництвом', priority: 3, category: 'work', duration: 15 },
          ],
        },
      },
    })

    await prisma.task.createMany({
      data: [
        {
          userId: user.id,
          title: 'Перегляд матеріалів курсу з Next.js та AI',
          priority: 2,
          category: 'study',
          duration: 30,
          timeSlot: '11:00 - 11:30',
          dueDate: targetDate25,
        },
        {
          userId: user.id,
          title: 'Оплата комунальних послуг та рахунків',
          priority: 2,
          category: 'personal',
          duration: 15,
          timeSlot: '13:00 - 13:15',
          dueDate: targetDate25,
        },
        {
          userId: user.id,
          title: 'Закупка продуктів у супермаркеті на вихідні',
          priority: 3,
          category: 'personal',
          duration: 25,
          timeSlot: '16:00 - 16:25',
          dueDate: targetDate25,
        },
        {
          userId: user.id,
          title: 'Вечірня прогулянка та розтяжка',
          priority: 3,
          category: 'fitness',
          duration: 30,
          timeSlot: '18:30 - 19:00',
          dueDate: targetDate25,
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
