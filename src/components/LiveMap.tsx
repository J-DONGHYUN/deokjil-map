'use client'

import { useEffect, useRef, useState } from 'react'
import type { District } from '@/types'
import { DISTRICT_LABELS } from '@/lib/filters'
import {
  CROWD_FILL,
  CROWD_SLUG,
  formatHeadcount,
  hotspotFor,
  type CongestionResult,
} from '@/lib/congestion'
import {
  KAKAO_JS_KEY,
  loadKakaoMaps,
  type KakaoCustomOverlay,
  type KakaoMapInstance,
  type KakaoNamespace,
  type KakaoPolygon,
  type LoadState,
} from '@/lib/kakao'

export interface LiveRow {
  district: District
  count: number
  result?: CongestionResult
}

interface Props {
  rows: LiveRow[]
  onDistrictMap: (district: District) => void
}

/** 서울 중심. 폴리곤이 하나도 없을 때만 쓰인다 */
const SEOUL_CENTER = { lat: 37.5565, lng: 126.9905 }

/**
 * 혼잡도 지도.
 *
 * 혼잡도는 점이 아니라 **면**이다. 마커로 찍으면 "그 한 지점이 붐빈다"로 읽히는데
 * 실제로는 구역 전체의 값이라, 서울시가 정한 구역 경계를 그대로 칠한다.
 * 경계는 src/data/hotspots.json 에 들어 있다 (scripts/hotspots.mjs 가 생성).
 *
 * 이 지도에는 **이벤트 핀을 찍지 않는다.** 같은 화면에 두면 사용자가 색을
 * 그 카페의 상태로 읽는다 — 지도 탭이 이미 이벤트를 담당한다.
 */
export default function LiveMap({ rows, onDistrictMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const kakaoRef = useRef<KakaoNamespace | null>(null)
  const [state, setState] = useState<LoadState>(KAKAO_JS_KEY ? 'loading' : 'no-key')
  // 5분마다 값이 갱신되는데 그때마다 화면을 다시 맞추면 확대를 할 수가 없다
  const fitted = useRef(false)

  // 지도 생성 — 한 번만. 혼잡도가 갱신될 때마다 다시 만들면 사용자가 맞춰둔
  // 확대·위치가 5분마다 초기화된다
  useEffect(() => {
    if (!KAKAO_JS_KEY) return
    let cancelled = false
    const container = containerRef.current

    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return
        kakaoRef.current = kakao
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
          level: 8,
        })
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
  }, [])

  // 구역 칠하기 — 값이 바뀔 때마다 다시 그린다
  useEffect(() => {
    const map = mapRef.current
    const kakao = kakaoRef.current
    if (!map || !kakao) return

    const polygons: KakaoPolygon[] = []
    const overlays: KakaoCustomOverlay[] = []
    const bounds = new kakao.maps.LatLngBounds()
    let drawn = 0

    for (const { district, count, result } of rows) {
      const spot = hotspotFor(district)
      if (!spot) continue

      const ok = result?.ok === true
      const fill = ok ? CROWD_FILL[result.level] : '#9aa2ab'

      for (const ring of spot.rings) {
        const path = ring.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng))
        for (const p of path) bounds.extend(p)
        polygons.push(
          new kakao.maps.Polygon({
            path,
            map,
            strokeWeight: 2,
            strokeColor: fill,
            strokeOpacity: ok ? 0.9 : 0.4,
            fillColor: fill,
            // 값이 없는 구역은 존재만 알리고 색으로 주장하지 않는다
            fillOpacity: ok ? 0.32 : 0.08,
          }),
        )
      }

      const el = document.createElement('button')
      el.type = 'button'
      el.className = `crowdpin ${ok ? `crowdpin--${CROWD_SLUG[result.level]}` : 'crowdpin--off'}`
      el.innerHTML =
        '<span class="crowdpin__level"></span>' +
        '<span class="crowdpin__body"><span class="crowdpin__name"></span>' +
        '<span class="crowdpin__sub"></span></span>'
      // 서울시가 정한 관측소 이름을 그대로 쓴다. 우리 구역명으로 바꾸지 않는다
      el.querySelector('.crowdpin__level')!.textContent = ok ? result.level : '—'
      el.querySelector('.crowdpin__name')!.textContent = ok ? result.name : spot.name
      el.querySelector('.crowdpin__sub')!.textContent = ok
        ? `${formatHeadcount(result.min, result.max)} · 오늘 ${count}곳`
        : `${DISTRICT_LABELS[district]} · 오늘 ${count}곳`
      el.onclick = () => onDistrictMap(district)

      overlays.push(
        new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(spot.center[1], spot.center[0]),
          content: el,
          map,
          yAnchor: 0.5,
          zIndex: 100 + drawn,
          clickable: true,
        }),
      )
      drawn++
    }

    if (!fitted.current && drawn > 1 && !bounds.isEmpty()) {
      map.setBounds(bounds)
      fitted.current = true
    }

    return () => {
      for (const p of polygons) p.setMap(null)
      for (const o of overlays) o.setMap(null)
    }
  }, [rows, state, onDistrictMap])

  if (state === 'no-key' || state === 'error') {
    return (
      <p className="placeholder">
        {state === 'no-key'
          ? '지도는 카카오 JS 키가 설정되면 표시됩니다.'
          : '지도를 불러오지 못했습니다.'}
        <br />
        목록으로 확인해주세요.
      </p>
    )
  }

  return (
    <div className="livemap">
      <div ref={containerRef} className="livemap__canvas" />
      {state === 'loading' && <p className="placeholder livemap__loading">지도를 불러오는 중…</p>}
    </div>
  )
}
