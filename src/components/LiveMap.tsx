'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { District } from '@/types'
import { DISTRICT_LABELS } from '@/lib/filters'
import {
  CROWD_FILL,
  CROWD_LEVELS,
  hotspotFor,
  type CongestionResult,
} from '@/lib/congestion'
import CongestionDetail from './CongestionDetail'
import {
  KAKAO_JS_KEY,
  loadKakaoMaps,
  type KakaoBounds,
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
  /** 'N분 전' 계산 기준 시각 */
  now: number
  /** 시트 안의 명시적인 버튼으로만 쓴다. 구역을 누르는 것으로 이동하지 않는다 */
  onDistrictMap: (district: District) => void
}

/** 서울 중심. 폴리곤이 하나도 없을 때만 쓰인다 */
const SEOUL_CENTER = { lat: 37.5565, lng: 126.9905 }

/** 값이 없는 구역 */
const NO_DATA_FILL = '#9aa2ab'

/**
 * 구역으로 파고들 때 남기는 여백(px).
 * 아래를 크게 잡는 이유는 혼잡도 시트가 그만큼을 가리기 때문이다 —
 * 여백 없이 맞추면 방금 누른 구역이 시트 뒤로 숨는다.
 */
const FOCUS_PADDING = { top: 56, side: 40, bottom: 240 }

/**
 * 혼잡도 지도.
 *
 * 혼잡도는 점이 아니라 **면**이다. 마커로 찍으면 "그 한 지점이 붐빈다"로 읽히는데
 * 실제 값은 구역 전체의 것이라, 서울시가 정한 구역 경계를 그대로 칠한다.
 *
 * 구역 위에 이름표를 얹지 않는다. 라벨이 아홉 개 떠 있으면 그게 먼저 읽혀서
 * 정작 색이 안 보인다 — 이 화면이 답하려는 건 "어디가 붉은가" 하나다.
 * 어느 구역인지는 카카오 기본 지도의 지명이 알려주고, 누르면 이름이 나온다.
 * 대신 색이 무슨 뜻인지는 범례로 못 박는다.
 *
 * 이 지도에는 **이벤트 핀을 찍지 않는다.** 같은 화면에 두면 사용자가 색을
 * 그 카페의 상태로 읽는다 — 지도 탭이 이미 이벤트를 담당한다.
 */
