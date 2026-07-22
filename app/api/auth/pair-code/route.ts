import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    // Генеруємо 5-значний унікальний код
    const pairCode = Math.floor(10000 + Math.random() * 90000).toString()

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramPairCode: pairCode },
    })

    return NextResponse.json({ pairCode })
  } catch (error) {
    console.error('Pair code error:', error)
    return NextResponse.json({ error: 'Помилка генерації коду' }, { status: 500 })
  }
}
