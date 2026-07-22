import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatLocalDate, getKyivNow } from '@/lib/date'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Неавторизований виклик Cron' }, { status: 401 })
    }

    const kyivNow = getKyivNow()
    const todayStr = formatLocalDate(kyivNow)
    const [y, m, d] = todayStr.split('-').map(Number)
    const todayNoonUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))

    const overdueTasks = await prisma.task.findMany({
      where: {
        status: 'todo',
        dueDate: {
          lt: new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)),
        },
      },
    })

    let updatedCount = 0

    for (const task of overdueTasks) {
      // Перевіряємо профіль продуктивності юзера
      const userSettings = await prisma.settings.findUnique({
        where: { userId: task.userId },
      }).catch(() => null)

      const energyProfile = (userSettings as any)?.energyProfile || 'morning'
      
      // Якщо у юзера профіль "Ранок" і це важлива справа (P1/P2) -> 09:00 - 10:00
      // Якщо профіль "Вечір" або менш важлива -> 18:00 - 19:00
      let smartTimeSlot = task.timeSlot
      if (task.priority <= 2) {
        smartTimeSlot = energyProfile === 'morning' ? '09:00 - 10:00' : '18:00 - 19:00'
      } else {
        smartTimeSlot = energyProfile === 'morning' ? '14:00 - 15:00' : '11:00 - 12:00'
      }

      await prisma.task.update({
        where: { id: task.id },
        data: {
          dueDate: todayNoonUTC,
          isCarriedOver: true,
          timeSlot: smartTimeSlot,
        },
      })
      updatedCount++
    }

    return NextResponse.json({
      success: true,
      message: `Гармонійно перенесено ${updatedCount} протермінованих завдань за профілем продуктивності`,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Carryover cron error:', error)
    return NextResponse.json({ error: 'Помилка виконання cron' }, { status: 500 })
  }
}
