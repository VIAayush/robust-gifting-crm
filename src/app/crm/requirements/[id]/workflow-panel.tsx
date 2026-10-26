'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addRequirementInternalNote, decideRequirement, decideSelection } from '../actions'
import { staffCanDecideRequirement, staffCanDecideSelection, type WorkflowStage } from '@/lib/requirements/workflow'

type Result = { success: true } | { error: string }

const button = 'min-h-10 rounded-lg px-4 text-xs font-semibold disabled:opacity-60'

export function WorkflowPanel({ requirementId, stage }: { requirementId: string; stage: WorkflowStage }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [internal, setInternal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function run(task: () => Promise<Result>, success: string, after?: () => void) {
    if (pending) return
    setError(null)
    setDone(null)
    startTransition(async () => {
      try {
        const result = await task()
        if ('error' in result) setError(result.error)
        else {
          setDone(success)
          after?.()
          router.refresh()
        }
      } catch {
        setError('Something went wrong. Please check your connection and try again.')
      }
    })
  }

  const reviewing = staffCanDecideRequirement(stage)
  const reviewingSelection = staffCanDecideSelection(stage)

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 text-xs shadow-sm">
      <h3 className="border-b pb-2 text-sm font-bold text-gray-900">Approval workflow</h3>

      {reviewing || reviewingSelection ? (
        <div className="space-y-3">
          <p className="text-gray-600">
            {reviewing
              ? 'Review the client’s requirement. The note is shown to the client; it is required for reject and request-changes.'
              : 'Review the client’s product selection. The note is shown to the client; it is required when requesting changes.'}
          </p>
          <textarea
            aria-label="Note to the client"
            className="w-full rounded-lg border px-2 py-2"
            rows={3}
            maxLength={1000}
            placeholder="Note to the client"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={pending}
              className={`${button} bg-green-700 text-white hover:bg-green-800`}
              onClick={() =>
                run(
                  () => (reviewing ? decideRequirement(requirementId, 'approve', note) : decideSelection(requirementId, 'approve', note)),
                  'Approved. The client has been notified.',
                  () => setNote(''),
                )
              }
            >
              Approve
            </button>
            <button
              type="button"
              disabled={pending || !note.trim()}
              className={`${button} border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100`}
              onClick={() =>
                run(
                  () => (reviewing ? decideRequirement(requirementId, 'changes', note) : decideSelection(requirementId, 'changes', note)),
                  'Changes requested. The client has been notified.',
                  () => setNote(''),
                )
              }
            >
              Request changes
            </button>
            {reviewing ? (
              <button
                type="button"
                disabled={pending || !note.trim()}
                className={`${button} border border-red-300 bg-red-50 text-red-800 hover:bg-red-100`}
                onClick={() => run(() => decideRequirement(requirementId, 'reject', note), 'Rejected. The client has been notified.', () => setNote(''))}
              >
                Reject
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-2 border-t pt-3">
        <label className="block font-semibold text-gray-700" htmlFor="internal-note">
          Internal note (never shown to the client)
        </label>
        <textarea
          id="internal-note"
          className="w-full rounded-lg border px-2 py-2"
          rows={2}
          maxLength={1000}
          value={internal}
          onChange={(e) => setInternal(e.target.value)}
        />
        <button
          type="button"
          disabled={pending || !internal.trim()}
          className={`${button} border bg-white text-gray-700 hover:bg-gray-50`}
          onClick={() => run(() => addRequirementInternalNote(requirementId, internal), 'Internal note saved.', () => setInternal(''))}
        >
          Add internal note
        </button>
      </div>

      {error ? <p role="alert" className="text-red-700">{error}</p> : null}
      {done ? <p role="status" className="text-green-700">{done}</p> : null}
    </div>
  )
}
