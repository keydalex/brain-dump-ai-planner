import { prisma } from './prisma'

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

    // ПеревіряємоSyncRegistry для захисту від повторів (Most Recent Wins)
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
        body: JSON.stringify({
          properties: {
            Name: {
              title: [{ text: { content: task.title } }],
            },
            Status: {
              status: { name: task.status === 'done' ? 'Done' : 'To Do' },
            },
          },
        }),
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
          properties: {
            Name: {
              title: [{ text: { content: task.title } }],
            },
            Status: {
              status: { name: task.status === 'done' ? 'Done' : 'To Do' },
            },
          },
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
