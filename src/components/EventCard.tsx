'use client'

import { useState } from 'react'
import type { EventItem } from '@/types'
import { DISTRICT_LABELS, EVENT_KIND_LABELS, daysLeft, periodLabel } from '@/lib/filters'
import { initialFor, swatchFor } from '@/lib/visual'

interface Props {
  event: EventItem
  today: string
  /** tile = 가로 스크롤용 고정 폭, row = 세로 목록용 전체 폭 */
  variant: 'tile' | 'row'
  onOpen: (id: string) => void
}

/**
 * 카드 내부는 행 높이를 고정해 카드끼리 줄이 맞도록 한다.
 * 굿즈 배지는 margin-top:auto로 항상 바닥에 붙는다.
 *
 * 대표 이미지는 있으면 쓰고, 없거나 로드에 실패하면 대상명 기반 색 블록으로 폴백한다.
 * 수집한 URL은 원본이 지워지면 그대로 깨지므로 폴백이 예외가 아니라 상시 경로다.
 */
export default function EventCard({ event, today, variant, onOpen }: Props) {
  const [imageFailed, setImageFailed] = useState(false)

  const left = daysLeft(event, today)
  const urgent = left >= 0 && left <= 1
  const showImage = Boolean(event.image_url) && !imageFailed
  const sw = swatchFor(event)

  return (
    <button
      type="button"
      className={`card card--${variant}`}
      onClick={() => onOpen(event.id)}
      aria-label={`${event.subject} ${EVENT_KIND_LABELS[event.kind]} 상세 보기`}
    >
      {showImage ? (
        <div className="card__visual card__visual--photo">
          {/* next/image를 쓰지 않는다 — 외부 도메인이 수집 결과에 따라 계속 바뀌고,
              images.unoptimized 설정이라 최적화 이득도 없다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : (
        <div
          className="card__visual"
          style={{ background: `linear-gradient(135deg, ${sw.from}, ${sw.to})`, color: sw.ink }}
          aria-hidden
        >
          {initialFor(event)}
        </div>
      )}

      <div className="card__body">
        <div className="card__head">
          <span className={`badge badge--${event.kind}`}>{EVENT_KIND_LABELS[event.kind]}</span>
          <span className={`period ${urgent ? 'period--urgent' : ''}`}>
            {periodLabel(event, today)}
          </span>
        </div>

        <strong className="card__subject">{event.subject}</strong>

        <div className="card__place">
          <span className="card__district">{DISTRICT_LABELS[event.place.district]}</span>
          {event.place.name}
        </div>

        <div className="card__meta">
          {event.open_hours ?? `${event.starts_on} ~ ${event.ends_on}`}
        </div>

        <div className="card__foot">
          {event.goods.length > 0 && (
            <span className="card__goods">굿즈 {event.goods.length}품목</span>
          )}
        </div>
      </div>
    </button>
  )
}
