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

    // 1. Справи на сьогодні (реальні побутові приклади з підпунктами)
    await prisma.task.create({
      data: {
        userId: user.id,
        title: 'В зал (1.5 години)',
        priority: 2,
        category: 'fitness',
        duration: 90,
        timeSlot: '15:00 - 16:30',
        dueDate: today,
        subtasks: {
          create: [
            { userId: user.id, title: 'Слухати музику', priority: 3, category: 'fitness', duration: 30 },
            { userId: user.id, title: 'Переглянути новини', priority: 3, category: 'fitness', duration: 15 },
          ],
        },
      },
    })

    await prisma.task.createMany({
      data: [
        {
          userId: user.id,
          title: 'Робити свій pet-проект (3 години)',
          priority: 1,
          category: 'work',
          duration: 180,
          timeSlot: '10:00 - 13:00',
          dueDate: today,
        },
        {
          userId: user.id,
          title: 'Обідати (1 година)',
          priority: 3,
          category: 'personal',
          duration: 60,
          timeSlot: '13:15 - 14:15',
          dueDate: today,
        },
        {
          userId: user.id,
          title: 'Дивитись кіно (2.5 години)',
          priority: 3,
          category: 'personal',
          duration: 150,
          timeSlot: '19:00 - 21:30',
          dueDate: today,
        },
      ],
    })

    // 2. Справи на 25.07.2026 (реальні життєві ситуації з підпунктами)
    const targetDate25 = new Date(Date.UTC(2026, 6, 25, 12, 0, 0, 0)) // 25 липня 2026

    await prisma.task.create({
      data: {
        userId: user.id,
        title: 'Поїхати в гості до дідуся (3.5 години)',
        priority: 1,
        category: 'personal',
        duration: 210,
        timeSlot: '10:00 - 13:30',
        dueDate: targetDate25,
        subtasks: {
          create: [
            { userId: user.id, title: 'Купити гостинці в магазині', priority: 3, category: 'personal', duration: 20 },
            { userId: user.id, title: 'Допомогти по господарству', priority: 3, category: 'personal', duration: 40 },
          ],
        },
      },
    })

    await prisma.task.createMany({
      data: [
        {
          userId: user.id,
          title: 'Гуляти з друзями (5 годин)',
          priority: 2,
          category: 'personal',
          duration: 300,
          timeSlot: '14:30 - 19:30',
          dueDate: targetDate25,
        },
        {
          userId: user.id,
          title: 'Читати книгу (1.5 години)',
          priority: 3,
          category: 'study',
          duration: 90,
          timeSlot: '20:00 - 21:30',
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
