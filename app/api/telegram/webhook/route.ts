import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncTaskToNotion } from '@/lib/notion'
import { formatLocalDate, getKyivNow, getKyivTimeStr } from '@/lib/date'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN не налаштовано' }, { status: 500 })
    }

    const update = await req.json()
    const message = update.message || update.callback_query?.message
    const callbackData = update.callback_query?.data

    if (!message && !callbackData) {
      return NextResponse.json({ ok: true })
    }

    const chatId = message ? message.chat.id : update.callback_query.from.id
    let extractedText = message?.text || ''

    // Отримуємо користувача за telegramChatId
    let user = await prisma.user.findUnique({
      where: { telegramChatId: String(chatId) },
    })

    // Обробка коду відв'язки /logout
    if (extractedText === '/logout' || callbackData === 'action_logout') {
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { telegramChatId: null },
        })
        await sendTelegramMessage(botToken, chatId, '🔌 **Акаунт успішно відв’язано від Telegram!**\nТепер нотатки сюди більше не синхронізуватимуться.')
      } else {
        await sendTelegramMessage(botToken, chatId, '⚠️ **Твій Telegram ще не був підключений до жодного акаунта.**')
      }
      return NextResponse.json({ ok: true })
    }

    // Обробка статусу /status
    if (extractedText === '/status' || callbackData === 'action_status') {
      if (user) {
        const activeCount = await prisma.task.count({ where: { userId: user.id, status: 'todo' } })
        const reply = `📊 **Статус акаунта:**\n\n👤 Email: \`${user.email}\`\n📌 Активних задач на сьогодні: **${activeCount}**\n⚡ Преміум: **${user.isPremium ? 'Активовано ✅' : 'Ні'}**`
        await sendTelegramMessage(botToken, chatId, reply)
      } else {
        await sendTelegramMessage(botToken, chatId, '⚠️ **Акаунт не підключено.** Використай `/pair XXXXX` для зв’язку.')
      }
      return NextResponse.json({ ok: true })
    }

    // Обробка голосу (Voice message)
    if (message?.voice) {
      const fileId = message.voice.file_id
      const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
      const fileData = await fileRes.json()
      
      if (fileData.ok && fileData.result?.file_path) {
        const filePath = fileData.result.file_path
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
        const audioBuffer = await (await fetch(downloadUrl)).arrayBuffer()
        const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' })

        if (process.env.OPENAI_API_KEY) {
          const apiKey = process.env.OPENAI_API_KEY
          const formData = new FormData()
          formData.append('file', audioBlob, 'voice.ogg')
          formData.append('model', 'whisper-1')
          formData.append('language', 'uk')

          const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
          })

          if (whisperRes.ok) {
            const whisperData = await whisperRes.json()
            extractedText = whisperData.text
          }
        }
      }
    }

    // Pairing /pair XXXXX
    const pairMatch = extractedText.match(/\/pair\s+(\d{5})/) || extractedText.match(/^(\d{5})$/)
    if (pairMatch) {
      const code = pairMatch[1]
      const targetUser = await prisma.user.findFirst({
        where: { telegramPairCode: code },
      })

      if (targetUser) {
        await prisma.user.update({
          where: { id: targetUser.id },
          data: {
            telegramChatId: String(chatId),
            telegramPairCode: null,
          },
        })

        const reply = `🎉 **Успішно підключено!**\n\nТвій Telegram зв'язано з акаунтом: **${targetUser.email}**.\nНадсилай мені сюди будь-які думки чи голосові нотатки!`
        await sendTelegramMessage(botToken, chatId, reply)
        return NextResponse.json({ ok: true })
      } else {
        await sendTelegramMessage(botToken, chatId, '❌ **Невірний або застарілий код.** Згенеруй новий у Налаштуваннях сайту.')
        return NextResponse.json({ ok: true })
      }
    }

    // Команда /start або /help
    if (extractedText.startsWith('/start') || extractedText.startsWith('/help')) {
      const reply = `👋 **Привіт у Brain Dump AI Planner!**\n\nЯ твій персональний AI-планувальник.\n\n**Команди:**\n• \`/pair XXXXX\` — підключити акаунт за кодом із сайту\n• \`/status\` — перевірити активні справи\n• \`/logout\` — відв'язати Telegram від акаунта\n• \`/stt\` — налаштування розпізнавання голосу`
      
      const inlineKeyboard = {
        inline_keyboard: [
          [{ text: '📊 Статус акаунта', callback_data: 'action_status' }],
          [{ text: '🔌 Відв’язати Telegram', callback_data: 'action_logout' }],
        ],
      }
      
      await sendTelegramMessageWithKeyboard(botToken, chatId, reply, inlineKeyboard)
      return NextResponse.json({ ok: true })
    }

    if (!user) {
      await sendTelegramMessage(botToken, chatId, '⚠️ **Будь ласка, спочатку підключи акаунт за допомогою команди `/pair XXXXX`**')
      return NextResponse.json({ ok: true })
    }

    if (!extractedText || extractedText.trim() === '') {
      return NextResponse.json({ ok: true })
    }

    const todayStr = formatLocalDate()
    const isExplicitInbox = extractedText.toLowerCase().startsWith('/inbox') || extractedText.toLowerCase().startsWith('inbox')

    // Створення завдань через Gemini AI Parser
    let tasksToCreate = [{ title: extractedText.replace(/^\/inbox\s*/i, '').replace(/^inbox\s*/i, ''), priority: 4, category: isExplicitInbox ? 'inbox' : 'personal', duration: 30, dueDate: isExplicitInbox ? null : todayStr, timeSlot: null, subtasks: [] }]

    if (process.env.GEMINI_API_KEY) {
      const apiKey = process.env.GEMINI_API_KEY
      const currentTimeStr = getKyivTimeStr()
      const now = new Date()
      const weekdays = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'п’ятниця', 'субота']
      const currentDayOfWeek = weekdays[now.getDay()]
      const cleanText = extractedText.replace(/^\/inbox\s*/i, '').replace(/^inbox\s*/i, '')

      const prompt = `СИСТЕМНІ ЗМІННІ:
Сьогоднішня дата за Києвом: ${todayStr} (формат YYYY-MM-DD). 
Поточний день тижня: ${currentDayOfWeek}. 
Поточний час за Києвом: ${currentTimeStr}.
${isExplicitInbox ? 'РЕЖИМ INBOX: Замовчуванням dueDate = null та timeSlot = null!' : ''}

<raw_data_input>
${cleanText}
</raw_data_input>`

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: {
              parts: [{
                text: `Ти — AI-планувальник для Telegram.
ПРАВИЛА ДАТИ:
1. Якщо вказано день тижня ("в суботу", "за сб", "у четвер"), знайди точну найближчу дату YYYY-MM-DD відносно ${currentDayOfWeek} (${todayStr}).
2. Якщо дата не вказана, дефолт = "${todayStr}".
3. ${isExplicitInbox ? 'У режимі INBOX dueDate та timeSlot ПОВИННІ бути null!' : ''}

АЛГОРИТМ ПРІОРИТЕТІВ (1-4):
- P1: Термінові дедлайни, термінова робота, важливі зустрічі.
- P2: Особисті цілі, тренування, навчання.
- P3: Рутина, покупки, дзвінки.
- P4: Дрібні думки, нотатки.
Встановлюй 1, 2, 3 або 4 на основі контексту!`
              }],
            },
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  tasks: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        title: { type: 'STRING' },
                        category: { type: 'STRING' },
                        priority: { type: 'INTEGER' },
                        duration: { type: 'INTEGER' },
                        dueDate: { type: 'STRING', nullable: true },
                        timeSlot: { type: 'STRING', nullable: true },
                      },
                      required: ['title', 'priority', 'duration'],
                    },
                  },
                },
                required: ['tasks'],
              },
            },
          })
        }
      )

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json()
        const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
        if (parsedText) {
          const parsedObj = JSON.parse(parsedText)
          if (parsedObj.tasks && parsedObj.tasks.length > 0) tasksToCreate = parsedObj.tasks
        }
      }
    }

    // Реєструємо меню команд у Telegram через setMyCommands (автокомпліт при /)
    fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: '🚀 Авторизуватись у планері' },
          { command: 'inbox', description: '📥 Додати думку в беклог (без дати)' },
          { command: 'status', description: '📊 Стан підписки' },
          { command: 'help', description: 'ℹ️ Довідка та інструкція' },
          { command: 'logout', description: '🔌 Відключити акаунт' },
        ],
      }),
    }).catch(() => {})

    const responseLines = []
    for (const t of tasksToCreate) {
      let targetDate: Date | null = null
      
      if (isExplicitInbox) {
        // 🛡️ ЗАЛІЗНА ГАРАНТІЯ: Для /inbox дати завжди null!
        targetDate = null
        t.category = 'inbox'
        t.timeSlot = null
      } else {
        // Для звичайного режиму PLANNER: якщо дата відсутня — ставимо сьогодні!
        const dateStr = t.dueDate || todayStr
        const [y, m, d] = dateStr.split('-').map(Number)
        targetDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
      }

      const createdTask = await prisma.task.create({
        data: {
          userId: user.id,
          title: t.title,
          priority: t.priority || 4,
          category: t.category || (isExplicitInbox ? 'inbox' : 'personal'),
          duration: t.duration || 30,
          dueDate: targetDate,
          timeSlot: t.timeSlot || null,
        },
      })

      syncTaskToNotion(createdTask.id, user.id).catch((err) => console.error('Telegram Notion sync error:', err))
      
      if (isExplicitInbox) {
        responseLines.push(`📥 **${createdTask.title}** (збережено в Inbox без дат)`)
      } else {
        responseLines.push(`📅 **${createdTask.title}** ${createdTask.timeSlot ? `(\`${createdTask.timeSlot}\`)` : ''} — заплановано!`)
      }
    }

    const replyText = isExplicitInbox 
      ? `📥 **Додано ${tasksToCreate.length} ідей в Inbox!**\n\n${responseLines.join('\n')}`
      : `⚡ **Сплановано ${tasksToCreate.length} справ!**\n\n${responseLines.join('\n')}`

    await sendTelegramMessage(botToken, chatId, replyText)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}

async function sendTelegramMessageWithKeyboard(botToken: string, chatId: number, text: string, replyMarkup: any) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: replyMarkup }),
  })
}
