import { NotebookPen } from 'lucide-react'

export type NoteSource = { by: string; text: string; when?: string | null; internal?: boolean }
export type ProductNote = { name: string; note: string }

/**
 * The notes and instructions on a requirement (for example "we need our logo on it"), shown in one highlighted card
 * instead of only in the history list: what the client wrote, what our team wrote back, and the note on each gift.
 */
export function RequirementNotes({
  title = 'Notes and instructions',
  notes,
  productNotes,
}: {
  title?: string
  notes: NoteSource[]
  productNotes: ProductNote[]
}) {
  if (notes.length === 0 && productNotes.length === 0) return null
  return (
    <section aria-labelledby="requirement-notes-heading" className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5">
      <h2 id="requirement-notes-heading" className="flex items-center gap-2 font-serif text-lg text-amber-950">
        <NotebookPen className="h-5 w-5 text-amber-700" aria-hidden="true" />
        {title}
      </h2>
      {notes.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {notes.map((note, index) => (
            <li key={index} className="rounded-lg bg-white/80 p-3 text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                {note.by}
                {note.internal ? ' · internal, not shown to the client' : ''}
                {note.when ? <span className="ml-2 font-normal normal-case tracking-normal text-gray-500">{note.when}</span> : null}
              </p>
              <p className="mt-1 whitespace-pre-line font-medium text-gray-900">{note.text}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {productNotes.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">Notes on specific gifts</p>
          <ul className="mt-2 space-y-2">
            {productNotes.map((item, index) => (
              <li key={index} className="rounded-lg bg-white/80 p-3 text-sm">
                <span className="font-semibold text-gray-900">{item.name}</span>
                <span className="text-gray-500"> · </span>
                <span className="whitespace-pre-line text-gray-800">{item.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
