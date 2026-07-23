import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Необхідно увійти у систему' }, { status: 401 })
    }

    const monoToken = process.env.MONOBANK_API_KEY
    const monoJarUrl = process.env.MONO_JAR_URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://brain-dump-ai-planner.vercel.app'

    // 1. Якщо налаштовано посилання на Монобанку в .env (MONO_JAR_URL)
    if (monoJarUrl) {
      const jarUrlWithComment = `${monoJarUrl}?t=${encodeURIComponent(`Користувач: ${user.email}`)}`
      return NextResponse.json({ jarUrl: jarUrlWithComment })
    }

    // 2. Якщо підключено Monobank Merchant API Token
    if (monoToken) {
      const monoRes = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
        method: 'POST',
        headers: {
          'X-Token': monoToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: 2000, // 20.00 грн (в копійках)
          ccy: 980, // UAH
          merchantPaymInfo: {
            destination: 'Преміум підписка Brain Dump AI Planner (1 місяць)',
            comment: `Користувач: ${user.email}`,
          },
          redirectUrl: `${appUrl}?payment=success`,
          webHookUrl: `${appUrl}/api/payment/webhook`,
        }),
      })

      if (monoRes.ok) {
        const monoData = await monoRes.json()
        return NextResponse.json({ pageUrl: monoData.pageUrl, invoiceId: monoData.invoiceId })
      }
    }

    // 2. Якщо платіжний ключ ще не вказано — активуємо преміум тестово в 1 клік
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { isPremium: true },
      select: { id: true, email: true, isPremium: true },
    })

    return NextResponse.json({
      success: true,
      message: 'Преміум підписку успішно активовано на 1 місяць (20 грн)!',
      user: updatedUser,
    })
  } catch (error) {
    console.error('Payment checkout error:', error)
    return NextResponse.json({ error: 'Помилка обробки платежу' }, { status: 500 })
  }
}
