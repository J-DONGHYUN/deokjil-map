'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventItem } from '@/types'
import {
  DISTRICT_LABELS,
  filterEvents,
  groupByDistrict,
  periodLabel,
  type DistrictFilter,
  type FilterState,
} from '@/lib/filters'
import {
  KAKAO_JS_KEY,
  distanceKm,
  formatDistance,
  loadKakaoMaps,
  type LoadState,
} from '@/lib/kakao'
import Chips, { type ChipOption } from './Chips'
import DateNav from './DateNav'
import EventCard from './EventCard'

interface Props {
  events: EventItem[]
  today: string
  filter: FilterState
  onFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void
  onOpen: (id: string) => void
}

/** 지도 초기 중심. 데이터가 없을 때만 쓰인다 (서울 시청) */
const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 }

/**
 * 카카오맵.
 *
 * 키가 없거나 도메인이 등록되지 않으면 리스트로 폴백한다.
 * 배포 URL이 나와야 도메인 등록이 되는 순서라, 키 없는 상태가 정상 경로다.
 */
export default function MapView({ events, today, filter, onFilter, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<LoadState>(KAKAO_JS_KEY ? 'loading' : 'no-key')
  const [selected, setSelected] = useState<string | null>(null)
  // 지금 화면이 대략 몇 km를 담고 있는지. 확대·축소할 때마다 갱신된다
  const [radiusKm, setRadiusKm] = useState<number | null>(null)

  // 지역 칩의 건수는 지역 선택과 무관하게 유지한다 — 지금 보는 곳 말고
  // 어디에 몇 개 더 있는지가 다음 목적지를 고르는 정보다
  const dayEvents = useMemo(
    () => filterEvents(events, { ...filter, district: 'all', query: '' }, today),
    [events, filter, today],
  )

  const districtOptions = useMemo<ChipOption<DistrictFilter>[]>(
    () => [
      { value: 'all', label: `전 지역 ${dayEvents.length}` },
      ...groupByDistrict(dayEvents).map((g) => ({
        value: g.district as DistrictFilter,
        label: `${DISTRICT_LABELS[g.district]} ${g.events.length}`,
      })),
    ],
    [dayEvents],
  )

  const pins = useMemo(
    () =>
      dayEvents
        .filter((e) => filter.district === 'all' || e.place.district === filter.district)
        .filter((e) => Number.isFinite(e.place.lat) && Number.isFinite(e.place.lng))
        // 남쪽(위도가 낮은) 핀이 위에 오도록. 라벨이 아래로 겹칠 때 앞쪽이 읽힌다
        .sort((a, b) => b.place.lat - a.place.lat),
    [dayEvents, filter.district],
  )

  useEffect(() => {
    if (!KAKAO_JS_KEY) return
    let cancelled = false

    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return

        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
          level: 7,
        })

        const bounds = new kakao.maps.LatLngBounds()

        // 기본 마커는 전부 똑같이 생겨서 눌러보기 전엔 무슨 행사인지 알 수 없다.
        // 대상명과 유형을 얹은 라벨 핀을 직접 그린다
        for (const [i, ev] of pins.entries()) {
          const pos = new kakao.maps.LatLng(ev.place.lat, ev.place.lng)

          const el = document.createElement('button')
          el.type = 'button'
          el.className = `pin pin--${ev.kind}`
          el.innerHTML =
            `<span class="pin__kind">${ev.kind === 'birthday_cafe' ? '생카' : '팝업'}</span>` +
            `<span class="pin__name"></span>` +
            `<span class="pin__tail"></span>`
          // 대상명은 사용자 데이터라 textContent 로 넣는다
          el.querySelector('.pin__name')!.textContent = ev.subject
          el.onclick = () => setSelected(ev.id)

          new kakao.maps.CustomOverlay({
            position: pos,
            content: el,
            map,
            yAnchor: 1,
            // 위쪽 핀이 아래쪽 핀 라벨을 가리지 않도록 위도 순으로 겹침 순서를 준다
            zIndex: 100 + i,
            clickable: true,
          })

          bounds.extend(pos)
        }

        // 화면이 담고 있는 범위를 계산해 사용자에게 알려준다.
        // "핀 11곳"만 보여주면 그게 동네 하나인지 서울 전체인지 알 수 없다
        const syncRadius = () => {
          const b = map.getBounds()
          const sw = b.getSouthWest()
          const ne = b.getNorthEast()
          const c = map.getCenter()
          // 가로 반경 — 중심에서 동쪽 끝까지
          const half = distanceKm(
            { lat: c.getLat(), lng: c.getLng() },
            { lat: c.getLat(), lng: ne.getLng() },
          )
          // 세로가 더 짧으면(세로로 긴 화면) 그쪽이 실제 체감 반경이다
          const halfV = distanceKm(
            { lat: c.getLat(), lng: c.getLng() },
            { lat: ne.getLat(), lng: c.getLng() },
          )
          void sw
          setRadiusKm(Math.min(half, halfV))
        }

        kakao.maps.event.addListener(map, 'idle', syncRadius)
        syncRadius()

        // 핀이 하나뿐이면 bounds 가 한 점이라 과하게 확대된다
        if (!bounds.isEmpty() && pins.length > 1) map.setBounds(bounds)
        else if (pins.length === 1) {
          map.setCenter(new kakao.maps.LatLng(pins[0].place.lat, pins[0].place.lng))
          map.setLevel(4)
        }

        setState('ready')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setState(err.message === 'no-key' ? 'no-key' : 'error')
      })

    return () => {
      cancelled = true
    }
  }, [pins])

  // 필터가 바뀌면 사라진 핀의 미니 카드가 남지 않도록 한다
  const selectedEvent = selected ? pins.find((e) => e.id === selected) ?? null : null

  const controls = (
    <div className="filterbar mapcontrols">
      <DateNav value={filter.date} today={today} onChange={(v) => onFilter('date', v)} />
      <Chips
        label="지역"
        options={districtOptions}
        value={filter.district}
        onChange={(v) => onFilter('district', v)}
      />
    </div>
  )

  if (state === 'no-key' || state === 'error') {
    return (
      <div className="mapfallback">
        {controls}
        <p className="placeholder">
          {state === 'no-key'
            ? '지도는 카카오 JS 키가 설정되면 표시됩니다.'
            : '지도를 불러오지 못했습니다. 카카오 콘솔에 이 도메인이 등록됐는지 확인해주세요.'}
          <br />
          아래 목록으로 확인해주세요.
        </p>
        <div className="rows">
          {pins.map((ev) => (
            <EventCard key={ev.id} event={ev} today={today} variant="row" onOpen={onOpen} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mapwrap">
      {controls}

      {/* 핀 배지·미니 카드는 지도 영역 기준으로 얹는다.
          바깥(.mapwrap) 기준으로 두면 컨트롤 바 위로 올라탄다 */}
      <div className="mapcanvaswrap">
        <div ref={containerRef} className="mapcanvas" />
        {state === 'loading' && <p className="placeholder mapwrap__loading">지도를 불러오는 중…</p>}

        <p className="mapwrap__count">
          핀 {pins.length}곳
          {radiusKm !== null && (
            <>
              <span className="mapwrap__sep">·</span>
              <span className="mapwrap__radius">반경 약 {formatDistance(radiusKm)}</span>
            </>
          )}
        </p>

        {selectedEvent && (
          <div className="mapsheet">
            <button
              type="button"
              className="mapsheet__close"
              onClick={() => setSelected(null)}
              aria-label="닫기"
            >
              ✕
            </button>
            <button
              type="button"
              className="mapsheet__body"
              onClick={() => onOpen(selectedEvent.id)}
            >
              <strong>{selectedEvent.subject}</strong>
              <span className="mapsheet__place">
                {DISTRICT_LABELS[selectedEvent.place.district]} · {selectedEvent.place.name}
              </span>
              <span className="mapsheet__period">{periodLabel(selectedEvent, today)}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
