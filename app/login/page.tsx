'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const API_BASE = 'https://diretta-radio-api.francesco-statello88.workers.dev'

type User = {
  id: string
  username: string
  role: 'admin' | 'operatore'
  sezioni: number[]
}

export default function LoginPage() {
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [logoError, setLogoError] = useState(false)

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Inserisci username e password')
      return
    }

    try {
      setLoading(true)
      setError('')

      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.ok || !data?.user || !data?.token) {
        setError(data?.error || 'Credenziali non valide')
        return
      }

      const sessionUser: User = {
        id: data.user.id,
        username: data.user.username,
        role: data.user.role,
        sezioni: Array.isArray(data.user.sezioni) ? data.user.sezioni : [],
      }

      localStorage.setItem('session', JSON.stringify(sessionUser))
      localStorage.setItem('auth_token', data.token)

      if (sessionUser.role === 'admin') {
        router.replace('/dashboard')
      } else {
        router.replace('/seggi')
      }
    } catch {
      setError('Errore durante il login')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleLogin()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            {!logoError ? (
              <img
                src="/logo-radiostudiodue.png"
                alt="Logo Radio StudioDue"
                className="h-20 w-20 rounded-2xl object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-600 text-2xl font-bold text-white shadow-lg">
                RS2
              </div>
            )}
          </div>

          <h1 className="text-3xl font-extrabold text-slate-900">
            Accesso sistema scrutinio
          </h1>

          <div className="mt-3 text-lg font-bold text-slate-800">
            Radio StudioDue
          </div>

          <div className="mt-2 text-sm leading-relaxed text-slate-500">
            Elezioni Amministrative
            <br />
            Centuripe 2026
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700">
              Username
            </label>
            <input
              type="text"
              placeholder="Inserisci username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none transition focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-700">
              Password
            </label>
            <input
              type="password"
              placeholder="Inserisci password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none transition focus:border-blue-500"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className={`w-full rounded-2xl py-3 text-base font-bold text-white transition ${
              loading
                ? 'cursor-not-allowed bg-slate-400'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </div>
      </div>
    </div>
  )
}