type FormActionResult = (formData: FormData) => void | Promise<void>

/**
 * Lets a server action that returns `{ error }` / `{ success }` be passed to
 * `<form action>`.
 *
 * This must be a pass-through of the original server action. Wrapping it in a
 * new function inside a Server Component is treated like an event handler in
 * Next.js 16 / React 19 and crashes the page with the CRM error boundary.
 */
export function asFormAction(
  action: (formData: FormData) => Promise<unknown> | unknown,
): FormActionResult {
  return action as FormActionResult
}
