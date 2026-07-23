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
    const isExplicitForce = extractedText.toLowerCase().startsWith('/force') || extractedText.toLowerCase().startsWith('force')
    if (isExplicitForce) {
      await sendTelegramMessage(botToken, chatId, '🚨 **Прийняв форс-мажор!** Розчищаю розклад та інтегрую термінову справу...')
      const forceText = extractedText.replace(/^\/force\s*/i, '').replace(/^force\s*/i, '').trim() || 'Терміновий форс-мажор'
      const activeTasks = await prisma.task.findMany({ where: { userId: user.id, status: 'todo' } })
      const currentTimeStr = getKyivTimeStr()

      const [y, m, d] = todayStr.split('-').map(Number)
      const targetDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))

      let newTaskTitle = forceText
      let newTaskPriority = forceText.toLowerCase().includes('p2') ? 2 : 1
      let newTaskDuration = 60
      let newTaskTimeSlot: string | null = null
      let rescheduledTasks: any[] = []

      if (process.env.GEMINI_API_KEY) {
        try {
          const apiKey = process.env.GEMINI_API_KEY
          const prompt = `Сьогодні за Києвом: ${todayStr}, поточний час: ${currentTimeStr}.
Ти — кризовий AI-диспечер. Стався форс-мажор: "${forceText}"

Активні завдання користувача на сьогодні:
${JSON.stringify(activeTasks.map((t) => ({ id: t.id, title: t.title, duration: t.duration, priority: t.priority, timeSlot: t.timeSlot })))}

Вимоги:
1. Створи нову задачу P1 на сьогодні (${todayStr}).
2. Менш важливі задачі (P3, P4) здвинь або перенеси на завтра (${todayStr} + 1 день).`

          const forceRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: 'Ти — кризовий AI-диспечер. Повертай JSON для форс-мажору.' }] },
                generationConfig: {
                  temperature: 0.2,
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: 'OBJECT',
                    properties: {
                      newTaskTitle: { type: 'STRING' },
                      newTaskPriority: { type: 'INTEGER' },
                      newTaskDuration: { type: 'INTEGER' },
                      newTaskTimeSlot: { type: 'STRING', nullable: true },
                      rescheduledTasks: {
                        type: 'ARRAY',
                        items: {
                          type: 'OBJECT',
                          properties: {
                            taskId: { type: 'STRING' },
                            newDueDate: { type: 'STRING', nullable: true },
                            newPriority: { type: 'INTEGER', nullable: true },
                            newTimeSlot: { type: 'STRING', nullable: true },
                          },
                          required: ['taskId'],
                        },
                      },
                    },
                    required: ['newTaskTitle'],
                  },
                },
              }),
            }
          )

          if (forceRes.ok) {
            const forceData = await forceRes.json()
            const pText = forceData.candidates?.[0]?.content?.parts?.[0]?.text
            if (pText) {
              const parsed = JSON.parse(pText)
              if (parsed.newTaskTitle) newTaskTitle = parsed.newTaskTitle
              if (parsed.newTaskDuration) newTaskDuration = parsed.newTaskDuration
              if (parsed.newTaskTimeSlot) newTaskTimeSlot = parsed.newTaskTimeSlot
              if (parsed.newTaskPriority === 2) newTaskPriority = 2
              if (Array.isArray(parsed.rescheduledTasks)) rescheduledTasks = parsed.rescheduledTasks
            }
          }
        } catch (e) {
          console.error('Force Majeure Gemini Error:', e)
        }
      }

      // 🛡️ ЗБЕРЕЖЕННЯ В ТРАНЗАКЦІЇ ТА ЖОРСТКІ ГАРАНТІЇ (TypeScript Post-Processing)
      await prisma.$transaction(async (tx) => {
        await tx.task.create({
          data: {
            userId: user.id,
            title: newTaskTitle.trim(),
            priority: newTaskPriority, // Hardcoded P1 / P2 guarantee
            category: 'work',
            duration: newTaskDuration,
            dueDate: targetDate, // Hardcoded Today date guarantee
            timeSlot: newTaskTimeSlot,
          },
        })

        for (const rt of rescheduledTasks) {
          const updateObj: any = {}
          if (rt.newPriority) updateObj.priority = rt.newPriority
          if (rt.newTimeSlot !== undefined) updateObj.timeSlot = rt.newTimeSlot
          if (rt.newDueDate) {
            const [ry, rm, rd] = rt.newDueDate.split('-').map(Number)
            updateObj.dueDate = new Date(Date.UTC(ry, rm - 1, rd, 12, 0, 0, 0))
          }
          await tx.task.update({ where: { id: rt.taskId }, data: updateObj }).catch(() => {})
        }
      })

      const summaryMsg = `🔥 **Форс-мажор успішно інтегровано!**\n\n📌 **Додано P${newTaskPriority} задачу:** ${newTaskTitle}\n📅 **Дата:** сьогодні (${todayStr})\n📦 **Переплановано:** ${rescheduledTasks.length} справ.`
      await sendTelegramMessage(botToken, chatId, summaryMsg)
      return NextResponse.json({ ok: true })
    }

    const isExplicitInbox = extractedText.toLowerCase().startsWith('/inbox') || extractedText.toLowerCase().startsWith('inbox')

    // Створення завдань через Gemini AI Parser
    let tasksToCreate = [{ title: extractedText.replace(/^\/inbox\s*/i, '').replace(/^inbox\s*/i, ''), priority: 3, category: isExplicitInbox ? 'inbox' : 'personal', duration: 30, dueDate: isExplicitInbox ? null : todayStr, timeSlot: null, subtasks: [] }]

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