export default function LiveMap({ rows, now, onDistrictMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const kakaoRef = useRef<KakaoNamespace | null>(null)
  const [state, setState] = useState<LoadState>(KAKAO_JS_KEY ? 'loading' : 'no-key')
  const [selected, setSelected] = useState<District | null>(null)
  // 5분마다 값이 갱신되는데 그때마다 화면을 다시 맞추면 확대를 할 수가 없다
  const fitted = useRef(false)
  // 전체를 담던 범위. 시트를 닫으면 여기로 되돌린다
  const overview = useRef<KakaoBounds | null>(null)

  /** 한 구역으로 파고든다. 색을 눌렀을 때 그 구역이 화면을 채워야 뭘 봤는지 남는다 */
  const focus = useCallback((district: District) => {
    const map = mapRef.current
    const kakao = kakaoRef.current
    const spot = hotspotFor(district)
    if (!map || !kakao || !spot) return

    const b = new kakao.maps.LatLngBounds()
    for (const ring of spot.rings) {
      for (const [lng, lat] of ring) b.extend(new kakao.maps.LatLng(lat, lng))
    }
    map.setBounds(b, FOCUS_PADDING.top, FOCUS_PADDING.side, FOCUS_PADDING.bottom, FOCUS_PADDING.side)
  }, [])

  /** 시트를 닫으면 처음 보던 범위로 되돌린다. 확대된 채로 남으면 다음 구역을 못 찾는다 */
  const unfocus = useCallback(() => {
    setSelected(null)
    const map = mapRef.current
    if (map && overview.current) map.setBounds(overview.current)
  }, [])

  // 지도 생성 — 한 번만
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

  // 구역 칠하기
  useEffect(() => {
    const map = mapRef.current
    const kakao = kakaoRef.current
    if (!map || !kakao) return

    const polygons: KakaoPolygon[] = []
    const bounds = new kakao.maps.LatLngBounds()
    let drawn = 0

    for (const { district, result } of rows) {
      const spot = hotspotFor(district)
      if (!spot) continue

      const ok = result?.ok === true
      const fill = ok ? CROWD_FILL[result.level] : NO_DATA_FILL
      // 값이 없는 구역은 존재만 알리고 색으로 주장하지 않는다
      const base = ok ? 0.38 : 0.08

      for (const ring of spot.rings) {
        const path = ring.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng))
        for (const p of path) bounds.extend(p)

        const polygon = new kakao.maps.Polygon({
          path,
          map,
          strokeWeight: 2,
          strokeColor: fill,
          strokeOpacity: ok ? 0.9 : 0.4,
          fillColor: fill,
          fillOpacity: base,
        })

        // 색을 누르면 그 구역의 혼잡도를 편다. 지도를 갈아타지 않는다 —
        // 여기서 알고 싶은 건 "얼마나 붐비나"지 "무슨 행사가 있나"가 아니다
        kakao.maps.event.addListener(polygon, 'click', () => {
          setSelected(district)
          focus(district)
        })
        kakao.maps.event.addListener(polygon, 'mouseover', () =>
          polygon.setOptions({ fillOpacity: Math.min(base + 0.18, 0.7) }),
        )
        kakao.maps.event.addListener(polygon, 'mouseout', () =>
          polygon.setOptions({ fillOpacity: base }),
        )

        polygons.push(polygon)
      }
      drawn++
    }

    if (!bounds.isEmpty()) overview.current = bounds
    if (!fitted.current && drawn > 1 && !bounds.isEmpty()) {
      map.setBounds(bounds)
      fitted.current = true
    }

    return () => {
      for (const p of polygons) p.setMap(null)
    }
  }, [rows, state, focus])

  // 값이 사라진 구역의 시트가 남지 않도록 한다
  const picked = useMemo(
    () => (selected ? rows.find((r) => r.district === selected) ?? null : null),
    [rows, selected],
  )

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

      {/* 이름표를 뺐으니 색이 무슨 뜻인지는 여기서 못 박는다 */}
      <div className="crowdlegend">
        {CROWD_LEVELS.map((lv) => (
          <span key={lv} className="crowdlegend__item">
            <span
              className="crowdlegend__dot"
              style={{ background: CROWD_FILL[lv] }}
              aria-hidden
            />
            {lv}
          </span>
        ))}
      </div>

      {!picked && state === 'ready' && (
        <p className="livemap__hint">색칠된 구역을 누르면 자세히 볼 수 있어요</p>
      )}

      {picked && (
        <div className="livesheet" role="dialog" aria-label="구역 혼잡도">
          <button
            type="button"
            className="mapsheet__close"
            onClick={unfocus}
            aria-label="닫기"
          >
            ✕
          </button>

          <div className="livesheet__scroll">
            {picked.result?.ok ? (
              <CongestionDetail
                district={picked.district}
                count={picked.count}
                data={picked.result}
                now={now}
              />
            ) : (
              <>
                <div className="livecard__head">
                  <strong className="livecard__spot">
                    {hotspotFor(picked.district)?.name ?? DISTRICT_LABELS[picked.district]}
                  </strong>
                  <span className="livecard__level livecard__level--off">값을 받지 못했어요</span>
                </div>
                <p className="livecard__where">
                  {DISTRICT_LABELS[picked.district]} · 오늘 {picked.count}곳
                </p>
              </>
            )}

            {/* 이동은 누른 곳이 아니라 이름 붙은 버튼으로만 일어난다 */}
            <button
              type="button"
              className="mapsheet__more"
              onClick={() => onDistrictMap(picked.district)}
            >
              이 구역 행사 보기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
