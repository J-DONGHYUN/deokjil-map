'use client'

import { dateLabel, shiftDate, type DateFilter, type DateKey } from '@/lib/filters'

interface Props {
  value: DateFilter
  today: DateKey
  onChange: (value: DateFilter) => void
}

/** 앞으로 얼마나 볼 수 있게 할지. 이보다 먼 날짜는 데이터가 거의 없다 */
const MAX_AHEAD_DAYS = 60

/**
 * 하루 단위 날짜 이동.
 *
 * 칩(오늘/주말/전체)으로는 "모레 뭐 열려?"에 답할 수 없었다.
 * 화살표로 하루씩 옮기는 편이 팬덤의 실제 질문("이날 갈 수 있는 곳")에 맞는다.
 */
export default function DateNav({ value, today, onChange }: Props) {
  const isAll = value === 'all'
  const date = isAll ? today : value

  const atStart = date <= today
  const maxDate = shiftDate(today, MAX_AHEAD_DAYS, today)
  const atEnd = date >= maxDate

  return (
    <div className="datenav">
      <button
        type="button"
        className="datenav__arrow"
        onClick={() => onChange(shiftDate(date, -1, today))}
        disabled={isAll || atStart}
        aria-label="이전 날짜"
      >
        ‹
      </button>

      <button
        type="button"
        className={`datenav__label ${isAll ? 'datenav__label--muted' : ''}`}
        onClick={() => onChange(isAll ? today : 'all')}
        aria-label={isAll ? '오늘로 돌아가기' : '전체 기간 보기'}
      >
        {isAll ? (
          <span className="datenav__date">전체 기간</span>
        ) : (
          <span className="datenav__date">{dateLabel(date)}</span>
        )}
      </button>

      <button
        type="button"
        className="datenav__arrow"
        onClick={() => onChange(shiftDate(date, 1, today))}
        disabled={isAll || atEnd}
        aria-label="다음 날짜"
      >
        ›
      </button>

      <button
        type="button"
        className={`datenav__all ${isAll ? 'datenav__all--on' : ''}`}
        onClick={() => onChange(isAll ? today : 'all')}
      >
        {isAll ? '오늘' : '전체'}
      </button>
    </div>
  )
}
