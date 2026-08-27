'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import rawEvents from '@/data/events.json'
import type { EventItem } from '@/types'
import {
  DEFAULT_FILTER,
  availableDistricts,
  todayKey,
  type DistrictFilter,
  type FilterState,
} from '@/lib/filters'
import BottomNav, { type Tab } from '@/components/BottomNav'
import HomeView from '@/components/HomeView'
import ListView from '@/components/ListView'
import SearchOverlay from '@/components/SearchOverlay'

const ALL_EVENTS = rawEvents as EventItem[]

export default function Page() {
  // 오늘 날짜는 클라이언트에서만 확정한다.
  // 서버 프리렌더 시점(빌드 시각)을 쓰면 배포 다음날부터 하이드레이션이 어긋난다.
  const [today, setToday] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => setToday(todayKey()), [])

  const districts = useMemo(() => availableDistricts(ALL_EVENTS), [])

  const setField = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
      setFilter((f) => ({ ...f, [key]: value })),
    [],
  )

  // 상세는 4단계(해시 라우팅)에서 붙는다. 지금은 계측 자리만 잡아둔다
  const openDetail = useCallback((id: string) => {
    console.info('[view_detail]', id)
  }, [])

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

      <main className="main">
        {!today ? (
          <p className="placeholder">불러오는 중…</p>
        ) : tab === 'home' ? (
          <HomeView
            events={ALL_EVENTS}
            today={today}
            date={filter.date}
            kind={filter.kind}
            onDate={(v) => setField('date', v)}
            onKind={(v) => setField('kind', v)}
            onOpen={openDetail}
            onDistrictMore={goList}
            onDistrictMap={goMap}
          />
        ) : tab === 'list' ? (
          <ListView
            events={ALL_EVENTS}
            today={today}
            districts={districts}
            filter={filter}
            onFilter={setField}
            onOpen={openDetail}
          />
        ) : (
          <p className="placeholder">
            지도는 카카오 JS 키 도메인 등록 후 붙습니다.
            <br />
            그 전까지는 전체 목록을 이용해주세요.
          </p>
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
