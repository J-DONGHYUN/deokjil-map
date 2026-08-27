'use client'

import { useMemo } from 'react'
import type { EventItem } from '@/types'
import { filterEvents, type FilterState, type KindFilter } from '@/lib/filters'
import Chips, { type ChipOption } from './Chips'
import EventCard from './EventCard'

interface Props {
  events: EventItem[]
  today: string
  filter: FilterState
  onFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  onOpen: (id: string) => void
}

const KIND_OPTIONS: ChipOption<KindFilter>[] = [
  { value: 'all', label: '전체' },
  { value: 'birthday_cafe', label: '생카' },
  { value: 'popup', label: '팝업' },
]

/**
 * 전체 목록.
 *
 * 날짜·지역은 걸지 않는다 — 그건 홈과 지도가 담당한다.
 * 여기는 "지금 잡혀 있는 일정 전부"를 한 번에 훑는 자리라,
 * 필터를 겹치면 무엇이 빠졌는지 알 수 없게 된다.
 */
export default function ListView({ events, today, filter, onFilter, onOpen }: Props) {
  const visible = useMemo(
    () => filterEvents(events, { ...filter, date: 'all', district: 'all' }, today),
    [events, filter, today],
  )

  return (
    <>
      <input
        className="search"
        type="search"
        value={filter.query}
        placeholder="대상 · 카페명 · 지역 검색"
        onChange={(e) => onFilter('query', e.target.value)}
        aria-label="검색"
      />

      <div className="filterbar">
        <Chips
          label="유형"
          options={KIND_OPTIONS}
          value={filter.kind}
          onChange={(v) => onFilter('kind', v)}
        />
      </div>

      <p className="count">진행 예정 전체 {visible.length}건</p>

      {visible.length === 0 ? (
        <p className="placeholder">조건에 맞는 곳이 없어요.</p>
      ) : (
        <div className="rows">
          {visible.map((ev) => (
            <EventCard key={ev.id} event={ev} today={today} variant="row" onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  )
}
