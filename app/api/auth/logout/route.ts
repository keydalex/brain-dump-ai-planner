import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ message: 'Успішний вихід із системи' })
  
  // Видаляємо кукі auth_token
  response.cookies.set({
    name: 'auth_token',
    value: '',
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  })

  return response
}
