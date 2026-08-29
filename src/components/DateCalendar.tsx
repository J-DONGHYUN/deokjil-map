'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { WEEKDAY_LABELS, monthGrid, type DateKey } from '@/lib/filters'

interface Props {
  /** 지금 선택된 날. '전체 기간'이면 null */
  selected: DateKey | null
  today: DateKey
  /** 고를 수 있는 마지막 날. 화살표 이동 한계와 같은 값이다 */
  maxDate: DateKey
  /** 날짜별 행사 수. 없는 날은 0으로 본다 */
  counts: Record<DateKey, number>
  onPick: (date: DateKey) => void
  onClose: () => void
}

/** 'YYYY-MM-DD' → [연, 월] */
function ym(date: DateKey): [number, number] {
  const [y, m] = date.split('-').map(Number)
  return [y, m]
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * 날짜 선택 달력.
 *
 * 화살표는 하루씩만 움직여서 "다음 주 토요일"로 가려면 여러 번 눌러야 했다.
 * 달력을 열면 한 달을 한눈에 보고 바로 짚을 수 있다.
 *
 * 각 날에 행사 수를 같이 찍는다 — 날짜만 보여주면 어느 날이 볼 만한지
 * 눌러보기 전에는 알 수 없고, 결국 빈 날을 계속 헛짚게 된다.
 */
export default function DateCalendar({
  selected,
  today,
  maxDate,
  counts,
  onPick,
  onClose,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [year, setYear] = useState(() => ym(selected ?? today)[0])
  const [month, setMonth] = useState(() => ym(selected ?? today)[1])

  // 바깥을 누르거나 Esc 로 닫는다. 달력은 임시로 여는 것이라 닫기 버튼을 따로 두지 않는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    // 여는 클릭이 그대로 바깥 클릭으로 잡히지 않도록 다음 틱부터 듣는다
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      window.clearTimeout(id)
    }
  }, [onClose])

  const cells = useMemo(() => monthGrid(year, month), [year, month])

  const [minY, minM] = ym(today)
  const [maxY, maxM] = ym(maxDate)
  const atFirstMonth = monthKey(year, month) <= monthKey(minY, minM)
  const atLastMonth = monthKey(year, month) >= monthKey(maxY, maxM)

  const step = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1, 12)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
  }

  return (
    <div className="cal" ref={rootRef} role="dialog" aria-label="날짜 선택">
      <div className="cal__head">
        <button
          type="button"
          className="cal__nav"
          onClick={() => step(-1)}
          disabled={atFirstMonth}
          aria-label="이전 달"
        >
          ‹
        </button>
        <strong className="cal__month">
          {year}년 {month}월
        </strong>
        <button
          type="button"
          className="cal__nav"
          onClick={() => step(1)}
          disabled={atLastMonth}
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="cal__grid cal__grid--head" aria-hidden>
        {WEEKDAY_LABELS.map((w, i) => (
          <span key={w} className={`cal__wd ${i === 0 ? 'cal__wd--sun' : ''}`}>
            {w}
          </span>
        ))}
      </div>

      <div className="cal__grid">
        {cells.map((date, i) => {
          if (!date) return <span key={`x${i}`} className="cal__blank" />

          // 지난 날은 고를 수 없다. 종료된 행사는 애초에 목록에 없어서
          // 눌러도 빈 화면만 나온다 (poc-plan 4.3)
          const out = date < today || date > maxDate
          const n = counts[date] ?? 0

          return (
            <button
              key={date}
              type="button"
              className={[
                'cal__day',
                date === selected ? 'cal__day--on' : '',
                date === today ? 'cal__day--today' : '',
                !out && n === 0 ? 'cal__day--empty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={out}
              onClick={() => onPick(date)}
              aria-label={`${month}월 ${Number(date.slice(-2))}일, ${n}곳`}
            >
              <span className="cal__n">{Number(date.slice(-2))}</span>
              {/* 0곳인 날에 '0'을 찍으면 숫자만 빽빽해진다. 있는 날만 표시한다 */}
              <span className="cal__count">{n > 0 ? n : ''}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
