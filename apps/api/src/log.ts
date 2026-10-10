/** One JSON line per event, so logs stay greppable and machine readable. */
type Level = 'debug' | 'info' | 'warn' | 'error'
const quiet = process.env.LOG_LEVEL === 'silent'
const debug = process.env.LOG_LEVEL === 'debug'

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (quiet || (level === 'debug' && !debug)) return
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields }, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v instanceof Error ? v.message : v,
  )
  ;(level === 'error' || level === 'warn' ? console.error : console.log)(line)
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => write('debug', msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write('info', msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write('warn', msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write('error', msg, f),
}
