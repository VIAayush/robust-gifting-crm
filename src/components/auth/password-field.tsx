'use client'

import { useState } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'

export function PasswordField({
  name = 'password',
  value,
  onChange,
  placeholder = 'Enter your password',
  autoComplete = 'current-password',
  required = true,
  minLength,
}: {
  name?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
  minLength?: number
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
        <Lock className="h-4 w-4 text-gray-400" />
      </div>
      <input
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="block w-full pl-10 pr-10 py-2.5 bg-[#F5F7FA] border border-[#E2E8F0] rounded-xl text-xs text-[#0D1B2A] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#C9A84C] focus:border-[#C9A84C] transition-colors"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-[#0D1B2A]"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
