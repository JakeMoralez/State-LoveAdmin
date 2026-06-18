import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

export function TagInput({
  value,
  onChange,
  placeholder = 'Метка…',
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '')
    if (!tag || value.includes(tag)) return
    onChange([...value, tag])
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="control min-h-10 flex flex-wrap items-center gap-1.5 py-1.5">
      {value.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
          <button type="button" className="tag-chip-x" onClick={() => onChange(value.filter((t) => t !== tag))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft && commit(draft)}
        placeholder={value.length ? '' : placeholder}
        className="min-w-[80px] flex-1 bg-transparent border-0 outline-none text-sm text-white placeholder:text-white/30"
      />
    </div>
  )
}
