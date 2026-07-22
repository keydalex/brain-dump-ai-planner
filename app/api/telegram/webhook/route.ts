import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
      // Отримуємо шлях до файлу в Telegram
      const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
      const fileData = await fileRes.json()
      
      if (fileData.ok && fileData.result?.file_path) {
        const filePath = fileData.result.file_path
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
        
        // Завантажуємо аудіофайл
        const audioBuffer = await (await fetch(downloadUrl)).arrayBuffer()
        const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' })

        // Транскрибуємо через Whisper API якщо є ключ
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

    // 2. Отримуємо першого користувача системи (або створюємо за замовчуванням)
    let user = await prisma.user.findFirst()
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'telegram_user@brain-dump.app',
          passwordHash: 'telegram_default',
        },
      })
    }

    // 3. Відправляємо в Gemini AI Parser для витягування структури
    let parsedTitle = extractedText
    let priority = 4
    let duration = 30
    let category = 'inbox'

    if (process.env.GEMINI_API_KEY) {
      const apiKey = process.env.GEMINI_API_KEY
      const prompt = `Проаналізуй цей текст та перетвори його у структуру завдання для Inbox: "${extractedText}"`

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  title: { type: 'STRING', description: 'Суть задачі українською мовою' },
                  category: { type: 'STRING', description: 'Категорія: inbox, work, personal' },
                  priority: { type: 'INTEGER', description: 'Пріоритет від 1 до 4' },
                  duration: { type: 'INTEGER', description: 'Тривалість у хвилинах' },
                },
                required: ['title'],
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
          parsedTitle = parsedObj.title || extractedText
          priority = parsedObj.priority || 4
          duration = parsedObj.duration || 30
          category = parsedObj.category || 'inbox'
        }
      }
    }

    // 4. Створюємо задачу у Supabase Inbox
    const createdTask = await prisma.task.create({
      data: {
        userId: user.id,
        title: parsedTitle,
        priority,
        category,
        duration,
        dueDate: new Date(),
      },
    })

    // 5. Відповідаємо в Telegram
    const replyText = `✅ **Додано в Inbox!**\n\n📌 **${createdTask.title}**\n⏱️ Тривалість: ${createdTask.duration} хв | Пріоритет: P${createdTask.priority}`

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
        parse_mode: 'Markdown',
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true }) // Telegram очікує 200 OK
  }
}
