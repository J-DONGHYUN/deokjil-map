/**
 * 수집 실행기.
 *
 *   node crawler/run.mjs [--limit 400] [--days 45]
 *
 * 1) robots.txt 를 먼저 확인한다. 막혀 있으면 아무것도 하지 않고 끝낸다
 * 2) 사이트맵에서 최근 갱신된 팝업 상세 URL을 고른다
 * 3) 각 상세를 예의 있는 간격으로 가져와 원본 레코드를 저장한다
 *
 * 결과는 data/raw/crawl/popga.json 에 쌓인다 (커밋되지 않는다).
 * 정규화·필터는 to-events.mjs 가 맡는다 — 수집과 가공을 분리해두면
 * 필터 기준을 바꿀 때 다시 긁지 않아도 된다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAllowed } from './lib/http.mjs'
import { ORIGIN, fetchPopup, listPopupUrls } from './sources/popga.mjs'

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback
}

const LIMIT = getArg('limit', 400)
const DAYS = getArg('days', 45)
const OUT_DIR = 'data/raw/crawl'

const gate = await isAllowed(ORIGIN, '/popup/')
console.log(`robots.txt: ${gate.allowed ? '허용' : '차단'} — ${gate.reason}`)
if (!gate.allowed) {
  console.error('robots.txt 가 /popup/ 을 허용하지 않는다. 수집을 중단한다.')
  process.exit(1)
}

const all = await listPopupUrls()
const cutoff = new Date(Date.now() - DAYS * 86_400_000).toISOString()
const targets = all.filter((e) => e.lastmod >= cutoff).slice(0, LIMIT)

console.log(`사이트맵 ${all.length}건 → 최근 ${DAYS}일 ${targets.length}건 수집`)

const records = []
const failures = []

for (const [i, entry] of targets.entries()) {
  const r = await fetchPopup(entry.url)
  if (r.ok) {
    records.push({ ...r.record, lastmod: entry.lastmod })
  } else {
    failures.push({ url: entry.url, status: r.status, error: r.error })
  }
  if ((i + 1) % 25 === 0 || i === targets.length - 1) {
    console.log(`  ${i + 1}/${targets.length} · 성공 ${records.length} · 실패 ${failures.length}`)
  }
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(
  `${OUT_DIR}/popga.json`,
  JSON.stringify({ collected_at: new Date().toISOString(), records, failures }, null, 2),
  'utf8',
)

console.log(`\n저장: ${OUT_DIR}/popga.json (${records.length}건)`)
if (failures.length) console.log(`실패 ${failures.length}건 — 같은 파일의 failures 참조`)
