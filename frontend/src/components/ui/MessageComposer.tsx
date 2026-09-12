import { Loader2, Plus, Send, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import { staffDisplayName, staffLabel } from '../../lib/staff'

export interface MentionOption {
  vk_id: number
  nickname: string
  bot_nickname?: string | null
  display_name?: string
}

export function MessageComposer({
  placeholder = 'Сообщение…',
  disabled,
  onSend,
  mentionCandidates,
}: {
  placeholder?: string
  disabled?: boolean
  onSend: (body: string) => Promise<void>
  mentionCandidates?: MentionOption[]
}) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)

  const mentionQuery = useMemo(() => {
    const at = text.lastIndexOf('@')
    if (at < 0) return null
    const after = text.slice(at + 1)
    if (/\s/.test(after)) return null
    return after
  }, [text])

  const mentionHits = useMemo(() => {
    if (mentionQuery == null || !mentionCandidates?.length) return []
    const q = mentionQuery.toLowerCase()
    return mentionCandidates
      .filter((m) => {
        const label = staffLabel(m).toLowerCase()
        const name = staffDisplayName(staffLabel(m)).toLowerCase()
        return !q || label.includes(q) || name.includes(q) || String(m.vk_id).includes(q)
      })
      .slice(0, 6)
  }, [mentionCandidates, mentionQuery])

  const clearFile = () => {
    setPendingFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const pickFile = (file: File | null) => {
    clearFile()
    if (!file) return
    setPendingFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const insertMention = (m: MentionOption) => {
    const at = text.lastIndexOf('@')
    const prefix = at >= 0 ? text.slice(0, at) : text
    const name = staffDisplayName(staffLabel(m)).replace(/\s+/g, '')
    setText(`${prefix}@${name} `)
    setMentionOpen(false)
    inputRef.current?.focus()
  }

  const send = async () => {
    const trimmed = text.trim()
    if (!trimmed && !pendingFile) return
    setBusy(true)
    try {
      if (pendingFile) {
        const res = await api.uploadFile(pendingFile)
        await onSend(res.url)
      }
      if (trimmed) {
        await onSend(trimmed)
      }
      setText('')
      clearFile()
      setMentionOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка отправки')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="msg-composer-wrap">
      {preview && (
        <div className="msg-composer-preview">
          <img src={preview} alt="" />
          <button type="button" className="msg-composer-preview-remove" onClick={clearFile} aria-label="Убрать">
            <X size={14} />
          </button>
        </div>
      )}
      {mentionOpen && mentionHits.length > 0 && (
        <ul className="msg-mention-list" role="listbox">
          {mentionHits.map((m) => (
            <li key={m.vk_id}>
              <button type="button" className="msg-mention-item" onClick={() => insertMention(m)}>
                {staffLabel(m)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="msg-composer">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="msg-composer-attach"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
          aria-label="Прикрепить"
        >
          <Plus size={20} />
        </button>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setMentionOpen(e.target.value.lastIndexOf('@') >= 0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
            if (e.key === 'Escape') setMentionOpen(false)
          }}
          placeholder={placeholder}
          disabled={disabled || busy}
          className="msg-composer-input"
          aria-label={placeholder}
          name="message"
          autoComplete="off"
        />
        <button
          type="button"
          className="msg-composer-send"
          disabled={disabled || busy || (!text.trim() && !pendingFile)}
          onClick={() => void send()}
          aria-label="Отправить"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  )
}
