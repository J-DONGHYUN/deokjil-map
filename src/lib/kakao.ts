'use client'

/**
 * 카카오맵 SDK 로더.
 *
 * 키가 없으면 조용히 실패하고 호출부가 리스트로 폴백한다 —
 * 배포 URL이 확정돼야 도메인 등록이 되고, 그 전까지는 키가 없는 상태로 개발한다.
 *
 * autoload=false 로 받아 kakao.maps.load() 를 직접 부른다.
 * 그래야 스크립트 로드와 지도 초기화 시점을 우리가 통제할 수 있다.
 */

declare global {
  interface Window {
    kakao?: KakaoNamespace
  }
}

export interface KakaoLatLng {
  getLat(): number
  getLng(): number
}

export interface KakaoMap {
  setCenter(latlng: KakaoLatLng): void
  getCenter(): KakaoLatLng
  setLevel(level: number): void
  getLevel(): number
  getBounds(): KakaoBounds
  relayout(): void
}

interface KakaoMarker {
  setMap(map: KakaoMap | null): void
}

interface KakaoCustomOverlay {
  setMap(map: KakaoMap | null): void
  setZIndex(z: number): void
}

interface KakaoBounds {
  extend(latlng: KakaoLatLng): void
  isEmpty(): boolean
  getSouthWest(): KakaoLatLng
  getNorthEast(): KakaoLatLng
}

interface KakaoNamespace {
  maps: {
    load(cb: () => void): void
    LatLng: new (lat: number, lng: number) => KakaoLatLng
    LatLngBounds: new () => KakaoBounds
    Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap & {
      setBounds(bounds: KakaoBounds): void
    }
    Marker: new (options: {
      position: KakaoLatLng
      map?: KakaoMap
      title?: string
      image?: unknown
    }) => KakaoMarker
    /** 임의 HTML을 좌표에 얹는다. 기본 마커로는 "무슨 행사인지"를 표시할 수 없다 */
    CustomOverlay: new (options: {
      position: KakaoLatLng
      content: HTMLElement | string
      map?: KakaoMap
      yAnchor?: number
      xAnchor?: number
      zIndex?: number
      clickable?: boolean
    }) => KakaoCustomOverlay
    MarkerImage: new (src: string, size: unknown, options?: unknown) => unknown
    Size: new (w: number, h: number) => unknown
    Point: new (x: number, y: number) => unknown
    event: {
      addListener(target: unknown, type: string, handler: () => void): void
    }
  }
}

export const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? ''

export type LoadState = 'idle' | 'loading' | 'ready' | 'no-key' | 'error'

let loadPromise: Promise<KakaoNamespace> | null = null

export function loadKakaoMaps(): Promise<KakaoNamespace> {
  if (!KAKAO_JS_KEY) return Promise.reject(new Error('no-key'))
  if (loadPromise) return loadPromise

  loadPromise = new Promise<KakaoNamespace>((resolve, reject) => {
    if (window.kakao?.maps?.load) {
      window.kakao.maps.load(() => resolve(window.kakao!))
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error('SDK 로드는 됐지만 kakao.maps 가 없다'))
        return
      }
      window.kakao.maps.load(() => resolve(window.kakao!))
    }
    // 도메인 미등록이면 카카오가 스크립트를 막아 여기로 떨어진다
    script.onerror = () => reject(new Error('SDK 로드 실패 — 도메인 등록을 확인하세요'))
    document.head.appendChild(script)
  })

  return loadPromise
}


/** 두 좌표 사이 거리(km). 하버사인 */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 사람이 읽는 거리 표기. 1km 미만은 m 로 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10}m`
  if (km < 10) return `${km.toFixed(1)}km`
  return `${Math.round(km)}km`
}
