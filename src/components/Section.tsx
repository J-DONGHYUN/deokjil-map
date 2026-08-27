'use client'

import type { EventItem } from '@/types'
import EventCard from './EventCard'

interface Props {
  title: string
  /** 제목 아래 보조 문구. 섹션의 근거나 규모를 밝히는 자리 */
  note?: string
  events: EventItem[]
  today: string
  onOpen: (id: string) => void
  onMore?: () => void
  moreLabel?: string
  /** 지역 섹션에서 그 구역 지도로 바로 넘어가는 버튼 */
  onMap?: () => void
}

const PREVIEW_COUNT = 8

/**
 * 가로 스크롤 섹션.
 * 세로로 다 쌓으면 첫 화면에 섹션이 하나밖에 안 들어가고,
 * 그러면 "볼 게 많다"는 인상이 안 생겨 체류가 짧아진다.
 *
 * scroll-snap은 쓰지 않는다 — 아이템이 컨테이너를 넘칠 때만 스냅이 걸려
 * 개수에 따라 첫 카드의 좌측 정렬이 달라진다.
 */
export default function Section({
  title,
  note,
  events,
  today,
  onOpen,
  onMore,
  moreLabel,
  onMap,
}: Props) {
  if (events.length === 0) return null

  return (
    <section className="section">
      <div className="section__head">
        <div className="section__headtext">
          <h2 className="section__title">{title}</h2>
          {note && <p className="section__note">{note}</p>}
        </div>

        <div className="section__actions">
          {onMap && (
            <button type="button" className="section__link" onClick={onMap}>
              지도
            </button>
          )}
          {onMore && (
            <button type="button" className="section__link" onClick={onMore}>
              {moreLabel ?? `전체 ${events.length}`} ›
            </button>
          )}
        </div>
      </div>

      <div className="rail">
        {events.slice(0, PREVIEW_COUNT).map((ev) => (
          <EventCard key={ev.id} event={ev} today={today} variant="tile" onOpen={onOpen} />
        ))}
        {events.length > PREVIEW_COUNT && onMore && (
          <button type="button" className="rail__more" onClick={onMore}>
            +{events.length - PREVIEW_COUNT}
            <span>더 보기</span>
          </button>
        )}
      </div>
    </section>
  )
}
