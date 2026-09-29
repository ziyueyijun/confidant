import { promises as fs } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

/**
 * Ticket #24: saves an image to the library's `attachments/` folder.
 *
 * @param libraryPath - absolute path to the library root
 * @param imageBuffer - binary image data
 * @param extension - file extension including dot (e.g. '.png', '.jpg')
 * @returns the filename (not full path) of the saved image
 */
export async function saveImageToAttachments(
  libraryPath: string,
  imageBuffer: Buffer,
  extension: string
): Promise<string> {
  const attachmentsDir = join(libraryPath, 'attachments')
  await fs.mkdir(attachmentsDir, { recursive: true })

  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const shortCode = crypto.randomBytes(2).toString('hex') // 4-character hex
  const filename = `${timestamp}-${shortCode}${extension}`
  const fullPath = join(attachmentsDir, filename)

  await fs.writeFile(fullPath, imageBuffer)
  return filename
}

/**
 * Ticket #24: downloads an image from a URL (for browser drag-and-drop).
 *
 * @param url - HTTP(S) URL of the image
 * @returns buffer and extension inferred from Content-Type
 */
export async function downloadImageFromUrl(
  url: string
): Promise<{ buffer: Buffer; extension: string }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type')
  const extension = contentType?.includes('png')
    ? '.png'
    : contentType?.includes('jpeg') || contentType?.includes('jpg')
      ? '.jpg'
      : contentType?.includes('gif')
        ? '.gif'
        : contentType?.includes('webp')
          ? '.webp'
          : '.png' // default

  return { buffer, extension }
}
