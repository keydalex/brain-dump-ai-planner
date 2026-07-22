import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, generateToken } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { error: 'Введіть коректний email та пароль не менше 6 символів' },
        { status: 400 }
      )
    }

    // Перевірка існування користувача
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Користувач із цим email вже зареєстрований' },
        { status: 400 }
      )
    }

    // Хешування пароля та створення користувача в Supabase
    const passwordHash = hashPassword(password)
    const newUser = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        settings: {
          create: {
            reminderHours: '09:00,18:00',
            reminderDays: '1,2,3,4,5',
          },
        },
      },
      select: { id: true, email: true, isPremium: true, createdAt: true },
    })

    // Створення JWT токена
    const token = generateToken({ userId: newUser.id, email: newUser.email })

    const response = NextResponse.json({
      message: 'Успішна реєстрація!',
      user: newUser,
    })

    // Встановлюємо безпечну HttpOnly кукі
    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 днів
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json({ error: 'Помилка під час реєстрації' }, { status: 500 })
  }
}
