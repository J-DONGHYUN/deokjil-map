'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import rawEvents from '@/data/events.json'
import type { EventItem } from '@/types'
import {
  defaultFilter,
  availableDistricts,
  filterEvents,
  todayKey,
  type DistrictFilter,
  type FilterState,
} from '@/lib/filters'
import BottomNav, { type Tab } from '@/components/BottomNav'
import HomeView from '@/components/HomeView'
import ListView from '@/components/ListView'
import MapView from '@/components/MapView'
import SearchOverlay from '@/components/SearchOverlay'
import EventDetail from '@/components/EventDetail'
import { closeDetailRoute, openDetailRoute, useRoute } from '@/lib/route'

const ALL_EVENTS = rawEvents as EventItem[]

export default function Page() {
  // 오늘 날짜는 클라이언트에서만 확정한다.
  // 서버 프리렌더 시점(빌드 시각)을 쓰면 배포 다음날부터 하이드레이션이 어긋난다.
  const [today, setToday] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [filter, setFilter] = useState<FilterState>(() => defaultFilter('1970-01-01'))
  const [searchOpen, setSearchOpen] = useState(false)

  const route = useRoute()
  // 앱 안에서 연 상세인지, 공유 링크로 곧장 들어온 것인지 구분한다.
  // 전자는 back으로 닫아 히스토리를 늘리지 않고, 후자는 되돌아갈 곳이 없어 해시만 지운다
  const openedInside = useRef(false)

  useEffect(() => {
    const t = todayKey()
    setToday(t)
    // 기본 날짜는 오늘이다. 오늘이 확정되는 시점이 마운트 이후라 여기서 채운다
    setFilter((f) => ({ ...f, date: t }))
  }, [])

  const districts = useMemo(() => availableDistricts(ALL_EVENTS), [])

  const setField = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
      setFilter((f) => ({ ...f, [key]: value })),
    [],
  )

  const openDetail = useCallback((id: string) => {
    openedInside.current = true
    openDetailRoute(id)
    // 계측은 5단계에서 track()으로 교체된다
    console.info('[view_detail]', id)
  }, [])

  const closeDetail = useCallback(() => {
    const inside = openedInside.current
    openedInside.current = false
    closeDetailRoute(inside)
  }, [])

  const detailEvent = useMemo(
    () => (route.name === 'detail' ? ALL_EVENTS.find((e) => e.id === route.id) ?? null : null),
    [route],
  )

  const goList = useCallback((district: DistrictFilter) => {
    setFilter((f) => ({ ...f, district }))
    setTab('list')
  }, [])

  const goMap = useCallback((district: DistrictFilter) => {
    setFilter((f) => ({ ...f, district }))
    setTab('map')
  }, [])

  return (
    <div className="app">
      <header className="header">
        <div className="header__row">
          <div className="header__text">
            <h1 className="header__title">오늘 뭐 열려?</h1>
            <p className="header__sub">서울 생카 · 팝업 · 굿즈 현황</p>
          </div>
          <button
            type="button"
            className="header__search"
            aria-label="검색"
            onClick={() => setSearchOpen(true)}
          >
            검색
          </button>
        </div>
      </header>

      <main className={`main ${tab === 'map' ? 'main--map' : ''}`}>
        {!today ? (
          <p className="placeholder">불러오는 중…</p>
        ) : tab === 'home' ? (
          <HomeView
            events={ALL_EVENTS}
            today={today}
            date={filter.date}
            kind={filter.kind}
            district={filter.district}
            onDate={(v) => setField('date', v)}
            onKind={(v) => setField('kind', v)}
            onDistrict={(v) => setField('district', v)}
            onOpen={openDetail}
            onDistrictMap={goMap}
          />
        ) : tab === 'list' ? (
          <ListView
            events={ALL_EVENTS}
            today={today}
            filter={filter}
            onFilter={setField}
            onOpen={openDetail}
          />
        ) : (
          <MapView
            events={ALL_EVENTS}
            today={today}
            filter={filter}
            onFilter={setField}
            onOpen={openDetail}
          />
        )}
      </main>

      <footer className="footer">
        <p>주최자 공지 기반 · 방문 전 원문 확인 권장</p>
        <p className="footer__notice">
          모든 정보는 출처를 표기하며 원문으로 연결됩니다.
          게시를 원치 않으시는 권리자께서는 알려주시면 즉시 내리겠습니다.
        </p>
      </footer>

      <BottomNav active={tab} onChange={setTab} />

      {detailEvent && today && (
        <EventDetail
          event={detailEvent}
          today={today}
          onClose={closeDetail}
          onOpenSource={(ev) => console.info('[open_source]', ev.id)}
        />
      )}

      {searchOpen && today && (
        <SearchOverlay
          events={ALL_EVENTS}
          today={today}
          onClose={() => setSearchOpen(false)}
          onOpen={(id) => {
            setSearchOpen(false)
            openDetail(id)
          }}
        />
      )}
    </div>
  )
}
