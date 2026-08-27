'use client'

import { useMemo } from 'react'
import type { EventItem } from '@/types'
import {
  DISTRICT_LABELS,
  filterEvents,
  groupByDistrict,
  type DateFilter,
  type DistrictFilter,
  type FilterState,
  type KindFilter,
} from '@/lib/filters'
import Chips, { type ChipOption } from './Chips'
import Section from './Section'

interface Props {
  events: EventItem[]
  today: string
  date: DateFilter
  kind: KindFilter
  onDate: (v: DateFilter) => void
  onKind: (v: KindFilter) => void
  onOpen: (id: string) => void
  /** 섹션 헤더에서 그 지역 목록으로 */
  onDistrictMore: (district: DistrictFilter) => void
  /** 지역 섹션의 지도 바로가기 */
  onDistrictMap: (district: DistrictFilter) => void
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

const DATE_NOUN: Record<DateFilter, string> = {
  today: '오늘',
  weekend: '주말',
  all: '앞으로',
}

/**
 * 홈은 "어디서 오늘 뭐 하느냐"에 답한다.
 * 그래서 묶는 축이 날짜가 아니라 지역이다 — 날짜는 칩이 담당하고,
 * 섹션은 전부 지역이다. 기존 서비스와 갈리는 지점이 여기다.
 */
export default function HomeView({
  events,
  today,
  date,
  kind,
  onDate,
  onKind,
  onOpen,
  onDistrictMore,
  onDistrictMap,
}: Props) {
  const base = useMemo<EventItem[]>(
    () =>
      filterEvents(
        events,
        { district: 'all', kind, date, query: '' } satisfies FilterState,
        today,
      ),
    [events, kind, date, today],
  )

  // 차별점이 놓이는 자리. P1에서 품절 배지가 여기 붙는다
  const popupGoods = useMemo(
    () => base.filter((ev) => ev.kind === 'popup' && ev.goods.length > 0),
    [base],
  )

  const groups = useMemo(() => groupByDistrict(base), [base])

  return (
    <>
      <div className="filterbar">
        <Chips label="날짜" options={DATE_OPTIONS} value={date} onChange={onDate} />
        <Chips label="유형" options={KIND_OPTIONS} value={kind} onChange={onKind} />
      </div>

      {base.length === 0 ? (
        <p className="placeholder">
          조건에 맞는 곳이 없어요.
          <br />
          날짜나 유형을 바꿔보세요.
        </p>
      ) : (
        <>
          <Section
            title="팝업 굿즈"
            note="공식 라인업 기준"
            events={popupGoods}
            today={today}
            onOpen={onOpen}
            onMore={() => onDistrictMore('all')}
          />

          {groups.map(({ district, events: list }) => (
            <Section
              key={district}
              title={DISTRICT_LABELS[district]}
              note={`${DATE_NOUN[date]} ${list.length}곳`}
              events={list}
              today={today}
              onOpen={onOpen}
              onMore={() => onDistrictMore(district)}
              moreLabel={`전체 ${list.length}`}
              onMap={() => onDistrictMap(district)}
            />
          ))}
        </>
      )}
    </>
  )
}
