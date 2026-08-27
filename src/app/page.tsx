'use client'

import { useEffect, useMemo, useState } from 'react'
import events from '@/data/events.json'
import type { EventItem } from '@/types'
import {
  DEFAULT_FILTER,
  DISTRICT_LABELS,
  EVENT_KIND_LABELS,
  availableDistricts,
  filterEvents,
  periodLabel,
  todayKey,
  weekendRange,
  type DateFilter,
  type DistrictFilter,
  type FilterState,
} from '@/lib/filters'

const ALL_EVENTS = events as EventItem[]

const DATE_LABELS: Record<DateFilter, string> = {
  today: '오늘',
  weekend: '이번 주말',
  all: '전체',
}

export default function Home() {
  // 오늘 날짜는 클라이언트에서만 확정한다.
  // 서버 프리렌더 시점(빌드 시각)과 사용자 시각이 다르면 하이드레이션이 어긋난다.
  const [today, setToday] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)

  useEffect(() => setToday(todayKey()), [])

  const districts = useMemo(() => availableDistricts(ALL_EVENTS), [])
  const visible = useMemo(
    () => (today ? filterEvents(ALL_EVENTS, filter, today) : []),
    [filter, today],
  )

  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setFilter((f) => ({ ...f, [key]: value }))

  return (
    <div className="app">
      <header className="header">
        <h1 className="header__title">오늘 뭐 열려?</h1>
        <p className="header__sub">서울 생카 · 팝업</p>
      </header>

      <main className="main">
        {!today ? (
          <p className="placeholder">불러오는 중…</p>
        ) : (
          <>
            <div className="debug">
              2단계 검증용 화면 · 전체 {ALL_EVENTS.length}건 · 오늘 {today} · 주말{' '}
              {weekendRange(today).join(' ~ ')}
            </div>

            <div className="chips">
              {(Object.keys(DATE_LABELS) as DateFilter[]).map((d) => (
                <button
                  key={d}
                  className={`chip ${filter.date === d ? 'chip--on' : ''}`}
                  onClick={() => set('date', d)}
                >
                  {DATE_LABELS[d]}
                </button>
              ))}
            </div>

            <div className="chips">
              {(['all', ...districts] as DistrictFilter[]).map((d) => (
                <button
                  key={d}
                  className={`chip ${filter.district === d ? 'chip--on' : ''}`}
                  onClick={() => set('district', d)}
                >
                  {d === 'all' ? '전 지역' : DISTRICT_LABELS[d]}
                </button>
              ))}
            </div>

            <input
              className="search"
              value={filter.query}
              placeholder="대상 · 카페명 검색"
              onChange={(e) => set('query', e.target.value)}
            />

            <p className="count">{visible.length}건</p>

            <ul className="rawlist">
              {visible.map((ev) => (
                <li key={ev.id} className="rawitem">
                  <div className="rawitem__top">
                    <span className="tag">{EVENT_KIND_LABELS[ev.kind]}</span>
                    <strong>{ev.subject}</strong>
                    <span className="tag tag--period">{periodLabel(ev, today)}</span>
                  </div>
                  <div className="rawitem__sub">
                    {DISTRICT_LABELS[ev.place.district]} · {ev.place.name} · {ev.open_hours}
                  </div>
                  <div className="rawitem__sub">
                    {ev.starts_on} ~ {ev.ends_on}
                    {ev.goods.length > 0 && ` · 굿즈 ${ev.goods.length}품목`}
                  </div>
                </li>
              ))}
            </ul>

            {visible.length === 0 && (
              <p className="placeholder">조건에 맞는 이벤트가 없습니다.</p>
            )}
          </>
        )}
      </main>

      <footer className="footer">주최자 공지 기반 · 방문 전 원문 확인 권장</footer>
    </div>
  )
}
