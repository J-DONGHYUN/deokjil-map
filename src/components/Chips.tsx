'use client'

export interface ChipOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: ChipOption<T>[]
  value: T
  onChange: (value: T) => void
  /** 스크린리더용 그룹 이름 */
  label: string
}

/**
 * 가로 스크롤 칩 그룹.
 * 구역이 늘어나면 줄바꿈 대신 옆으로 흐르게 한다 — 줄바꿈은 필터 영역 높이를
 * 들쭉날쭉하게 만들고, 그만큼 첫 화면의 콘텐츠가 밀려난다.
 */
export default function Chips<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`chip ${value === opt.value ? 'chip--on' : ''}`}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
