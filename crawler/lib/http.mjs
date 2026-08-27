/**
 * 크롤러 공용 HTTP.
 *
 * 원칙 (crawler/README.md 참조)
 * - robots.txt 를 실행 전에 확인하고, 허용된 경로만 요청한다
 * - 자신을 밝히는 User-Agent 를 쓴다. 브라우저인 척하지 않는다
 * - 요청 간 간격을 두어 상대 서버에 부하를 주지 않는다
 * - 실패는 재시도하되 지수적으로 물러난다
 */
import { setTimeout as sleep } from 'node:timers/promises'

export const USER_AGENT =
  'deokjil-map-poc/0.1 (+https://github.com/Aru428/deokjil-map; research prototype)'

/** 요청 간 최소 간격(ms). 낮추지 말 것 — 예의이자 차단 회피의 반대다 */
export const POLITE_DELAY_MS = 700

let lastRequestAt = 0

async function throttle() {
  const wait = POLITE_DELAY_MS - (Date.now() - lastRequestAt)
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
}

export async function fetchText(url, { retries = 2, timeoutMs = 20_000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    await throttle()
    const ac = new AbortController()
    const timer = globalThis.setTimeout(() => ac.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml' },
        signal: ac.signal,
      })
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`)
      }
      if (!res.ok) return { ok: false, status: res.status, text: '' }
      return { ok: true, status: res.status, text: await res.text() }
    } catch (err) {
      if (attempt >= retries) return { ok: false, status: 0, text: '', error: String(err) }
      // 지수 백오프. 상대가 힘들어할 때 더 세게 두드리지 않는다
      await sleep(1500 * 2 ** attempt)
    } finally {
      globalThis.clearTimeout(timer)
    }
  }
}

/**
 * robots.txt 를 읽어 특정 경로가 허용되는지 본다.
 * 완전한 구현이 아니라 우리가 쓰는 범위(User-agent: * 와 우리 UA)만 다룬다.
 * 애매하면 막힌 것으로 본다.
 */
export async function isAllowed(origin, path) {
  const res = await fetchText(`${origin}/robots.txt`)
  if (!res.ok) return { allowed: false, reason: 'robots.txt 를 읽지 못했다' }

  const groups = []
  let current = null
  for (const raw of res.text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const [keyRaw, ...rest] = line.split(':')
    const key = keyRaw.trim().toLowerCase()
    const value = rest.join(':').trim()

    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ type: key, path: value })
    }
  }

  const ua = USER_AGENT.toLowerCase()
  const applicable =
    groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a))) ??
    groups.find((g) => g.agents.includes('*'))

  if (!applicable) return { allowed: true, reason: '해당 규칙 없음 (기본 허용)' }

  // 가장 긴 경로 규칙이 이긴다 — 표준 우선순위
  let best = null
  for (const rule of applicable.rules) {
    if (rule.path === '') continue
    if (path.startsWith(rule.path) && (!best || rule.path.length > best.path.length)) best = rule
  }
  if (!best) return { allowed: true, reason: '일치하는 규칙 없음' }
  return {
    allowed: best.type === 'allow',
    reason: `${best.type}: ${best.path}`,
  }
}
