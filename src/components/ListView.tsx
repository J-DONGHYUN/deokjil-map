'use client'

import { useMemo } from 'react'
import type { District, EventItem } from '@/types'
import {
  DISTRICT_LABELS,
  filterEvents,
  type DateFilter,
  type DistrictFilter,
  type FilterState,
  type KindFilter,
} from '@/lib/filters'
import Chips, { type ChipOption } from './Chips'
import EventCard from './EventCard'

interface Props {
  events: EventItem[]
  today: string
  districts: District[]
  filter: FilterState
  onFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  onOpen: (id: string) => void
}

const DATE_OPTIONS: ChipOption<DateFilter>[] = [
  { value: 'today', label: '오늘' },
  { value: 'weekend', label: '이번 주말' },
  { value: 'all', label: '전체' },
]

const KIND_OPTIONS: ChipOption<KindFilter>[] = [
  { value: 'all', label: '전체' },
  { value: 'birthday_cafe', label: '생카' },
  { value: 'popup', label: '팝업' },
]

export default function ListView({ events, today, districts, filter, onFilter, onOpen }: Props) {
  const districtOptions = useMemo<ChipOption<DistrictFilter>[]>(
    () => [
      { value: 'all', label: '전 지역' },
      ...districts.map((d) => ({ value: d as DistrictFilter, label: DISTRICT_LABELS[d] })),
    ],
    [districts],
  )

  const visible = useMemo(
    () => filterEvents(events, filter, today),
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
          label="날짜"
          options={DATE_OPTIONS}
          value={filter.date}
          onChange={(v) => onFilter('date', v)}
        />
        <Chips
          label="지역"
          options={districtOptions}
          value={filter.district}
          onChange={(v) => onFilter('district', v)}
        />
        <Chips
          label="유형"
          options={KIND_OPTIONS}
          value={filter.kind}
          onChange={(v) => onFilter('kind', v)}
        />
      </div>

      <p className="count">{visible.length}건</p>

      {visible.length === 0 ? (
        <p className="placeholder">조건에 맞는 곳이 없어요. 필터를 바꿔보세요.</p>
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
