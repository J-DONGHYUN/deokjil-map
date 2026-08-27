'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventItem } from '@/types'
import { filterEvents } from '@/lib/filters'
import EventCard from './EventCard'

interface Props {
  events: EventItem[]
  today: string
  onClose: () => void
  onOpen: (id: string) => void
}

/**
 * 검색은 화면 이동이 아니라 위에 덮는 레이어다.
 * 탭을 갈아치우면 홈에서 보던 자리(스크롤·필터)를 잃고, 닫을 방법도 애매해진다.
 *
 * 질의는 이 컴포넌트의 지역 상태다. 목록 탭의 필터와 공유하지 않는다 —
 * 검색하고 닫았는데 목록 탭에 질의가 남아 있으면 그게 더 헷갈린다.
 */
export default function SearchOverlay({ events, today, onClose, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // 레이어가 떠 있는 동안 뒤 배경이 같이 스크롤되지 않게 한다
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const results = useMemo(() => {
    if (!query.trim()) return []
    // 검색은 날짜·지역·유형을 걸지 않는다. 찾는 사람은 조건이 아니라 이름을 안다
    return filterEvents(events, { district: 'all', kind: 'all', date: 'all', query }, today)
  }, [events, query, today])

  const typed = query.trim().length > 0

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="검색">
      <div className="overlay__bar">
        <input
          ref={inputRef}
          className="overlay__input"
          type="search"
          value={query}
          placeholder="대상 · 카페명 · 지역 검색"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="검색어"
        />
        <button type="button" className="overlay__close" onClick={onClose}>
          취소
        </button>
      </div>

      <div className="overlay__body">
        {!typed ? (
          <p className="placeholder">
            대상 이름이나 카페명을 입력해보세요.
            <br />
            진행 예정인 곳을 전부 찾습니다.
          </p>
        ) : results.length === 0 ? (
          <p className="placeholder">
            &lsquo;{query.trim()}&rsquo; 결과가 없어요.
            <br />
            다른 이름으로 찾아보세요.
          </p>
        ) : (
          <>
            <p className="count">{results.length}건</p>
            <div className="rows">
              {results.map((ev) => (
                <EventCard key={ev.id} event={ev} today={today} variant="row" onOpen={onOpen} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
