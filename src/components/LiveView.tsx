'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { District, EventItem } from '@/types'
import { DISTRICT_LABELS, filterEvents, groupByDistrict } from '@/lib/filters'
import CongestionDetail from './CongestionDetail'
import LiveMap, { type LiveRow } from './LiveMap'
import {
  CROWD_SLUG,
  STALE_MINUTES,
  hasHotspot,
  hotspotFor,
  minutesSince,
  type CongestionResult,
} from '@/lib/congestion'

interface Props {
  events: EventItem[]
  today: string
  /** 구역을 눌렀을 때 그 지역 지도로 보낸다 */
  onDistrictMap: (district: District) => void
}

/** 서울시 원본이 5분 주기다. 그보다 자주 물어도 새 값이 없다 */
const POLL_MS = 5 * 60 * 1000

const FAIL_TEXT: Record<string, string> = {
  'need-key': '인증키가 있어야 조회돼요',
  'bad-key': '인증키가 유효하지 않아요',
  upstream: '서울시 응답을 받지 못했어요',
}

type Loaded = Record<string, CongestionResult>

/** 같은 값을 목록으로 볼지, 지도로 볼지 */
type LiveMode = 'list' | 'map'

const MODE_OPTIONS: { value: LiveMode; label: string }[] = [
  { value: 'list', label: '목록' },
  { value: 'map', label: '지도' },
]

/**
 * 실시간 혼잡도.
 *
 * 여기서 보여주는 값은 **구역**의 것이지 개별 행사의 것이 아니다.
 * KT 기지국으로 추정한 "이 일대에 사람이 몇 명"이라, 카드마다 서울시가 정한
 * 관측소 이름(홍대 관광특구·합정역…)을 그대로 노출한다.
 * 우리 구역명만 쓰면 사용자가 "그 카페 앞이 붐빈다"로 읽는다.
 */
export default function LiveView({ events, today, onDistrictMap }: Props) {
  // 지도를 기본으로 둔다. 색으로 칠한 구역이 4단계 텍스트보다 먼저 읽히고,
  // "지금 어디가 붐비나"는 원래 한눈에 보는 질문이다
  const [mode, setMode] = useState<LiveMode>('map')
  const [data, setData] = useState<Loaded>({})
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(() => Date.now())

  // 관측소가 있는 구역만, 오늘 행사가 많은 순으로. 행사가 없는 동네의 혼잡도는
  // 우리에게 쓸모가 없다 — 이 화면은 "오늘 갈 만한 곳"의 상태를 보는 자리다
  const targets = useMemo(() => {
    const dayEvents = filterEvents(events, { district: 'all', kind: 'all', date: today, query: '' }, today)
    return groupByDistrict(dayEvents)
      .filter((g) => hasHotspot(g.district))
      .map((g) => ({ district: g.district, count: g.events.length }))
      .sort((a, b) => b.count - a.count)
  }, [events, today])

  const load = useCallback(async () => {
    if (targets.length === 0) return
    const results = await Promise.all(
      targets.map(async ({ district }) => {
        try {
          const res = await fetch(`/api/congestion?district=${district}`)
          if (!res.ok) return [district, null] as const
          return [district, (await res.json()) as CongestionResult] as const
        } catch {
          return [district, null] as const
        }
      }),
    )
    const next: Loaded = {}
    for (const [d, r] of results) if (r) next[d] = r
    setData(next)
    setLoading(false)
    setTick(Date.now())
  }, [targets])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // 'N분 전'이 멈춰 있지 않도록 1분마다 다시 그린다
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // 'N분 전' 갱신 타이머가 1분마다 재렌더를 일으킨다. 메모이즈하지 않으면
  // 그때마다 새 배열이 만들어져 지도가 통째로 다시 그려지고 확대가 초기화된다
  const rows = useMemo<LiveRow[]>(
    () => targets.map((t) => ({ ...t, result: data[t.district] })),
    [targets, data],
  )
  const okCount = rows.filter((r) => r.result?.ok).length
  const needKey = rows.length > 0 && okCount === 0 &&
    rows.every((r) => r.result && !r.result.ok && r.result.reason === 'need-key')

  return (
    <>
      <div className="livehead">
        <div>
          <h2 className="livehead__title">실시간 혼잡도</h2>
          {/* 우리가 잰 값이 아니다. 출처를 화면에 남긴다 (CLAUDE.md) */}
          <p className="livehead__note">서울시 실시간 도시데이터 · 5분마다 갱신</p>
        </div>
        <button type="button" className="livehead__refresh" onClick={load}>
          새로고침
        </button>
      </div>

      <div className="modetoggle" role="group" aria-label="보기 방식">
        {MODE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`modetoggle__item ${mode === o.value ? 'modetoggle__item--on' : ''}`}
            aria-pressed={mode === o.value}
            onClick={() => setMode(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* 지금 보는 값이 무엇인지 한 번은 분명히 말한다 */}
      <p className="livenotice">
        동네 전체의 사람 수예요. 개별 카페나 팝업의 대기 줄이 아니에요.
      </p>

      {needKey && (
        <p className="livekey">
          서울 열린데이터광장 인증키를 <code>.env.local</code> 의{' '}
          <code>SEOUL_API_KEY</code> 에 넣으면 모든 구역이 표시돼요.
        </p>
      )}

      {loading ? (
        <p className="placeholder">혼잡도를 불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="placeholder">
          오늘 행사가 있는 구역이 없어요.
          <br />
          다른 날짜의 행사는 홈에서 볼 수 있어요.
        </p>
      ) : mode === 'map' ? (
        <LiveMap rows={rows} now={tick} onDistrictMap={onDistrictMap} />
      ) : (
        <div className="rows">
          {rows.map(({ district, count, result }) => {
            const spot = hotspotFor(district)
            if (!result || !result.ok) {
              return (
                <div key={district} className="livecard livecard--off">
                  <div className="livecard__head">
                    <strong className="livecard__spot">{spot?.name ?? DISTRICT_LABELS[district]}</strong>
                    <span className="livecard__level livecard__level--off">
                      {result ? FAIL_TEXT[result.reason] ?? '알 수 없음' : '불러오지 못했어요'}
                    </span>
                  </div>
                  <p className="livecard__where">
                    {DISTRICT_LABELS[district]} · 오늘 {count}곳
                  </p>
                </div>
              )
            }

            const stale = minutesSince(result.observedAt, tick) > STALE_MINUTES

            return (
              <button
                key={district}
                type="button"
                className={`livecard livecard--${CROWD_SLUG[result.level]} ${stale ? 'livecard--stale' : ''}`}
                onClick={() => onDistrictMap(district)}
              >
                <CongestionDetail district={district} count={count} data={result} now={tick} />
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