ПРИКЛАДИ РОЗБОРУ (Few-Shot Examples):
1. <raw_data_input>терміново здати звіт до 15:00</raw_data_input> -> priority: 1, dueDate: "${todayStr}", timeSlot: "15:00 - 16:00"
2. <raw_data_input>на завтра зробити тренування</raw_data_input> -> priority: 2, dueDate: "${todayStr}", timeSlot: null
3. <raw_data_input>колись купити новий пилосос</raw_data_input> -> priority: 4, dueDate: "${todayStr}", timeSlot: null

<raw_data_input>
${cleanText}
</raw_data_input>`

    const responseSchema = isExplicitInbox ? {
      type: 'OBJECT',
      properties: {
        tasks: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING', description: 'Назва завдання українською мовою' },
              category: { type: 'STRING', description: 'Категорія: inbox, work, personal, fitness, study' },
              priority: { type: 'INTEGER', description: 'Пріоритет: 1, 2, 3, або 4' },
              duration: { type: 'INTEGER', description: 'Очікувана тривалість у хвилинах' },
              dueDate: { type: 'STRING', nullable: true, description: 'Дата YYYY-MM-DD або null' },
              timeSlot: { type: 'STRING', nullable: true, description: 'Інтервал HH:MM - HH:MM або null' },
              subtasks: {
                type: 'ARRAY',
                items: { type: 'STRING' },
              },
            },
            required: ['title', 'priority', 'duration'],
          },
        },
      },
      required: ['tasks'],
    } : {
      type: 'OBJECT',
      properties: {
        tasks: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING', description: 'Назва завдання українською мовою' },
              category: { type: 'STRING', description: 'Категорія: inbox, work, personal, fitness, study' },
              priority: { type: 'INTEGER', description: 'Пріоритет: 1, 2, 3, або 4' },
              duration: { type: 'INTEGER', description: 'Очікувана тривалість у хвилинах' },
              dueDate: { type: 'STRING', description: 'YYYY-MM-DD date string. Required.' },
              timeSlot: { type: 'STRING', nullable: true, description: 'Інтервал HH:MM - HH:MM або null' },
              subtasks: {
                type: 'ARRAY',
                items: { type: 'STRING' },
              },
            },
            required: ['title', 'priority', 'duration', 'dueDate'],
          },
        },
      },
      required: ['tasks'],
    }

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: `Ти — AI-планувальник для Telegram.

