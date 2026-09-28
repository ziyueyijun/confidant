import { promises as fs } from 'fs'

/**
 * Reads a UTF-8 text file from disk.
 *
 * Ticket #14 scope: read-only. No write/delete/rename here yet
 * (those land in ticket #15).
 */
export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}
