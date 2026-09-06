import { ImagePlus, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'

export function ImageUploadButton({
  onUploaded,
  label = 'Скрин',
  className,
  iconOnly = false,
}: {
  onUploaded: (url: string, filename: string) => void
  label?: string
  className?: string
  iconOnly?: boolean
}) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    try {
      const res = await api.uploadFile(file)
      onUploaded(res.url, res.filename)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={className ?? (iconOnly ? 'attach-field-btn' : 'btn btn-secondary btn-sm')}
        title={iconOnly ? label : undefined}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
        {!iconOnly && label}
      </button>
    </>
  )
}

export function isImageUrl(url: string): boolean {
  return /\/uploads\//.test(url) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url)
}
