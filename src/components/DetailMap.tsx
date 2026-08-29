'use client'

import { useEffect, useRef, useState } from 'react'
import type { EventItem } from '@/types'
import { KAKAO_JS_KEY, loadKakaoMaps, type KakaoCustomOverlay } from '@/lib/kakao'

interface Props {
  event: EventItem
}

/** 한 곳만 보여줄 때의 배율. 건물과 주변 골목이 같이 읽히는 정도 */
const DETAIL_LEVEL = 4

/**
 * 상세 화면의 위치 지도.
 *
 * 지도 탭과 달리 이 행사 하나만 찍는다 — 여기서 알고 싶은 것은
 * "어디에 있나"이지 "근처에 또 뭐가 있나"가 아니다.
 *
 * 키가 없거나 로드에 실패하면 아무것도 그리지 않는다. 주소는 이미 위에
 * 적혀 있으니, 여기서 에러 문구를 띄우면 알려줄 것도 없이 시끄럽기만 하다.
 */
export default function DetailMap({ event }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  const { lat, lng } = event.place
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)

  useEffect(() => {
    if (!KAKAO_JS_KEY || !hasCoords) return
    let cancelled = false
    let overlay: KakaoCustomOverlay | null = null

    loadKakaoMaps()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return

        const pos = new kakao.maps.LatLng(lat, lng)
        const map = new kakao.maps.Map(containerRef.current, {
          center: pos,
          level: DETAIL_LEVEL,
          // 시트 안에서 스크롤을 가로채지 않도록 고정한다. 위치를 알려주는
          // 지도지 탐색하는 지도가 아니다 — 둘러보려면 지도 탭이 있다
          draggable: false,
          zoomable: false,
        })

        // 지도 탭과 같은 라벨 핀을 쓴다. 두 화면에서 같은 것이 같아 보여야 한다
        const el = document.createElement('div')
        el.className = `pin pin--${event.kind} pin--static`
        el.innerHTML =
          `<span class="pin__kind">${event.kind === 'birthday_cafe' ? '생카' : '팝업'}</span>` +
          `<span class="pin__name"></span>` +
          `<span class="pin__tail"></span>`
        // 장소명은 사용자 데이터라 textContent 로 넣는다
        el.querySelector('.pin__name')!.textContent = event.place.name

        overlay = new kakao.maps.CustomOverlay({
          position: pos,
          content: el,
          map,
          yAnchor: 1,
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      // 카카오 Map 에는 destroy 가 없다. 컨테이너를 비우지 않으면 다른 행사를
      // 열 때 이전 지도가 남는다 (MapView 에서 겪은 것과 같은 문제)
      overlay?.setMap(null)
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [event.kind, event.place.name, lat, lng, hasCoords])

  if (!KAKAO_JS_KEY || !hasCoords || failed) return null

  return (
    <section className="locmap">
      <h3 className="locmap__title">위치</h3>
      <div ref={containerRef} className="locmap__canvas" />
    </section>
  )
}
