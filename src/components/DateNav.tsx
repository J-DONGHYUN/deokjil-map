'use client'

import { useState } from 'react'
import { dateLabel, shiftDate, type DateFilter, type DateKey } from '@/lib/filters'
import DateCalendar from './DateCalendar'

interface Props {
  value: DateFilter
  today: DateKey
  onChange: (value: DateFilter) => void
  /** 달력에 찍을 날짜별 건수. 없으면 달력을 열지 않는다 */
  counts?: Record<DateKey, number>
}

/** 앞으로 얼마나 볼 수 있게 할지. 이보다 먼 날짜는 데이터가 거의 없다 */
const MAX_AHEAD_DAYS = 60

/**
 * 하루 단위 날짜 이동.
 *
 * 칩(오늘/주말/전체)으로는 "모레 뭐 열려?"에 답할 수 없었다.
 * 화살표로 하루씩 옮기는 편이 팬덤의 실제 질문("이날 갈 수 있는 곳")에 맞는다.
 *
 * 다만 화살표만으로는 먼 날짜가 멀다. 가운데를 누르면 달력이 열려
 * 한 달을 한눈에 보고 짚을 수 있다.
 */
export default function DateNav({ value, today, onChange, counts }: Props) {
  const [open, setOpen] = useState(false)

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

      <div className="datenav__center">
        <button
          type="button"
          className={`datenav__label ${isAll ? 'datenav__label--muted' : ''}`}
          onClick={() => (counts ? setOpen((v) => !v) : onChange(isAll ? today : 'all'))}
          aria-haspopup={counts ? 'dialog' : undefined}
          aria-expanded={counts ? open : undefined}
          aria-label={counts ? '달력 열기' : '전체 기간 보기'}
        >
          <span className="datenav__date">{isAll ? '전체 기간' : dateLabel(date)}</span>
          {counts && (
            <span className={`datenav__caret ${open ? 'datenav__caret--up' : ''}`} aria-hidden>
              ▾
            </span>
          )}
        </button>

        {open && counts && (
          <DateCalendar
            selected={isAll ? null : date}
            today={today}
            maxDate={maxDate}
            counts={counts}
            onPick={(d) => {
              onChange(d)
              setOpen(false)
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </div>

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
        onClick={() => {
          setOpen(false)
          onChange(isAll ? today : 'all')
        }}
      >
        {isAll ? '오늘' : '전체'}
      </button>
    </div>
  )
}
