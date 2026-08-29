import {
  isCrowdLevel,
  type Congestion,
  type CongestionFail,
  type CongestionResult,
  type Forecast,
} from '@/lib/congestion'
import hotspotData from '@/data/hotspots.json'

/**
 * 서울시 실시간 인구데이터 프록시.
 *
 * poc-plan 6번은 Next.js API 라우트를 범위에서 제외했다. 여기가 예외인 이유는
 * **인증키를 클라이언트에 내보낼 수 없기 때문**이다. NEXT_PUBLIC_ 으로 두면
 * 키가 번들에 박혀 그대로 공개된다. 정적 배포로 풀 수 있는 문제가 아니다.
 *
 * 캐시는 fetch 단에 건다. 서버가 5분간 같은 응답을 재사용하므로
 * 보는 사람이 100명이든 1,000명이든 서울시로 나가는 호출 수가 늘지 않는다.
 * 서울시 원본이 5분 주기라 그보다 자주 부를 이유도 없다.
 */

const UPSTREAM = 'http://openapi.seoul.go.kr:8088'
const SERVICE = 'citydata_ppltn'

/** 서울시 원본과 같은 주기. 더 짧게 잡아도 새 값이 없다 */
const REVALIDATE_SECONDS = 300

const HOTSPOTS = hotspotData.districts as Record<string, { code: string; name: string }>

interface UpstreamRow {
  AREA_NM?: string
  AREA_CD?: string
  AREA_CONGEST_LVL?: string
  AREA_CONGEST_MSG?: string
  AREA_PPLTN_MIN?: string
  AREA_PPLTN_MAX?: string
  PPLTN_TIME?: string
  NON_RESNT_PPLTN_RATE?: string
  FCST_PPLTN?: {
    FCST_TIME?: string
    FCST_CONGEST_LVL?: string
    FCST_PPLTN_MIN?: string
    FCST_PPLTN_MAX?: string
  }[]
}

/** 서울시가 주는 시각은 'YYYY-MM-DD HH:mm' 인데 타임존이 없다. KST 로 고정한다 */
function toKstIso(raw: string | undefined): string {
  if (!raw) return ''
  return `${raw.trim().replace(' ', 'T')}:00+09:00`
}

function num(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toForecast(rows: UpstreamRow['FCST_PPLTN']): Forecast[] {
  if (!rows) return []
  return rows.flatMap((f) => {
    const lvl = f.FCST_CONGEST_LVL?.trim() ?? ''
    if (!isCrowdLevel(lvl)) return []
    return [{
      // 'YYYY-MM-DD HH:mm' 에서 시각만 남긴다
      time: (f.FCST_TIME ?? '').slice(11, 16),
      level: lvl,
      min: num(f.FCST_PPLTN_MIN),
      max: num(f.FCST_PPLTN_MAX),
    }]
  })
}

export async function GET(request: Request): Promise<Response> {
  const district = new URL(request.url).searchParams.get('district') ?? ''
  const spot = HOTSPOTS[district]

  if (!spot) {
    return Response.json({ error: 'unknown-district' }, { status: 404 })
  }

  // 키가 없어도 개발이 막히지 않게 샘플키로 떨어진다.
  // 다만 샘플키는 광화문·덕수궁만 실제로 답하므로 아래에서 반드시 검증한다
  const key = process.env.SEOUL_API_KEY?.trim() || 'sample'

  // 실패 응답은 브라우저에 캐시시키지 않는다 — 키를 넣자마자 살아나야 한다.
  // 서울시로 나가는 호출은 아래 fetch 의 revalidate 가 이미 막고 있다
  const fail = (reason: CongestionFail) =>
    Response.json(
      { ok: false, code: spot.code, name: spot.name, reason } satisfies CongestionResult,
      { headers: { 'Cache-Control': 'no-store' } },
    )

  let payload: unknown
  try {
    const url = `${UPSTREAM}/${key}/json/${SERVICE}/1/5/${encodeURIComponent(spot.name)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'moyeora-deok/0.1 (+https://github.com/J-DONGHYUN/deokjil-map)' },
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) return fail('upstream')
    const text = await res.text()
    // 인증키가 틀리면 JSON 이 아니라 XML 로 INFO-100 이 온다
    if (!text.trimStart().startsWith('{')) {
      return fail(text.includes('INFO-100') ? 'bad-key' : 'upstream')
    }
    payload = JSON.parse(text)
  } catch {
    return fail('upstream')
  }

  const row = (payload as Record<string, UpstreamRow[] | undefined>)['SeoulRtd.citydata_ppltn']?.[0]
  if (!row) return fail('upstream')

  /**
   * 여기가 이 파일에서 가장 중요한 줄이다.
   *
   * 샘플키는 **요청한 구역을 무시하고 언제나 광화문·덕수궁을 돌려준다.** 에러가
   * 아니라 정상 응답으로 온다. 검증하지 않으면 홍대 자리에 광화문 숫자가 찍히고,
   * 그건 출처를 속이는 것이다 (CLAUDE.md). 코드가 다르면 값이 없는 것으로 본다.
   */
  if (row.AREA_CD && row.AREA_CD !== spot.code) return fail('need-key')

  const level = row.AREA_CONGEST_LVL?.trim() ?? ''
  if (!isCrowdLevel(level)) return fail('upstream')

  const data: Congestion = {
    code: spot.code,
    name: row.AREA_NM?.trim() || spot.name,
    level,
    message: row.AREA_CONGEST_MSG?.trim() ?? '',
    min: num(row.AREA_PPLTN_MIN),
    max: num(row.AREA_PPLTN_MAX),
    observedAt: toKstIso(row.PPLTN_TIME),
    visitorRate: num(row.NON_RESNT_PPLTN_RATE),
    forecast: toForecast(row.FCST_PPLTN),
  }

  return Response.json({ ok: true, ...data } satisfies CongestionResult)
}
