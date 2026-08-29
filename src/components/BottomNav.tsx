'use client'

export type Tab = 'home' | 'live' | 'map'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: '홈', icon: '⌂' },
  { id: 'live', label: '실시간', icon: '◍' },
  { id: 'map', label: '지도', icon: '◎' },
]

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

/**
 * 레퍼런스 세 서비스(오프메이트·팝플리·팝가)가 모두 쓰는 하단 탭 구조.
 * 이 카테고리의 표준 문법이라 여기서 벗어나면 학습 비용만 생긴다.
 *
 * '전체' 탭을 뺀 이유 — 홈과 묶는 축만 다를 뿐 같은 목록이었다.
 * 탭 하나를 왕복해야 알 수 있는 차이는 탭으로 나눌 만한 차이가 아니라,
 * 홈 안의 토글로 내렸다. 그 자리를 '실시간'이 받는다.
 *
 * '내 코스' 탭은 담기 기능(P2)이 들어올 때 추가한다.
 * 빈 탭을 미리 노출하면 첫인상에서 미완성으로 읽힌다.
 */
export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="bottomnav" aria-label="주요 화면">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`bottomnav__item ${active === tab.id ? 'bottomnav__item--on' : ''}`}
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <span className="bottomnav__icon" aria-hidden>
            {tab.icon}
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
