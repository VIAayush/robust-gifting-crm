/** Database wording (constraint names, columns, policies) is never shown to staff; these messages are. */
export function friendlyVendorError(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'A vendor with these details already exists.'
  if (error.code === '23503') return 'This vendor is still referenced by other records.'
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) return 'You do not have permission to do this.'
  return 'Could not save the vendor. Please check the details and try again.'
}
