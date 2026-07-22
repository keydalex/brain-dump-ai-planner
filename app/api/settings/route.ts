import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти' }, { status: 401 })
    }

    const { sttModel } = await req.json()
    if (!sttModel) {
      return NextResponse.json({ error: 'Некоректні дані' }, { status: 400 })
    }

    await prisma.settings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        sttModel,
      },
      update: {
        sttModel,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving settings:', error)
    return NextResponse.json({ error: 'Помилка збереження налаштувань' }, { status: 500 })
  }
}
