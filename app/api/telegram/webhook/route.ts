import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncTaskToNotion } from '@/lib/notion'

export async function POST(req: Request) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN не налаштовано' }, { status: 500 })
    }

    const update = await req.json()
    const message = update.message
    if (!message) {
      return NextResponse.json({ ok: true })
    }

    const chatId = message.chat.id
    let extractedText = message.text || ''

    // 1. Обробка голосового повідомлення Telegram (Voice message)
    if (message.voice) {
      const fileId = message.voice.file_id
      const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
      const fileData = await fileRes.json()
      
      if (fileData.ok && fileData.result?.file_path) {
        const filePath = fileData.result.file_path
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
        
        const audioBuffer = await (await fetch(downloadUrl)).arrayBuffer()
        const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' })

        if (process.env.OPENAI_API_KEY) {
          const formData = new FormData()
          formData.append('file', audioBlob, 'voice.ogg')
          formData.append('model', 'whisper-1')
          formData.append('language', 'uk')

          const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: formData,
          })

          if (whisperRes.ok) {
            const whisperData = await whisperRes.json()
            extractedText = whisperData.text
          }
        }
      }
    }

    if (!extractedText || extractedText.trim() === '') {
      return NextResponse.json({ ok: true })
    }

    // 2. Логіка підключення/авторизації акаунта (Pairing)
    const pairMatch = extractedText.match(/\/pair\s+(\d{5})/) || extractedText.match(/^(\d{5})$/)
    if (pairMatch) {
      const code = pairMatch[1]
      const targetUser = await prisma.user.findFirst({
        where: { telegramPairCode: code },
      })

      if (targetUser) {
        // Підключаємо chatId до знайденого користувача
        await prisma.user.update({
          where: { id: targetUser.id },
          data: {
            telegramChatId: String(chatId),
            telegramPairCode: null, // очищуємо код після успішного парування
          },
        })

        const reply = `🎉 **Успішно підключено!**\n\nТвій Telegram тепер зв'язано з акаунтом: **${targetUser.email}**.\nНадсилай мені сюди будь-які думки чи голосові нотатки, і вони одразу з'являться на сайті та в Notion!`
        await sendTelegramMessage(botToken, chatId, reply)
        return NextResponse.json({ ok: true })
      } else {
        await sendTelegramMessage(botToken, chatId, '❌ **Невірний або застарілий код.** Будь ласка, згенеруй новий код у налаштуваннях додатка на сайті.')
        return NextResponse.json({ ok: true })
      }
    }

    // Якщо це просто старт бота без коду
    if (extractedText.startsWith('/start')) {
      const reply = `👋 **Привіт у Brain Dump AI Planner!**\n\nЩоб почати планувати голосом прямо звідси, підключи свій акаунт:\n1. Перейди в **Налаштування** (Settings) додатка на сайті.\n2. Скопіюй 5-значний код підключення.\n3. Надішли його мені у форматі:\n\`/pair XXXXX\``
      await sendTelegramMessage(botToken, chatId, reply)
      return NextResponse.json({ ok: true })
    }

    // 3. Знаходимо користувача за telegramChatId
    let user = await prisma.user.findUnique({
      where: { telegramChatId: String(chatId) },
    })

    // Fallback: якщо ніхто ще не парував бота, шукаємо першого активного користувача Notion
    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { notionToken: { not: null } },
            { email: { not: 'telegram_user@brain-dump.app' } }
          ]
        }
      })
      if (!user) {
        user = await prisma.user.findFirst()
      }
    }

    if (!user) {
      await sendTelegramMessage(botToken, chatId, '⚠️ **Будь ласка, спочатку підключи акаунт за допомогою команди `/pair XXXXX`**')
      return NextResponse.json({ ok: true })
    }

    // 4. Відправляємо в Gemini AI Parser для витягування структури кількох завдань
    let tasksToCreate = [{ title: extractedText, priority: 4, category: 'inbox', duration: 30, subtasks: [] }]

    if (process.env.GEMINI_API_KEY) {
      const apiKey = process.env.GEMINI_API_KEY
      const now = new Date()
      const todayStr = now.toISOString().split('T')[0]
      const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      const prompt = `Сьогоднішня дата: ${todayStr}. Поточний час: ${currentTimeStr}. 
Проаналізуй цей текст, розбий його на окремі плани, якщо їх там декілька, та обчисли правильний час і тривалість: "${extractedText}"`

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: {
              parts: [
                {
                  text: `Ти — AI-планувальник Todoist. Аналізуй сирі думки користувача українською мовою та розбивай їх на масив структурованих завдань. 
Враховуй такі правила розбору:
1. Якщо в тексті згадано кілька різних справ/планів, ОБОВ'ЯЗКОВО виділи їх в окремі об'єкти в масиві.
2. Розраховуй тривалість (duration) інтелектуально:
   - Якщо вказано конкретний інтервал (наприклад, "о 18:00... до 20:00" або "з 14 до 15:30"), розрахуй різницю в хвилинах (наприклад, з 18:00 до 20:00 = 120 хвилин).
   - Якщо вказано поточний час (наприклад, "зараз 18:42, треба доробити до 20:00"), розрахуй тривалість від поточного часу до дедлайну (20:00 - 18:42 = 78 хвилин).
   - Якщо тривалість не вказано явно, оціни логічно за типом справи (пробіжка = 45 хв, прибирання = 60 хв, перегляд лекції = 90 хв, зателефонувати мамі = 15 хв). Не став завжди 30 хв!
3. Витягуй пріоритет (1-4) та категорію.`,
                },
              ],
            },
            generationConfig: {
              temperature: 0,
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
                        subtasks: { type: 'ARRAY', items: { type: 'STRING' } },
                      },
                      required: ['title', 'priority', 'duration'],
                    },
                  },
                },
                required: ['tasks'],
              },
            },
          }),
        }
      )

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json()
        const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
        if (parsedText) {
          const parsedObj = JSON.parse(parsedText)
          if (parsedObj.tasks && parsedObj.tasks.length > 0) {
            tasksToCreate = parsedObj.tasks
          }
        }
      }
    }

    // 5. Створюємо задачі та запускаємо синхронізацію Notion
    const responseLines = []
    for (const t of tasksToCreate) {
      const createdTask = await prisma.task.create({
        data: {
          userId: user.id,
          title: t.title,
          priority: t.priority || 4,
          category: t.category || 'inbox',
          duration: t.duration || 30,
          dueDate: new Date(),
          subtasks: t.subtasks && t.subtasks.length > 0 ? {
            create: t.subtasks.map((st: string) => ({
              userId: user!.id,
              title: st,
              priority: 4,
              category: t.category || 'inbox',
              duration: 15,
              dueDate: new Date(),
            }))
          } : undefined,
        },
      })

      // Синхронізуємо у Notion
      syncTaskToNotion(createdTask.id, user.id).catch((err) => console.error('Telegram Notion sync error:', err))
      responseLines.push(`📌 **${createdTask.title}** (⏱️ ${createdTask.duration} хв | P${createdTask.priority})`)
    }

    // 6. Відповідаємо в Telegram
    const replyText = `✅ **Додано ${tasksToCreate.length} задач у твій Inbox!**\n\n${responseLines.join('\n')}`
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
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  })
}
