// 카카오 JS 키 도메인은 포트까지 정확히 일치해야 한다.
// Next는 포트가 점유돼 있으면 조용히 3001로 넘어가고, 그러면 지도가 죽는다.
// 여기서 먼저 막아 원인을 즉시 드러낸다.
import { createServer } from 'node:net'

const PORT = 3000

const server = createServer()
server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  포트 ${PORT}이 이미 사용 중입니다.\n` +
        `  Next가 다른 포트로 넘어가면 카카오맵 도메인 등록(localhost:${PORT})과 어긋나 지도가 뜨지 않습니다.\n` +
        `  기존 프로세스를 종료한 뒤 다시 실행하세요.\n`,
    )
    process.exit(1)
  }
  throw err
})
server.once('listening', () => server.close())
server.listen(PORT, '127.0.0.1')
