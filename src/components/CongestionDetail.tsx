'use client'

import type { District } from '@/types'
import { DISTRICT_LABELS } from '@/lib/filters'
import {
  CROWD_SLUG,
  STALE_MINUTES,
  formatHeadcount,
  freshnessLabel,
  minutesSince,
  type Congestion,
} from '@/lib/congestion'

interface Props {
  district: District
  count: number
  data: Congestion
  /** 'N분 전' 계산 기준 시각. 바깥에서 1분마다 갱신한다 */
  now: number
}

/**
 * 한 구역의 혼잡도 본문.
 *
 * 목록 카드와 지도 시트가 같은 내용을 보여준다. 한쪽만 고쳐서 두 화면이
 * 다른 말을 하는 일이 없도록 여기 한 곳에 둔다.
 * 감싸는 요소(버튼이냐 시트냐)는 쓰는 쪽이 정한다 — 여기엔 버튼을 두지 않는다.
 */
export default function CongestionDetail({ district, count, data, now }: Props) {
  const mins = minutesSince(data.observedAt, now)
  const stale = mins > STALE_MINUTES
  // 지금보다 한산해지는 첫 시각. "그럼 언제 가지"에 한 줄로 답한다
  const better = data.forecast.find((f) => f.max < data.min)

  return (
    <>
      <div className="livecard__head">
        {/* 서울시가 정한 관측소 이름을 그대로 쓴다. 우리 구역명으로 바꾸지 않는다 */}
        <strong className="livecard__spot">{data.name}</strong>
        <span className={`livecard__level livecard__level--${CROWD_SLUG[data.level]}`}>
          {data.level}
        </span>
      </div>

      <p className="livecard__where">
        {DISTRICT_LABELS[district]} · 오늘 {count}곳
      </p>

      <p className="livecard__figure">
        {formatHeadcount(data.min, data.max)}
        {data.visitorRate > 0 && (
          <span className="livecard__visitor"> · 방문자 {Math.round(data.visitorRate)}%</span>
        )}
      </p>

      {data.message && <p className="livecard__msg">{data.message}</p>}

      {better && (
        <p className="livecard__fcst">
          {better.time}쯤 한산해져요 · {better.level}
        </p>
      )}

      <p className="livecard__time">
        {stale ? '갱신이 멈췄어요 · ' : ''}
        {freshnessLabel(data.observedAt, now)}
      </p>
    </>
  )
}
