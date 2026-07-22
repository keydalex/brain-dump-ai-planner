import { cookies } from 'next/headers'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-brain-dump-planner-key-2026'

/**
 * Хешує пароль за допомогою алгоритму PBKDF2 з SHA-512 та сіллю (Salt).
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

/**
 * Перевіряє введений пароль проти збереженого хешу з урахуванням timing-attack захисту.
 */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(checkHash, 'hex'))
  } catch {
    return false
  }
}

/**
 * Генерує підписаний JWT-токен із терміном дії 7 днів.
 */
export function generateToken(payload: { userId: string; email: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 днів
    })
  ).toString('base64url')

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url')

  return `${header}.${body}.${signature}`
}

/**
 * Валідує підпис та термін дії JWT-токена.
 */
export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const [header, body, signature] = token.split('.')
    if (!header || !body || !signature) return null

    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url')

    if (signature !== expectedSig) return null

    const decodedBody = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'))
    if (decodedBody.exp && decodedBody.exp < Math.floor(Date.now() / 1000)) return null

    return { userId: decodedBody.userId, email: decodedBody.email }
  } catch {
    return null
  }
}

/**
 * Отримує стежену сесію поточного користувача з HTTP-only кукі auth_token.
 */
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    if (!token) return null

    const verified = verifyToken(token)
    if (!verified) return null

    const user = await prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, email: true, isPremium: true, notionToken: true, notionDatabaseId: true, createdAt: true },
    })
    return user
  } catch (err) {
    console.error('Error fetching current user:', err)
    return null
  }
}
