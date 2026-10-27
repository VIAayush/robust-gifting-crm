'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { setOrderStage } from '@/app/crm/orders/actions'
import { ORDER_LIFECYCLE, ORDER_STATUS_LABELS, HEALTH_LABELS, HEALTH_STYLES, type OrderHealth } from '@/lib/order-workflow'
import { formatCurrency, formatDate } from '@/lib/utils'

export type KanbanCard = {
  id: string
  order_number: string
  status: string
  order_value: number | null
  expected_delivery_date: string | null
  health: OrderHealth
  companyName: string
  assigneeName: string
  departmentName: string
}

export function OrderKanban({
  orders,
  canDrag,
}: {
  orders: KanbanCard[]
  canDrag: boolean
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // A dropped card waits for confirmation so the move carries a comment and due date into the order history.
  const [move, setMove] = useState<{ orderId: string; status: string } | null>(null)
  const [comment, setComment] = useState('')
  const [due, setDue] = useState('')

  const onDrop = (status: string, orderId: string) => {
    if (!canDrag) return
    const card = orders.find((o) => o.id === orderId)
    if (!card || card.status === status) return
    setError(null)
    setComment('')
    setDue('')
    setMove({ orderId, status })
  }

  const confirmMove = () => {
    if (!move || pending) return
    const { orderId, status } = move
    setError(null)
    start(async () => {
      const result = await setOrderStage(orderId, status, comment, due)
      if (result?.error) setError(result.error)
      else setMove(null)
    })
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      {pending && <p className="text-[11px] text-[#4A5568]">Updating stage…</p>}
      {move ? (
        <div role="dialog" aria-label="Confirm stage change" className="space-y-2 rounded-xl border border-[#9C7A33]/40 bg-white p-3 text-xs">
          <p className="font-semibold text-gray-900">
            Move {orders.find((o) => o.id === move.orderId)?.order_number} to {ORDER_STATUS_LABELS[move.status] || move.status}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="sm:col-span-2 font-medium text-gray-700">Comment (optional)
              <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} className="mt-1 w-full rounded-md border px-2 py-1.5" />
            </label>
            <label className="font-medium text-gray-700">Stage due date (optional)
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1.5" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={confirmMove} disabled={pending} className="min-h-9 rounded-md bg-[#9C7A33] px-3 font-semibold text-white disabled:opacity-60">Confirm move</button>
            <button type="button" onClick={() => setMove(null)} disabled={pending} className="min-h-9 rounded-md border px-3 font-semibold text-gray-700">Cancel</button>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {ORDER_LIFECYCLE.map((column) => {
            const cards = orders.filter((o) => o.status === column || (column === 'procurement' && o.status === 'in_progress'))
            return (
              <div
                key={column}
                className="w-64 flex-shrink-0 bg-[#F5F7FA] rounded-2xl border border-[#E2E8F0] p-2"
                onDragOver={(e) => {
                  if (canDrag) e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/order-id')
                  if (id) onDrop(column, id)
                }}
              >
                <div className="flex items-center justify-between px-2 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A5568]">{ORDER_STATUS_LABELS[column]}</p>
                  <span className="text-[11px] text-[#9C7A33] font-semibold">{cards.length}</span>
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {cards.map((card) => (
                    <article
                      key={card.id}
                      draggable={canDrag}
                      onDragStart={(e) => e.dataTransfer.setData('text/order-id', card.id)}
                      className={`bg-white rounded-xl border border-[#E7ECF3] p-3 ${canDrag ? 'cursor-grab' : ''}`}
                    >
                      <Link href={`/crm/orders/${card.id}`} className="font-mono text-xs font-semibold text-[#9C7A33] hover:underline">
                        {card.order_number}
                      </Link>
                      <p className="text-xs text-[#64748B] mt-1">{card.companyName}</p>
                      <p className="text-xs font-medium mt-1">{formatCurrency(card.order_value)}</p>
                      <p className="text-[11px] text-[#4A5568] mt-1">{card.assigneeName} · {card.departmentName}</p>
                      <p className="text-[11px] text-[#4A5568]">Due {formatDate(card.expected_delivery_date)}</p>
                      <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${HEALTH_STYLES[card.health]}`}>
                        {HEALTH_LABELS[card.health]}
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {canDrag ? (
        <p className="text-[11px] text-[#4A5568]">Drag a card to move stage. The server records history and assignment.</p>
      ) : (
        <p className="text-[11px] text-[#4A5568]">View only. Operations and admin can move stages.</p>
      )}
    </div>
  )
}
