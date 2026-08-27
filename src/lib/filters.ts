import type { District, EventItem, EventKind } from '@/types'

/**
 * 날짜는 전부 'YYYY-MM-DD' 문자열로 다룬다.
 * 이 포맷은 사전순 비교가 곧 날짜 비교라서, Date 객체를 만들 필요가 없다.
 * 타임존 버그의 상당수가 Date 왕복에서 나오므로 왕복 자체를 없앤다.
 */
export type DateKey = string

export type DateFilter = 'today' | 'weekend' | 'all'
export type DistrictFilter = District | 'all'
export type KindFilter = EventKind | 'all'

export interface FilterState {
  district: DistrictFilter
  date: DateFilter
  kind: KindFilter
  query: string
}

export const DEFAULT_FILTER: FilterState = {
  district: 'all',
  date: 'today',
  kind: 'all',
  query: '',
}

export const DISTRICT_LABELS: Record<District, string> = {
  hongdae: '홍대',
  hapjeong: '합정',
  seongsu: '성수',
  gangnam: '강남',
  konkuk: '건대',
  etc: '그 외',
}

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  birthday_cafe: '생카',
  popup: '팝업',
}

/** 로컬 시각 기준 오늘. 사용자는 한국에 있고 필터링은 전부 브라우저에서 일어난다 */
export function todayKey(now: Date = new Date()): DateKey {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function shiftDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split('-').map(Number)
  // 정오로 고정해 DST·타임존 경계에서 날짜가 밀리는 것을 막는다
  const dt = new Date(y, m - 1, d, 12)
  dt.setDate(dt.getDate() + days)
  return todayKey(dt)
}

function dayOfWeek(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getDay() // 0=일 ... 6=토
}

/**
 * 다가오는 주말 [토, 일].
 * 오늘이 토·일이면 지금 속한 주말을 반환한다 — 주말 당일에 "이번 주말"을 눌렀는데
 * 다음 주가 나오면 안 된다.
 */
export function weekendRange(today: DateKey = todayKey()): [DateKey, DateKey] {
  const dow = dayOfWeek(today)
  if (dow === 6) return [today, shiftDays(today, 1)]
  if (dow === 0) return [shiftDays(today, -1), today]
  return [shiftDays(today, 6 - dow), shiftDays(today, 7 - dow)]
}

/** 이벤트 기간이 [from, to]와 하루라도 겹치는가 */
export function overlaps(ev: EventItem, from: DateKey, to: DateKey): boolean {
  return ev.starts_on <= to && ev.ends_on >= from
}

export function isOngoing(ev: EventItem, today: DateKey = todayKey()): boolean {
  return overlaps(ev, today, today)
}

/** from → to 사이의 일수. UTC 자정 기준으로 계산해 DST 영향을 받지 않는다 */
function diffDays(from: DateKey, to: DateKey): number {
  const utc = (k: DateKey) => {
    const [y, m, d] = k.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

/** 종료까지 남은 일수. 0이면 오늘 종료, 음수면 이미 끝난 것 */
export function daysLeft(ev: EventItem, today: DateKey = todayKey()): number {
  return diffDays(today, ev.ends_on)
}

/**
 * 카드 기간 배지. D-데이 표기를 쓴다.
 * "3일 뒤 시작"보다 "시작 D-3"이 짧고, 팬덤 쪽에서 이미 통용되는 표기다.
 * 항상 '다음에 닥칠 마감'을 가리킨다 — 시작 전이면 시작까지, 진행 중이면 종료까지.
 */
export function periodLabel(ev: EventItem, today: DateKey = todayKey()): string {
  if (ev.ends_on < today) return '종료'

  if (ev.starts_on > today) {
    return `시작 D-${diffDays(today, ev.starts_on)}`
  }

  const left = daysLeft(ev, today)
  return left === 0 ? '오늘 마감' : `마감 D-${left}`
}

/** 지역별로 묶는다. 홈이 "어디서 오늘 뭐 하냐"에 답하려면 축이 지역이어야 한다 */
export function groupByDistrict(
  events: EventItem[],
): { district: District; events: EventItem[] }[] {
  const order = Object.keys(DISTRICT_LABELS) as District[]
  return order
    .map((district) => ({ district, events: events.filter((e) => e.place.district === district) }))
    .filter((g) => g.events.length > 0)
}

/** 대상·장소명 부분 일치. 아티스트 목록은 검색·필터용으로만 존재한다 */
export function matchesQuery(ev: EventItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    ev.subject.toLowerCase().includes(q) ||
    ev.place.name.toLowerCase().includes(q) ||
    ev.place.address.toLowerCase().includes(q)
  )
}

function matchesDate(ev: EventItem, date: DateFilter, today: DateKey): boolean {
  switch (date) {
    case 'today':
      return isOngoing(ev, today)
    case 'weekend': {
      const [sat, sun] = weekendRange(today)
      return overlaps(ev, sat, sun)
    }
    case 'all':
      // 이미 끝난 이벤트는 목록에서 뺀다. 지난 정보는 없는 정보보다 나쁘다
      return ev.ends_on >= today
  }
}

/** 진행 중인 것 먼저, 그다음 시작이 빠른 순, 동률이면 종료가 임박한 순 */
export function sortEvents(events: EventItem[], today: DateKey = todayKey()): EventItem[] {
  return [...events].sort((a, b) => {
    const ao = isOngoing(a, today) ? 0 : 1
    const bo = isOngoing(b, today) ? 0 : 1
    if (ao !== bo) return ao - bo
    if (a.starts_on !== b.starts_on) return a.starts_on < b.starts_on ? -1 : 1
    if (a.ends_on !== b.ends_on) return a.ends_on < b.ends_on ? -1 : 1
    return a.id < b.id ? -1 : 1
  })
}

export function filterEvents(
  events: EventItem[],
  filter: FilterState,
  today: DateKey = todayKey(),
): EventItem[] {
  const matched = events.filter(
    (ev) =>
      (filter.district === 'all' || ev.place.district === filter.district) &&
      (filter.kind === 'all' || ev.kind === filter.kind) &&
      matchesDate(ev, filter.date, today) &&
      matchesQuery(ev, filter.query),
  )
  return sortEvents(matched, today)
}

/** 데이터에 실제로 등장하는 구역만 프리셋으로 노출한다 */
export function availableDistricts(events: EventItem[]): District[] {
  const order = Object.keys(DISTRICT_LABELS) as District[]
  const present = new Set(events.map((e) => e.place.district))
  return order.filter((d) => present.has(d))
}

/**
 * 홈 섹션용. 날짜·검색을 뺀 지역·유형만 적용한 뒤,
 * 종료된 이벤트를 제외하고 정렬한다.
 * 홈에서는 날짜 축을 칩이 아니라 섹션이 담당하므로 여기서 날짜를 걸지 않는다.
 */
export function baseForSections(
  events: EventItem[],
  filter: Pick<FilterState, 'district' | 'kind'>,
  today: DateKey = todayKey(),
): EventItem[] {
  return sortEvents(
    events.filter(
      (ev) =>
        (filter.district === 'all' || ev.place.district === filter.district) &&
        (filter.kind === 'all' || ev.kind === filter.kind) &&
        ev.ends_on >= today,
    ),
    today,
  )
}
