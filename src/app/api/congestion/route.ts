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
 * 캐시는 **직접 만든 TTL 캐시**를 쓴다.
 *
 * next: { revalidate } 를 쓰면 안 된다. 그건 stale-while-revalidate 라
 * 만료돼도 일단 옛 값을 돌려주고 뒤에서 갱신한다. 실시간 피드에서는 그게
 * 곧 "틀린 값을 보여준다"는 뜻이다. 실제로 41시간 묵은 값이 디스크 캐시
 * (.next/cache)에 남아 서버를 껐다 켜도 계속 나왔다.
 *
 * 여기서는 만료되면 **기다렸다가 새 값을 준다.** 대신 TTL 안에서는 몇 명이
 * 보든 서울시로 나가는 호출이 하나뿐이라, 사용자 수와 호출 수가 무관한 성질은
 * 그대로 유지된다.
 */

const UPSTREAM = 'http://openapi.seoul.go.kr:8088'
const SERVICE = 'citydata_ppltn'

/**
 * 캐시 수명.
 * 서울시 원본이 5분 주기이므로 이보다 짧게 잡아도 새 값이 없다.
 * 다만 우리 쪽 지연은 이 값 이하로 묶인다.
 */
const TTL_MS = 60_000

/** 새로고침으로 캐시를 건너뛸 때도 이 간격 안에서는 다시 부르지 않는다 */
const FLOOR_MS = 10_000

interface Entry {
  at: number
  body: CongestionResult
}

/**
 * 프로세스 메모리 캐시.
 * 디스크에 남기지 않는 것이 중요하다 — 오래된 실시간 값이 재시작을 넘어
 * 살아남는 일이 이 기능에서 가장 나쁜 실패다.
 */
const cache = new Map<string, Entry>()
/** 같은 구역에 요청이 겹칠 때 서울시를 두 번 두드리지 않는다 */
const inflight = new Map<string, Promise<CongestionResult>>()

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
  const params = new URL(request.url).searchParams
  const district = params.get('district') ?? ''
  const spot = HOTSPOTS[district]

  if (!spot) {
    return Response.json({ error: 'unknown-district' }, { status: 404 })
  }

  const now = Date.now()
  const hit = cache.get(spot.code)
  // 사용자가 새로고침을 누르면 TTL 을 건너뛴다. 다만 연타로 서울시를 두드리지
  // 않도록 바닥은 남긴다
  const ttl = params.get('fresh') === '1' ? FLOOR_MS : TTL_MS
  if (hit && now - hit.at < ttl) {
    return Response.json(hit.body, { headers: { 'Cache-Control': 'no-store' } })
  }

  const pending = inflight.get(spot.code)
  if (pending) {
    return Response.json(await pending, { headers: { 'Cache-Control': 'no-store' } })
  }

  const job = fetchCongestion(spot)
  inflight.set(spot.code, job)
  try {
    const body = await job
    cache.set(spot.code, { at: Date.now(), body })
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } finally {
    inflight.delete(spot.code)
  }
}

async function fetchCongestion(spot: { code: string; name: string }): Promise<CongestionResult> {

  // 키가 없어도 개발이 막히지 않게 샘플키로 떨어진다.
  // 다만 샘플키는 광화문·덕수궁만 실제로 답하므로 아래에서 반드시 검증한다
  const key = process.env.SEOUL_API_KEY?.trim() || 'sample'

  const fail = (reason: CongestionFail): CongestionResult => ({
    ok: false,
    code: spot.code,
    name: spot.name,
    reason,
  })

  let payload: unknown
  try {
    const url = `${UPSTREAM}/${key}/json/${SERVICE}/1/5/${encodeURIComponent(spot.name)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'moyeora-deok/0.1 (+https://github.com/J-DONGHYUN/deokjil-map)' },
      // Next 의 fetch 캐시를 쓰지 않는다. 위의 TTL 캐시가 그 역할을 하고,
      // 이쪽은 항상 진짜 최신을 가져와야 한다
      cache: 'no-store',
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

  return { ok: true, ...data }
}
