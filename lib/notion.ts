import { prisma } from './prisma'

/**
 * Створює нову стильну та порожню базу даних у Notion під вказаною сторінкою-батьком.
 */
export async function createNotionDatabase(parentPageId: string, token?: string) {
  const notionToken = token || process.env.NOTION_API_KEY
  if (!notionToken) {
    throw new Error('Notion API Key не вказано')
  }

  const res = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [
        {
          type: 'text',
          text: { content: '🧠 Brain Dump AI Planner' },
        },
      ],
      icon: {
        type: 'emoji',
        emoji: '⚡',
      },
      properties: {
        Name: { title: {} },
        Status: {
          status: {
            options: [
              { name: 'To Do', color: 'red' },
              { name: 'In Progress', color: 'yellow' },
              { name: 'Done', color: 'green' },
            ],
          },
        },
        Priority: {
          select: {
            options: [
              { name: '🔴 P1 - High', color: 'red' },
              { name: '🟠 P2 - Medium', color: 'orange' },
              { name: '🔵 P3 - Low', color: 'blue' },
              { name: '⚪ P4 - None', color: 'gray' },
            ],
          },
        },
        Category: {
          select: {
            options: [
              { name: '📥 Inbox', color: 'purple' },
              { name: '💻 Work', color: 'blue' },
              { name: '👤 Personal', color: 'green' },
              { name: '🏋️ Fitness', color: 'pink' },
              { name: '📚 Study', color: 'yellow' },
            ],
          },
        },
        'Duration (min)': { number: { format: 'number' } },
        'Due Date': { date: {} },
        'Carried Over': { checkbox: {} },
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('Failed to create Notion database:', errText)
    throw new Error('Не вдалося створити базу даних у Notion')
  }

  const data = await res.json()
  return data.id as string
}

/**
 * Синхронізує завдання з Notion через офіційний REST API Notion.
 */
export async function syncTaskToNotion(taskId: string, userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    const token = user?.notionToken || process.env.NOTION_API_KEY
    const databaseId = user?.notionDatabaseId || process.env.NOTION_DATABASE_ID

    if (!token || !databaseId) {
      console.log('Notion token або databaseId не вказано. Синхронізація пропущена.')
      return null
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    })

    if (!task) return null

    // Визначаємо відображення пріоритету
    const prioMap: Record<number, string> = {
      1: '🔴 P1 - High',
      2: '🟠 P2 - Medium',
      3: '🔵 P3 - Low',
      4: '⚪ P4 - None',
    }

    // Визначаємо категорію
    const catMap: Record<string, string> = {
      inbox: '📥 Inbox',
      work: '💻 Work',
      personal: '👤 Personal',
      fitness: '🏋️ Fitness',
      study: '📚 Study',
    }

    const properties: any = {
      Name: {
        title: [{ text: { content: task.title } }],
      },
      Status: {
        status: { name: task.status === 'done' ? 'Done' : 'To Do' },
      },
      Priority: {
        select: { name: prioMap[task.priority] || '⚪ P4 - None' },
      },
      Category: {
        select: { name: catMap[task.category] || '📥 Inbox' },
      },
      'Duration (min)': {
        number: task.duration,
      },
      'Carried Over': {
        checkbox: task.isCarriedOver,
      },
    }

    if (task.dueDate) {
      properties['Due Date'] = {
        date: { start: task.dueDate.toISOString().split('T')[0] },
      }
    }

    // Перевіряємо SyncRegistry для захисту від повторів (Most Recent Wins)
    const syncRecord = await prisma.syncRegistry.findUnique({
      where: { taskId },
    })

    let notionPageId = syncRecord?.notionId

    if (notionPageId) {
      // Оновлюємо існуючу сторінку у Notion
      await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      })
    } else {
      // Створюємо нову сторінку у Notion базі
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties,
        }),
      })

      if (res.ok) {
        const pageData = await res.json()
        notionPageId = pageData.id

        // Фіксуємо у SyncRegistry
        await prisma.syncRegistry.upsert({
          where: { taskId },
          create: {
            taskId,
            notionId: notionPageId,
            lastModifiedBy: 'app',
          },
          update: {
            notionId: notionPageId,
            lastSyncedAt: new Date(),
            lastModifiedBy: 'app',
          },
        })
      }
    }

    return notionPageId
  } catch (error) {
    console.error('Notion sync error:', error)
    return null
  }
}
