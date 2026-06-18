import { Loader2, Plus, Send, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../../api'

export function MessageComposer({
  placeholder = 'Сообщение…',
  disabled,
  onSend,
}: {
  placeholder?: string
  disabled?: boolean
  onSend: (body: string) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Ошибка отправки')
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={placeholder}
          disabled={disabled || busy}
          className="msg-composer-input"
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
