import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Monobank перевіряє активність вебхука через GET
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}

// При отриманні платежу від Monobank (Acquiring або Банка)
export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log('Monobank Payment Webhook received:', body)

    // Перевіряємо статус успішності платежу від Monobank
    const isSuccess = body.status === 'success' || body.status === 'success_holding' || (body.statementItem && body.statementItem.amount > 0)

    if (isSuccess) {
      // Пошук емейлу користувача у коментарі/референсі платежу
      const commentText = body.merchantPaymInfo?.comment || body.statementItem?.comment || body.reference || ''
      const emailMatch = commentText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)

      let user = null
      if (emailMatch) {
        user = await prisma.user.findUnique({ where: { email: emailMatch[1] } })
      }

      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isPremium: true },
        })
        console.log(`🎉 Premium activated for user: ${user.email}`)
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('Monobank Webhook Error:', error)
    return NextResponse.json({ status: 'ok' }) // Завжди повертаємо 200 OK для Monobank
  }
}