ГОЛОВНІ ПРАВИЛА РОЗБИТТЯ ТА ЧАСУ (Europe/Kyiv):
1. ОБОВ’ЯЗКОВО РОЗБИВАЙ БУДЬ-ЯКІ ТЕКСТИ ТА ГОЛОСОВІ ПОВІДОМЛЕННЯ З ДЕКІЛЬКОМА ДУМКАМИ ТА СПРАВАМИ НА ОКРЕМІ ЗАВДАННЯ!
   Наприклад "Сьогодні в 9.00 вставав і до 10.00 покушав. Потім півтори години дивився кіно." РОЗБИТИ НА 2 ОКРЕМІ ЗАВДАННЯ:
   - "Покушати" (dueDate: "${todayStr}", timeSlot: "09:00 - 10:00", duration: 60)
   - "Дивитися кіно" (dueDate: "${todayStr}", timeSlot: "10:00 - 11:30", duration: 90)

2. ОБОВ'ЯЗКОВО ВИРАХОВУЙ ТА ЗАПОВНЮЙ timeSlot (у форматі "HH:MM - HH:MM"), якщо у повідомленні згадано:
   - Точний час або інтервал ("з 9:00 до 10:00", "в 9.00 вставав і до 10.00", "о 15:00", "з 16:00 до 16:30").
   - Відносний час ("через 2 години", "через 30 хв", "півтори години після цього").

3. ПРАВИЛА РОЗРАХУНКУ ДАТИ:
   - У режимі INBOX (${isExplicitInbox ? 'АКТИВНИЙ' : 'НЕ АКТИВНИЙ'}): dueDate = null та timeSlot = null.
   - Для звичайного режиму PLANNER: якщо дата не вказана, за замовчуванням dueDate = "${todayStr}".
   - Якщо каже "завтра", дата = "${todayStr}" + 1 день.
   - Якщо згадано день тижня ("в суботу", "у вівторок"), знайди найближчу дату відносно ${currentDayOfWeek} (${todayStr}).

4. АЛГОРИТМ ПРІОРИТЕТІВ (1-4):
   - P1: Термінові дедлайни, аварії, важливі зустрічі.
   - P2: Особисті цілі, тренування, навчання, відпочинок за розкладом.
   - P3: Рутина, покупки, їжа.
   - P4: Дрібні думки, нотатки без дати.`,
          },
        ],
      },
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema,
      },
    }

    let geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    if (!geminiRes.ok) {
      console.warn('Telegram AI fallback to gemini-3.1-flash-lite...')
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
    }

    if (geminiRes.ok) {
      const geminiData = await geminiRes.json()
      const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
      if (parsedText) {
        const parsedObj = JSON.parse(parsedText)
        if (parsedObj.tasks && parsedObj.tasks.length > 0) {
          tasksToCreate = parsedObj.tasks.map((t: any) => {
            const textLower = (t.title || extractedText).toLowerCase()
            const isUrgent = textLower.includes('терміново') || textLower.includes('аварія') || textLower.includes('важливо') || textLower.includes('негайно')
            
            let priority = isUrgent ? 1 : (t.priority || 3)
            let dueDate = t.dueDate

            if (isExplicitInbox) {
              dueDate = null
            } else if (!dueDate || dueDate === 'null') {
              dueDate = todayStr // 🛡️ Жорстко ставимо сьогодні, якщо не Inbox!
            }

            return {
              ...t,
              priority,
              dueDate,
            }
          })
        }
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
          { command: 'force', description: '🚨 Кризовий форс-мажор (розчистити розклад і вставити P1)' },
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
          subtasks: Array.isArray(t.subtasks) && t.subtasks.length > 0 ? {
            create: t.subtasks.map((st: string) => ({
              title: st,
              userId: user.id,
              priority: 3,
              category: t.category || 'personal',
              duration: 15,
            })),
          } : undefined,
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
