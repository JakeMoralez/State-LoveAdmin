import { X } from 'lucide-react'
import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import { PRESET_LABELS, normalizeLabels, type TaskLabel } from '../../lib/labels'

export function LabelInput({
  value,
  onChange,
  placeholder = 'Своя метка…',
}: {
  value: TaskLabel[]
  onChange: (v: TaskLabel[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const labels = normalizeLabels(value)

  const addLabel = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const next = normalizeLabels([...labels, { name: trimmed, color: '' }])
    onChange(next)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addLabel(draft)
    } else if (e.key === 'Backspace' && !draft && labels.length) {
      onChange(labels.slice(0, -1))
    }
  }

  const togglePreset = (preset: TaskLabel) => {
    const exists = labels.some((l) => l.name.toLowerCase() === preset.name.toLowerCase())
    if (exists) {
      onChange(labels.filter((l) => l.name.toLowerCase() !== preset.name.toLowerCase()))
    } else {
      onChange(normalizeLabels([...labels, preset]))
    }
  }

  return (
    <div className="label-input">
      <div className="label-input-presets">
        {PRESET_LABELS.map((p) => {
          const active = labels.some((l) => l.name.toLowerCase() === p.name.toLowerCase())
          return (
            <button
              key={p.name}
              type="button"
              className={`label-preset-chip ${active ? 'label-preset-chip--on' : ''}`}
              style={{ '--label-color': p.color } as CSSProperties}
              onClick={() => togglePreset(p)}
            >
              {p.name}
            </button>
          )
        })}
      </div>
      <div className="label-input-field control">
        {labels.map((tag) => (
          <span
            key={tag.name}
            className="task-label-chip"
            style={{ '--label-color': tag.color } as CSSProperties}
          >
            {tag.name}
            <button
              type="button"
              className="task-label-chip-x"
              onClick={() => onChange(labels.filter((l) => l.name !== tag.name))}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && addLabel(draft)}
          placeholder={labels.length ? '' : placeholder}
          className="label-input-text"
        />
      </div>
    </div>
  )
}
