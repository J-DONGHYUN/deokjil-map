import type { EventItem } from '@/types'

/**
 * 이벤트 안내 이미지를 재게시하지 않으므로(poc-plan 4.4) 썸네일 자리를
 * 대상 이름에서 결정론적으로 만들어낸 색 블록으로 채운다.
 *
 * 목적은 장식이 아니라 스캔이다 — 같은 대상은 항상 같은 색이라
 * 목록을 훑을 때 색만으로 재인식된다.
 */

const PALETTE = [
  { from: '#ffd9e6', to: '#ffb3cd', ink: '#a3245c' }, // 핑크
  { from: '#ffe0d6', to: '#ffbfa8', ink: '#a44a28' }, // 코랄
  { from: '#e8dcff', to: '#c9b3ff', ink: '#5b3ba8' }, // 라벤더
  { from: '#d9ecff', to: '#aed3ff', ink: '#20548f' }, // 스카이
  { from: '#d9f5e8', to: '#a8e6c9', ink: '#1c6b47' }, // 민트
  { from: '#fff0cc', to: '#ffdd99', ink: '#8a5a12' }, // 버터
] as const

export type Swatch = (typeof PALETTE)[number]

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function swatchFor(event: EventItem): Swatch {
  return PALETTE[hash(event.subject) % PALETTE.length]
}

/**
 * 블록에 얹을 글자.
 * "샘플아이돌 하린" → "하린", "샘플그룹 NOVA" → "NOVA"
 * 마지막 토큰이 실제 대상명인 경우가 대부분이라 그쪽을 쓴다.
 */
export function initialFor(event: EventItem): string {
  const token = event.subject.trim().split(/\s+/).at(-1) ?? event.subject
  return token.slice(0, 4)
}
