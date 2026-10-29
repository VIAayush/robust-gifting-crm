'use server'

/**
 * Individual (B2C) orders do not support personalisation, so artwork uploads
 * are disabled. This always refuses and never touches storage. Corporate
 * customisation goes through the client portal (customization_notes).
 */
export async function uploadCustomizationFile(formData: FormData): Promise<{ error?: string; path?: string }> {
  void formData
  return { error: 'Personalisation is not available on individual orders.' }
}
