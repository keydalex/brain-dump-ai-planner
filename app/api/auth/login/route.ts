import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, generateToken } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Введіть email та пароль' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Невірний email або пароль' },
        { status: 401 }
      )
    }

    const isValid = verifyPassword(password, user.passwordHash)
    if (!isValid) {
      return NextResponse.json(
        { error: 'Невірний email або пароль' },
        { status: 401 }
      )
    }

    const token = generateToken({ userId: user.id, email: user.email })

    const response = NextResponse.json({
      message: 'Успішний вхід!',
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
      maxAge: 7 * 24 * 60 * 60, // 7 днів
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Помилка під час входу' }, { status: 500 })
  }
}
