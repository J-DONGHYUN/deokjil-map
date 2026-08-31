import hotspotData from '@/data/hotspots.json'
import type { District } from '@/types'

/**
 * 서울시 실시간 인구데이터(열린데이터광장 OA-21778).
 *
 * 이 API 는 좌표로 조회되지 않는다. 서울시가 미리 정한 **121곳**의 이름·코드로만
 * 물어볼 수 있고, 목록에 없는 곳은 값 자체가 존재하지 않는다.
 * 우리 구역과 그 121곳을 잇는 표가 src/data/hotspots.json 이다
 * (scripts/hotspots.mjs 가 생성한다).
 *
 * ⚠️ 이 값은 **구역**의 것이지 개별 이벤트의 것이 아니다.
 * KT 기지국 신호로 추정한 "이 일대에 사람이 몇 명"이라, "이 카페 줄이 길다"가
 * 아니다. 화면에서 이벤트 핀·카드에 이 값을 칠하면 사용자가 매장 상태로 읽고
 * 헛걸음한다 — 그러면 재방문 지표가 오염된다 (poc-plan 1번).
 * 그래서 항상 **관측소 이름과 함께** 보여준다.
 */

/** 서울시가 쓰는 4단계. 우리 말로 바꾸지 않는다 — 가공하지 않았다는 표시다 */
export const CROWD_LEVELS = ['여유', '보통', '약간 붐빔', '붐빔'] as const
export type CrowdLevel = (typeof CROWD_LEVELS)[number]

/** CSS 클래스용 슬러그. 한글을 클래스명에 넣지 않는다 */
export const CROWD_SLUG: Record<CrowdLevel, string> = {
  여유: 'calm',
  보통: 'normal',
  '약간 붐빔': 'busy',
  붐빔: 'packed',
}

export function isCrowdLevel(v: string): v is CrowdLevel {
  return (CROWD_LEVELS as readonly string[]).includes(v)
}

export interface Forecast {
  /** 'HH:mm' */
  time: string
  level: CrowdLevel
  min: number
  max: number
}

export interface Congestion {
  code: string
  /** 서울시가 정한 관측소 이름. 우리 구역명으로 바꾸지 않는다 */
  name: string
  level: CrowdLevel
  /** 서울시가 주는 안내 문장 */
  message: string
  /** 인원은 정확한 수가 아니라 범위로 온다 */
  min: number
  max: number
  /** 관측 시각 (KST ISO) */
  observedAt: string
  /** 상주(동네 사람)가 아닌 방문자 비율 */
  visitorRate: number
  forecast: Forecast[]
}

export type CongestionFail =
  /** 인증키가 없어 샘플키로 물었고, 다른 구역 값이 돌아왔다 */
  | 'need-key'
  /** 인증키가 유효하지 않다 */
  | 'bad-key'
  /** 서울시 쪽 응답이 없거나 형식이 다르다 */
  | 'upstream'

export type CongestionResult =
  | ({ ok: true } & Congestion)
  | { ok: false; code: string; name: string; reason: CongestionFail }

export interface Hotspot {
  code: string
  name: string
  category: string
  /** 라벨을 얹을 대표 좌표 [lng, lat] */
  center: [number, number]
  /** 구역 경계 (WGS84). 실시간 지도가 이 면을 혼잡도 색으로 칠한다 */
  rings: [number, number][][]
}

/**
 * 폴리곤 채움색.
 *
 * 카카오 Polygon 은 CSS 변수를 읽지 못해 값을 직접 넘겨야 한다.
 * globals.css 의 --crowd-* 와 같은 값이므로 한쪽만 고치면 지도와 카드의 색이 어긋난다.
 */
export const CROWD_FILL: Record<CrowdLevel, string> = {
  여유: '#1f7a4d',
  보통: '#35688c',
  '약간 붐빔': '#a8640f',
  붐빔: '#9c3030',
}

// JSON 임포트는 좌표를 number[] 로 넓혀 읽는다. 실제 값은 [lng, lat] 쌍이므로
// 튜플로 좁혀 쓴다 — 지도에 넘길 때 순서가 뒤집히면 서울이 아닌 곳이 찍힌다
const HOTSPOTS = hotspotData.districts as unknown as Record<string, Hotspot>

/** 관측소가 없는 구역이 있다. 'etc' 처럼 서로 먼 곳이 섞인 자루가 그렇다 */
export function hotspotFor(district: District): Hotspot | null {
  return HOTSPOTS[district] ?? null
}

export function hasHotspot(district: District): boolean {
  return district in HOTSPOTS
}

/**
 * 관측 시각으로부터 몇 분 지났나.
 *
 * 서울시가 주는 시각은 KST 표기인데 타임존이 붙어 있지 않다. 그대로 파싱하면
 * 보는 사람의 시간대에 따라 값이 달라지므로 +09:00 을 명시해 고정한다.
 */
export function minutesSince(observedAt: string, now: number = Date.now()): number {
  const t = Date.parse(observedAt)
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.round((now - t) / 60_000))
}

/**
 * 이보다 오래되면 죽은 값으로 본다.
 *
 * 원본이 5분 주기라 20분으로 잡았었는데, 서울시가 발표를 늦추는 구간이 있다 —
 * 실측으로 30분 지연을 봤다. 그때 화면이 통째로 회색이 되면 정상 데이터까지
 * 못 쓰게 되므로 그보다 여유를 둔다. 우리 쪽 지연은 라우트의 TTL(60초)로
 * 따로 묶여 있어서 이 값이 우리 지연을 가리지는 않는다.
 */
export const STALE_MINUTES = 45

/**
 * 'N분 전'만 쓰면 우리 앱이 늦은 것처럼 읽힌다. 서울시가 발표한 시각을 같이
 * 적어 지연의 출처를 분명히 한다 — "09:20 기준 · 30분 전".
 */
export function freshnessLabel(observedAt: string, now: number = Date.now()): string {
  const m = minutesSince(observedAt, now)
  if (!Number.isFinite(m)) return '시각 불명'
  // 'YYYY-MM-DDTHH:mm:00+09:00' — KST 로 고정돼 있어 그대로 잘라 쓴다
  return `${observedAt.slice(11, 16)} 기준 · ${m < 1 ? '방금' : `${m}분 전`}`
}

/** 3만 4천 ~ 3만 6천 명 → "3.4만~3.6만" */
export function formatHeadcount(min: number, max: number): string {
  const one = (n: number) => (n >= 10_000 ? `${(n / 10_000).toFixed(1)}만` : n.toLocaleString('ko-KR'))
  return `${one(min)}~${one(max)}명`
}
