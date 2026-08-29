'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventItem } from '@/types'
import {
  DISTRICT_LABELS,
  EVENT_KIND_LABELS,
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
  type KakaoCustomOverlay,
  type KakaoMapInstance,
  type KakaoNamespace,
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
 * 핀을 하나로 접는 최소 간격(px).
 * 라벨 핀의 최대 폭이 168px 이라 이보다 가까우면 서로를 가려 못 읽는다.
 */
const CLUSTER_GAP_PX = 84

interface Cluster {
  /** 대표 이벤트 id. 좌표가 아니라 id 를 키로 써야 재렌더에서 흔들리지 않는다 */
  key: string
  lat: number
  lng: number
  items: EventItem[]
}

/**
 * 겹치는 핀을 접는다.
 *
 * 지리적 거리(예: 100m)로 고정해 묶으면 확대해도 계속 묶여 있다.
 * 겹침은 지도가 아니라 화면의 문제라, 지금 축척에서 몇 px 떨어져 있는지로
 * 판단해야 확대하면 자연히 풀린다.
 *
 * 묶음의 좌표는 첫 항목의 좌표를 그대로 쓴다. 평균을 내면 실제로는
 * 아무것도 없는 지점을 가리키게 된다.
 */
function clusterPins(pins: EventItem[], kmPerPx: number | null): Cluster[] {
  const single = (e: EventItem): Cluster => ({
    key: e.id,
    lat: e.place.lat,
    lng: e.place.lng,
    items: [e],
  })
  if (!kmPerPx) return pins.map(single)

  const threshold = kmPerPx * CLUSTER_GAP_PX
  const out: Cluster[] = []
  for (const ev of pins) {
    const hit = out.find(
      (c) =>
        distanceKm({ lat: c.lat, lng: c.lng }, { lat: ev.place.lat, lng: ev.place.lng }) <=
        threshold,
    )
    if (hit) hit.items.push(ev)
    else out.push(single(ev))
  }
  return out
}

/** 미니 카드가 무엇을 보여주고 있는가 */
type SheetState =
  | { kind: 'event'; id: string; from?: string[] }
  | { kind: 'cluster'; ids: string[] }

/**
 * 카카오맵.
 *
 * 키가 없거나 도메인이 등록되지 않으면 리스트로 폴백한다.
 * 배포 URL이 나와야 도메인 등록이 되는 순서라, 키 없는 상태가 정상 경로다.
 */
export default function MapView({ events, today, filter, onFilter, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const kakaoRef = useRef<KakaoNamespace | null>(null)

  const [state, setState] = useState<LoadState>(KAKAO_JS_KEY ? 'loading' : 'no-key')
  const [sheet, setSheet] = useState<SheetState | null>(null)
  // 지금 화면이 대략 몇 km를 담고 있는지. 확대·축소할 때마다 갱신된다
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  // 축척. 확대 레벨이 같으면 값을 고정한다 — 지도를 움직일 때마다 묶음이
  // 다시 계산되면 핀이 깜빡인다
  const [scale, setScale] = useState<{ level: number; kmPerPx: number } | null>(null)

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

  const clusters = useMemo(() => clusterPins(pins, scale?.kmPerPx ?? null), [pins, scale])

  /** 화면이 담고 있는 범위와 축척을 읽는다 */
  const sync = useCallback(() => {
    const map = mapRef.current
    const el = containerRef.current
    if (!map || !el) return

    const ne = map.getBounds().getNorthEast()
    const c = map.getCenter()
    const center = { lat: c.getLat(), lng: c.getLng() }
    // 가로 반경 — 중심에서 동쪽 끝까지
    const half = distanceKm(center, { lat: center.lat, lng: ne.getLng() })
    // 세로가 더 짧으면(세로로 긴 화면) 그쪽이 실제 체감 반경이다
    const halfV = distanceKm(center, { lat: ne.getLat(), lng: center.lng })
    setRadiusKm(Math.min(half, halfV))

    const width = el.clientWidth
    if (width <= 0) return
    const level = map.getLevel()
    const kmPerPx = (half * 2) / width
    setScale((prev) => (prev && prev.level === level ? prev : { level, kmPerPx }))
  }, [])

  // ① 지도 생성 — 한 번만 한다.
  // 필터가 바뀔 때마다 다시 만들면 사용자가 맞춰둔 확대·위치가 초기화되고,
  // 카카오 Map 에는 destroy 가 없어 옛 지도가 컨테이너에 그대로 쌓인다
  useEffect(() => {
    if (!KAKAO_JS_KEY) return
    let cancelled = false
    const container = containerRef.current

    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return

        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
          level: 7,
        })
        kakaoRef.current = kakao
        mapRef.current = map

        kakao.maps.event.addListener(map, 'idle', sync)
        sync()
        setState('ready')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setState(err.message === 'no-key' ? 'no-key' : 'error')
      })

    return () => {
      cancelled = true
      mapRef.current = null
      kakaoRef.current = null
      if (container) container.innerHTML = ''
    }
  }, [sync])

  // ② 핀 그리기 — 묶음이 바뀔 때마다 다시 그린다
  useEffect(() => {
    const map = mapRef.current
    const kakao = kakaoRef.current
    if (!map || !kakao) return

    const overlays: KakaoCustomOverlay[] = []

    // 기본 마커는 전부 똑같이 생겨서 눌러보기 전엔 무슨 행사인지 알 수 없다.
    // 대상명과 유형을 얹은 라벨 핀을 직접 그린다
    for (const [i, c] of clusters.entries()) {
      const head = c.items[0]
      const count = c.items.length
      const kinds = new Set(c.items.map((e) => e.kind))
      // 생카와 팝업이 섞인 묶음은 어느 한쪽 색을 쓰면 거짓말이 된다
      const kindClass = kinds.size === 1 ? `pin--${head.kind}` : 'pin--mixed'

      const el = document.createElement('button')
      el.type = 'button'
      el.className = `pin ${kindClass}${count > 1 ? ' pin--cluster' : ''}`
      el.innerHTML =
        '<span class="pin__kind"></span><span class="pin__name"></span><span class="pin__tail"></span>'
      el.querySelector('.pin__kind')!.textContent =
        count > 1 ? `${count}곳` : EVENT_KIND_LABELS[head.kind]
      // 대상명은 사용자 데이터라 textContent 로 넣는다
      el.querySelector('.pin__name')!.textContent =
        count > 1 ? `${head.subject} 외 ${count - 1}` : head.subject
      el.setAttribute(
        'aria-label',
        count > 1 ? `이 지점 ${count}곳 목록 열기` : `${head.subject} 요약 열기`,
      )
      el.onclick = () =>
        setSheet(
          count > 1 ? { kind: 'cluster', ids: c.items.map((e) => e.id) } : { kind: 'event', id: head.id },
        )

      overlays.push(
        new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(c.lat, c.lng),
          content: el,
          map,
          yAnchor: 1,
          // 위쪽 핀이 아래쪽 핀 라벨을 가리지 않도록 위도 순으로 겹침 순서를 준다
          zIndex: 100 + i,
          clickable: true,
        }),
      )
    }

    return () => {
      for (const o of overlays) o.setMap(null)
    }
  }, [clusters, state])

  // ③ 화면 맞추기 — 목록이 바뀔 때만.
  // 확대할 때마다 다시 맞추면 사용자가 확대를 할 수 없다
  useEffect(() => {
    const map = mapRef.current
    const kakao = kakaoRef.current
    if (!map || !kakao || pins.length === 0) return

    // 핀이 하나뿐이면 bounds 가 한 점이라 과하게 확대된다
    if (pins.length === 1) {
      map.setCenter(new kakao.maps.LatLng(pins[0].place.lat, pins[0].place.lng))
      map.setLevel(4)
      return
    }

    const bounds = new kakao.maps.LatLngBounds()
    for (const e of pins) bounds.extend(new kakao.maps.LatLng(e.place.lat, e.place.lng))
    if (!bounds.isEmpty()) map.setBounds(bounds)
  }, [pins, state])

  // 필터가 바뀌면 사라진 핀의 미니 카드가 남지 않도록 한다
  const byId = useMemo(() => new Map(pins.map((e) => [e.id, e])), [pins])
  const sheetEvent = sheet?.kind === 'event' ? byId.get(sheet.id) ?? null : null
  const sheetList =
    sheet?.kind === 'cluster'
      ? sheet.ids.flatMap((id) => {
          const e = byId.get(id)
          return e ? [e] : []
        })
      : []
  const backIds = sheet?.kind === 'event' ? sheet.from ?? null : null

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
          {clusters.length < pins.length && (
            <span className="mapwrap__folded"> · {clusters.length}묶음</span>
          )}
          {radiusKm !== null && (
            <>
              <span className="mapwrap__sep">·</span>
              <span className="mapwrap__radius">반경 약 {formatDistance(radiusKm)}</span>
            </>
          )}
        </p>

        {(sheetEvent || sheetList.length > 0) && (
          <div className="mapsheet" role="dialog" aria-label="선택한 지점">
            <button
              type="button"
              className="mapsheet__close"
              onClick={() => setSheet(null)}
              aria-label="닫기"
            >
              ✕
            </button>

            {/* 지도를 벗어나지 않고 "여기가 어디고 언제 여는지"에 답하는 것이 목적이다.
                상세로 넘어가면 지도에서 보던 위치 맥락이 끊긴다 */}
            <div className="mapsheet__scroll">
              {sheetEvent ? (
                <>
                  {backIds && (
                    <button
                      type="button"
                      className="mapsheet__back"
                      onClick={() => setSheet({ kind: 'cluster', ids: backIds })}
                    >
                      ‹ 이 지점 {backIds.length}곳
                    </button>
                  )}

                  <p className="mapsheet__head">
                    <span className={`mapsheet__kind mapsheet__kind--${sheetEvent.kind}`}>
                      {EVENT_KIND_LABELS[sheetEvent.kind]}
                    </span>
                    <strong className="mapsheet__subject">{sheetEvent.subject}</strong>
                    <span className="mapsheet__period">{periodLabel(sheetEvent, today)}</span>
                  </p>

                  <p className="mapsheet__place">
                    <span className="card__district">
                      {DISTRICT_LABELS[sheetEvent.place.district]}
                    </span>
                    {sheetEvent.place.name}
                  </p>
                  <p className="mapsheet__address">{sheetEvent.place.address}</p>

                  <dl className="mapsheet__rows">
                    <div className="mapsheet__row">
                      <dt>기간</dt>
                      <dd>
                        {sheetEvent.starts_on} ~ {sheetEvent.ends_on}
                      </dd>
                    </div>
                    {sheetEvent.open_hours && (
                      <div className="mapsheet__row">
                        <dt>운영시간</dt>
                        <dd>{sheetEvent.open_hours}</dd>
                      </div>
                    )}
                    {sheetEvent.perks && (
                      <div className="mapsheet__row">
                        <dt>특전</dt>
                        <dd>{sheetEvent.perks}</dd>
                      </div>
                    )}
                  </dl>

                  <button
                    type="button"
                    className="mapsheet__more"
                    onClick={() => onOpen(sheetEvent.id)}
                  >
                    자세히 보기
                  </button>
                </>
              ) : (
                <>
                  {/* 같은 골목에 여러 곳이 열리는 건 흔한 일이라,
                      "여기 N곳"이 그 자체로 정보다 */}
                  <p className="mapsheet__head">
                    <strong className="mapsheet__subject">이 지점 {sheetList.length}곳</strong>
                  </p>
                  <p className="mapsheet__address">{sheetList[0].place.name} 부근</p>

                  <ul className="mapsheet__list">
                    {sheetList.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          className="mapsheet__item"
                          onClick={() =>
                            setSheet({
                              kind: 'event',
                              id: e.id,
                              from: sheetList.map((x) => x.id),
                            })
                          }
                        >
                          <span className={`mapsheet__kind mapsheet__kind--${e.kind}`}>
                            {EVENT_KIND_LABELS[e.kind]}
                          </span>
                          <span className="mapsheet__itemtext">
                            <span className="mapsheet__itemname">{e.subject}</span>
                            <span className="mapsheet__itemplace">{e.place.name}</span>
                          </span>
                          <span className="mapsheet__itemperiod">{periodLabel(e, today)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
