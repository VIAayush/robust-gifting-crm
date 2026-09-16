'use client'

import React, { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Bell, Menu, Search, X } from 'lucide-react'
import { BrandName } from '@/components/brand/brand-name'
import { markNotificationRead } from '@/app/crm/notifications/actions'

type Note = {
  id: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export function Topbar({
  user,
  notifications = [],
  onMenuClick,
}: {
  user?: { name?: string; email?: string }
  notifications?: Note[]
  onMenuClick?: () => void
}) {
  const email = user?.email || ''
  const unread = notifications.filter((n) => !n.read_at).length
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [, start] = useTransition()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="relative z-30 flex min-h-14 shrink-0 flex-col border-b border-[#E2E8F0] bg-[#F1F4F9]">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#C9A84C] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : null}
          <Link href="/crm/dashboard" className="truncate font-serif text-lg tracking-tight text-[#C9A84C] lg:hidden">
            <BrandName />
          </Link>
          <p className="hidden text-xs text-[#4A5568] lg:block">Corporate gifting, from enquiry to payment</p>
        </div>

        <form action="/crm/search" className="mx-4 hidden max-w-md flex-1 items-center gap-2 md:flex">
          <Search className="h-4 w-4 shrink-0 text-[#4A5568]" />
          <input
            name="q"
            placeholder="Search orders, clients, campaigns…"
            className="w-full border-b border-[#E2E8F0] bg-transparent py-1 text-xs outline-none"
          />
        </form>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#64748B] hover:bg-white md:hidden"
            aria-label="Search"
            onClick={() => {
              setSearchOpen((value) => !value)
              setOpen(false)
            }}
          >
            {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen((value) => !value)
              setSearchOpen(false)
            }}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#64748B] hover:bg-white"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-[#C9A84C] px-1 text-center text-[10px] leading-4 text-white">
                {unread}
              </span>
            ) : null}
          </button>
          <div className="hidden max-w-[12rem] truncate text-xs font-medium text-[#64748B] sm:block">{email}</div>
        </div>
      </div>

      {searchOpen ? (
        <form action="/crm/search" className="border-t border-[#E2E8F0] bg-white px-3 py-2.5 md:hidden">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-[#4A5568]" />
            <input
              autoFocus
              name="q"
              placeholder="Search orders, clients, campaigns…"
              className="w-full bg-transparent py-2 text-base outline-none placeholder:text-[#94A3B8]"
            />
          </div>
        </form>
      ) : null}

      {open ? (
        <div className="absolute right-3 top-14 z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-lg sm:right-6">
          <div className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#4A5568]">
            Notifications
          </div>
          <div className="max-h-[min(20rem,50vh)] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-xs text-gray-500">No notifications yet.</p>
            ) : null}
            {notifications.slice(0, 12).map((n) => (
              <Link
                key={n.id}
                href={n.link || '/crm/dashboard'}
                onClick={() => {
                  setOpen(false)
                  if (!n.read_at) start(() => markNotificationRead(n.id))
                }}
                className={`block border-b border-[#F1F4F9] px-3 py-3 hover:bg-[#F5F7FA] ${n.read_at ? '' : 'bg-[#F5F7FA]'}`}
              >
                <p className="text-sm font-semibold text-[#0D1B2A]">{n.title}</p>
                {n.body ? <p className="mt-0.5 line-clamp-2 text-[11px] text-[#4A5568]">{n.body}</p> : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  )
}
