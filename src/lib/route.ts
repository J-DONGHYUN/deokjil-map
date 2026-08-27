'use client'

import { useEffect, useState } from 'react'

/**
 * 해시 기반 라우팅.
 *
 * 라이브러리를 안 쓴다 — 경로가 사실상 "상세가 열렸나" 하나뿐이고,
 * 정적 배포라 서버 라우팅도 필요 없다.
 *
 * 해시를 쓰는 이유는 모바일 뒤로가기다. 상세를 상태로만 열면 뒤로가기가
 * 사이트를 통째로 벗어나고, 커뮤니티에서 들어온 사람이 그대로 이탈한다.
 */

export type Route = { name: 'home' } | { name: 'detail'; id: string }

const DETAIL_PREFIX = '#/e/'

export function parseHash(hash: string): Route {
  if (hash.startsWith(DETAIL_PREFIX)) {
    const id = decodeURIComponent(hash.slice(DETAIL_PREFIX.length))
    if (id) return { name: 'detail', id }
  }
  return { name: 'home' }
}

export function detailHref(id: string): string {
  return `${DETAIL_PREFIX}${encodeURIComponent(id)}`
}

export function useRoute(): Route {
  // 서버 렌더 시점에는 해시를 알 수 없다. 항상 home으로 시작해 마운트 후 맞춘다
  const [route, setRoute] = useState<Route>({ name: 'home' })

  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash))
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return route
}

/** 상세 열기 — 히스토리에 쌓아 뒤로가기로 닫히게 한다 */
export function openDetailRoute(id: string) {
  window.location.hash = detailHref(id).slice(1)
}

/**
 * 상세 닫기.
 * 우리가 쌓은 항목이면 back으로 되돌려 히스토리를 늘리지 않는다.
 * 공유 링크로 곧장 상세에 진입한 경우엔 되돌아갈 곳이 없으므로 해시만 지운다.
 */
export function closeDetailRoute(cameFromInside: boolean) {
  if (cameFromInside) {
    window.history.back()
  } else {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
}
