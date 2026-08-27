/**
 * 수집 실행기.
 *
 *   node crawler/run.mjs [--source popga|offmate|all] [--limit 600] [--days 60]
 *
 * 1) robots.txt 를 먼저 확인한다. 막혀 있으면 아무것도 하지 않고 끝낸다
 * 2) 사이트맵에서 최근 갱신된 상세 URL을 고른다
 * 3) 각 상세를 예의 있는 간격으로 가져와 원본 레코드를 저장한다
 *
 * 결과는 data/raw/crawl/<source>.json 에 쌓인다 (커밋되지 않는다).
 * 정규화·필터는 to-events.mjs 가 맡는다 — 수집과 가공을 분리해두면
 * 필터 기준을 바꿀 때 다시 긁지 않아도 된다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { isAllowed } from './lib/http.mjs'
import * as popga from './sources/popga.mjs'
import * as offmate from './sources/offmate.mjs'

const SOURCES = {
  popga: {
    origin: popga.ORIGIN,
    path: '/popup/',
    list: popga.listPopupUrls,
    fetchOne: popga.fetchPopup,
  },
  offmate: {
    origin: offmate.ORIGIN,
    path: '/place/birthday-cafe/',
    list: offmate.listCafeUrls,
    fetchOne: offmate.fetchCafe,
  },
}

const args = process.argv.slice(2)
const getStr = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const getNum = (name, fallback) => {
  const v = getStr(name, null)
  return v === null ? fallback : Number(v)
}

const LIMIT = getNum('limit', 600)
const DAYS = getNum('days', 60)
const WHICH = getStr('source', 'popga')
const OUT_DIR = 'data/raw/crawl'

const targets = WHICH === 'all' ? Object.keys(SOURCES) : [WHICH]
for (const name of targets) {
  if (!SOURCES[name]) {
    console.error(`알 수 없는 소스: ${name} (가능: ${Object.keys(SOURCES).join(', ')}, all)`)
    process.exit(1)
  }
}

for (const name of targets) {
  const src = SOURCES[name]
  console.log(`\n[${name}]`)

  const gate = await isAllowed(src.origin, src.path)
  console.log(`  robots.txt: ${gate.allowed ? '허용' : '차단'} — ${gate.reason}`)
  if (!gate.allowed) {
    console.error(`  robots.txt 가 ${src.path} 를 허용하지 않는다. 이 소스를 건너뛴다.`)
    continue
  }

  const all = await src.list()
  const cutoff = new Date(Date.now() - DAYS * 86_400_000).toISOString()
  const picked = all.filter((e) => e.lastmod >= cutoff).slice(0, LIMIT)
  console.log(`  사이트맵 ${all.length}건 → 최근 ${DAYS}일 ${picked.length}건 수집`)

  const records = []
  const failures = []

  for (const [i, entry] of picked.entries()) {
    const r = await src.fetchOne(entry.url)
    if (r.ok) records.push({ ...r.record, lastmod: entry.lastmod })
    else failures.push({ url: entry.url, status: r.status, error: r.error })

    if ((i + 1) % 50 === 0 || i === picked.length - 1) {
      console.log(`    ${i + 1}/${picked.length} · 성공 ${records.length} · 실패 ${failures.length}`)
    }
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(
    `${OUT_DIR}/${name}.json`,
    JSON.stringify({ collected_at: new Date().toISOString(), records, failures }, null, 2),
    'utf8',
  )
  console.log(`  저장: ${OUT_DIR}/${name}.json (${records.length}건)`)
  if (failures.length) console.log(`  실패 ${failures.length}건 — 같은 파일의 failures 참조`)
}
