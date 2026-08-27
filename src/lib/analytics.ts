'use client'

/**
 * 계측.
 *
 * PoC 의 산출물은 화면이 아니라 숫자다(poc-plan 1번). 여기가 사실상 제품이다.
 *
 * 도구를 셋으로 나눈 이유:
 *  - Vercel Analytics  방문 수·유입 경로. 자사 도메인에서 쏘니 애드블록에 덜 막혀
 *                      모수를 신뢰할 수 있다. 커스텀 이벤트는 쏘지 않는다 (Hobby 한도)
 *  - GA4               커스텀 이벤트·재방문. 이벤트 한도가 넉넉하다
 *  - Clarity           세션 리코딩·히트맵. 표본 300 수준에서는 "왜 이탈했나"를
 *                      숫자로 알 수 없다. 눈으로 보는 수단이 하나 필요하다
 *
 * 키가 하나도 없어도 개발이 막히지 않도록, 없으면 콘솔로만 찍는다.
 */

/**
 * 이 상수는 클라이언트 전용이다.
 * 서버 컴포넌트에서 import 하지 말 것 — 'use client' 모듈의 export 는
 * 서버에서 값이 아니라 클라이언트 참조로 치환된다.
 * 스크립트 삽입은 components/AnalyticsScripts.tsx 가 env 를 직접 읽어서 한다.
 */
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? ''
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? ''

/**
 * 계측 이벤트. poc-plan 7번의 표와 1:1로 대응한다.
 * 이 목록을 늘리기 전에 그 표를 먼저 고친다 — 재지 않을 것을 쏘면 노이즈만 는다.
 */
export type EventName =
  | 'view_home'
  | 'view_detail'
  | 'open_source'
  | 'return_visit'
  | 'report_open'
  | 'report_submit'
  | 'save_course'
  | 'filter_change'

type Params = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void
    clarity?: (command: string, ...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

export function track(name: EventName, params: Params = {}) {
  // undefined 값은 GA4 에서 그대로 노이즈가 되므로 걸러낸다
  const clean: Params = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) clean[k] = v
  }

  if (typeof window === 'undefined') return

  if (window.gtag) {
    window.gtag('event', name, clean)
  }

  // Clarity 에는 이벤트만 알린다. 세션 리코딩에서 이 지점을 찾을 수 있게 하는 용도다
  if (window.clarity) {
    window.clarity('event', name)
  }

  if (!GA4_ID && !CLARITY_ID) {
    console.info(`[track] ${name}`, clean)
  }
}

const FIRST_SEEN_KEY = 'moyeora.first_seen'
const LAST_SEEN_KEY = 'moyeora.last_seen'

/**
 * 재방문 계상.
 *
 * GA4 기본 재방문 지표를 그대로 믿지 않는다 — 쿠키 만료·시크릿창 때문에
 * 과소 계상된다. 최초 방문일을 localStorage 에 직접 심고 그 값을 함께 보낸다.
 *
 * 같은 날 여러 번 열어도 재방문으로 세지 않는다. 날짜가 바뀌었을 때만 센다.
 */
export function trackVisit(today: string) {
  if (typeof window === 'undefined') return

  let firstSeen: string | null = null
  let lastSeen: string | null = null
  try {
    firstSeen = localStorage.getItem(FIRST_SEEN_KEY)
    lastSeen = localStorage.getItem(LAST_SEEN_KEY)
  } catch {
    // 시크릿창·저장 차단. 이 방문은 신규로 계상된다
  }

  const isFirst = !firstSeen
  const daysSinceFirst = firstSeen ? diffDays(firstSeen, today) : 0

  track('view_home', {
    visitor_type: isFirst ? 'new' : 'returning',
    days_since_first: daysSinceFirst,
  })

  // 날짜가 바뀐 재방문만 별도 이벤트로 남긴다 — 지표 5(7일 재방문)의 원천이다
  if (!isFirst && lastSeen && lastSeen !== today) {
    track('return_visit', {
      days_since_first: daysSinceFirst,
      days_since_last: diffDays(lastSeen, today),
    })
  }

  try {
    if (isFirst) localStorage.setItem(FIRST_SEEN_KEY, today)
    localStorage.setItem(LAST_SEEN_KEY, today)
  } catch {
    /* 저장 실패는 무시한다 */
  }
}

function diffDays(from: string, to: string): number {
  const utc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}
