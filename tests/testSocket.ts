import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A fresh place for a test island to listen: a unix socket, or a named pipe on Windows. */
export const testSocket = (name = 'di-test') =>
  process.platform === 'win32' ? `\\\\.\\pipe\\${name}-${process.pid}-${Math.random().toString(36).slice(2)}` : join(tmpdir(), `${name}-${process.pid}-${Math.random()}.sock`)
