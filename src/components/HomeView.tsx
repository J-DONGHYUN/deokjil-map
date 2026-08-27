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
import DateNav from './DateNav'
import Section from './Section'
import EventCard from './EventCard'

interface Props {
  events: EventItem[]
  today: string
  date: DateFilter
  kind: KindFilter
  district: DistrictFilter
  onDate: (v: DateFilter) => void
  onKind: (v: KindFilter) => void
  onDistrict: (v: DistrictFilter) => void
  onOpen: (id: string) => void
  /** 지역 섹션의 지도 바로가기 */
  onDistrictMap: (district: DistrictFilter) => void
}

const KIND_OPTIONS: ChipOption<KindFilter>[] = [
  { value: 'all', label: '전체' },
  { value: 'birthday_cafe', label: '생카' },
  { value: 'popup', label: '팝업' },
]

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
  district,
  onDate,
  onKind,
  onDistrict,
  onOpen,
  onDistrictMap,
}: Props) {
  // 지역은 섹션이 담당하므로 base 에서는 걸지 않는다.
  // 지역 칩은 아래에서 섹션을 골라내는 데만 쓴다 — 그래야 "전 지역"으로 되돌릴 때
  // 다른 지역에 뭐가 있었는지 개수까지 그대로 보인다
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

  const allGroups = useMemo(() => groupByDistrict(base), [base])
  const groups = useMemo(
    () => (district === 'all' ? allGroups : allGroups.filter((g) => g.district === district)),
    [allGroups, district],
  )

  // 데이터에 실제로 있는 지역만 칩으로 노출한다. 빈 지역을 눌러 빈 화면을 보게 하지 않는다
  const districtOptions = useMemo<ChipOption<DistrictFilter>[]>(
    () => [
      { value: 'all', label: '전 지역' },
      ...allGroups.map((g) => ({
        value: g.district as DistrictFilter,
        label: `${DISTRICT_LABELS[g.district]} ${g.events.length}`,
      })),
    ],
    [allGroups],
  )

  return (
    <>
      <div className="filterbar">
        <DateNav value={date} today={today} onChange={onDate} />
        <Chips label="지역" options={districtOptions} value={district} onChange={onDistrict} />
        <Chips label="유형" options={KIND_OPTIONS} value={kind} onChange={onKind} />
      </div>

      {base.length === 0 ? (
        <p className="placeholder">
          조건에 맞는 곳이 없어요.
          <br />
          다른 날짜를 눌러보세요.
        </p>
      ) : (
        <>
          <Section
            title="팝업 굿즈"
            note="공식 라인업 기준"
            events={popupGoods}
            today={today}
            onOpen={onOpen}
          />

          {/* 전 지역일 때는 지역마다 가로 레일로 훑고,
              한 지역을 고르면 그 지역 전체를 세로 목록으로 펼친다 */}
          {district === 'all'
            ? groups.map(({ district: d, events: list }) => (
                <Section
                  key={d}
                  title={DISTRICT_LABELS[d]}
                  note={`${list.length}곳`}
                  events={list}
                  today={today}
                  onOpen={onOpen}
                  onMore={() => onDistrict(d)}
                  moreLabel="전체 보기"
                  onMap={() => onDistrictMap(d)}
                />
              ))
            : groups.map(({ district: d, events: list }) => (
                <section key={d} className="section">
                  <div className="section__head">
                    <div className="section__headtext">
                      <h2 className="section__title">{DISTRICT_LABELS[d]}</h2>
                      <p className="section__note">{list.length}곳</p>
                    </div>
                    <div className="section__actions">
                      <button
                        type="button"
                        className="section__link"
                        onClick={() => onDistrictMap(d)}
                      >
                        지도
                      </button>
                    </div>
                  </div>
                  <div className="rows">
                    {list.map((ev) => (
                      <EventCard
                        key={ev.id}
                        event={ev}
                        today={today}
                        variant="row"
                        onOpen={onOpen}
                      />
                    ))}
                  </div>
                </section>
              ))}
        </>
      )}
    </>
  )
}
