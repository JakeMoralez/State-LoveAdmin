import { useRef, useState, type ReactNode } from 'react'
import { FileText, Link2, Loader2, Paperclip, Plus, X } from 'lucide-react'
import { api, ApiError, type AcademyMaterial } from '../../api'
import {
  ACADEMY_MATERIAL_ACCEPT,
  academyMaterialFilePath,
  academyMaterialHref,
  academyMaterials,
  isAcademyMaterialFile,
} from '../../lib/academy'

function materialLabel(item: AcademyMaterial): string {
  const title = item.title.trim()
  if (title) return title
  const file = academyMaterialFilePath(item.url)
  if (file) return file.split('/').pop() || 'Документ'
  return item.url.trim()
}

export function AssignmentMaterials({
  items,
  empty = null,
}: {
  items?: AcademyMaterial[] | null
  empty?: ReactNode
}) {
  const rows = academyMaterials(items)
  if (rows.length === 0) return empty
  return (
    <ul className="academy-materials">
      {rows.map((item) => {
        const file = isAcademyMaterialFile(item.url)
        const href = academyMaterialHref(item.url)
        const label = materialLabel(item)
        return (
          <li key={`${item.url}-${item.title}`}>
            <a
              href={href}
              {...(file
                ? { download: label, target: '_blank', rel: 'noreferrer' }
                : { target: '_blank', rel: 'noreferrer' })}
            >
              {file ? <FileText size={14} aria-hidden /> : <Link2 size={14} aria-hidden />}
              {file ? `Скачать: ${label}` : label}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export function MaterialsEditor({
  value,
  onChange,
  hint,
}: {
  value: AcademyMaterial[]
  onChange: (next: AcademyMaterial[]) => void
  hint?: string
}) {
  const rows = value.length > 0 ? value : [{ title: '', url: '' }]
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingIndex = useRef<number | null>(null)
  const [busyIndex, setBusyIndex] = useState<number | null>(null)
  const [error, setError] = useState('')

  const setRow = (index: number, patch: Partial<AcademyMaterial>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const attachAt = (index: number) => {
    pendingIndex.current = index
    fileRef.current?.click()
  }

  const onFilePicked = async (file: File | undefined) => {
    const index = pendingIndex.current
    pendingIndex.current = null
    if (!file || index == null) return
    setError('')
    setBusyIndex(index)
    try {
      const res = await api.academyUploadMaterial(file)
      const current = rows[index]
      setRow(index, {
        url: res.url,
        title: current.title.trim() || res.filename,
      })
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось загрузить файл')
    } finally {
      setBusyIndex(null)
    }
  }

  return (
    <div className="staff-profile-field academy-material-field">
      <span className="staff-profile-label">Материалы</span>
      {hint ? <p className="academy-field-hint">{hint}</p> : null}
      <input
        ref={fileRef}
        type="file"
        className="academy-material-file-input"
        accept={ACADEMY_MATERIAL_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          void onFilePicked(file)
        }}
      />
      <div className="academy-material-editor">
        {rows.map((row, index) => {
          const file = isAcademyMaterialFile(row.url)
          const filename = academyMaterialFilePath(row.url)?.split('/').pop() || row.title || 'Документ'
          const busy = busyIndex === index
          return (
            <div key={index} className="academy-material-row">
              <input
                className="control academy-material-title"
                placeholder="Название"
                value={row.title}
                onChange={(e) => setRow(index, { title: e.target.value })}
              />
              <button
                type="button"
                className="btn-icon academy-material-remove"
                aria-label="Убрать материал"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <X size={16} />
              </button>
              {file ? (
                <div className="academy-material-file">
                  <FileText size={14} aria-hidden />
                  <span className="academy-material-file-name" title={filename}>
                    {filename}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => attachAt(index)}>
                    {busy ? '…' : 'Заменить'}
                  </button>
                </div>
              ) : (
                <input
                  className="control academy-material-url"
                  placeholder="https://… — пост на форуме или VK"
                  value={row.url}
                  onChange={(e) => setRow(index, { url: e.target.value })}
                />
              )}
              {!file ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm academy-material-attach"
                  disabled={busy}
                  onClick={() => attachAt(index)}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                  {busy ? 'Загрузка…' : 'Прикрепить файл'}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      {error ? <p className="academy-field-hint academy-material-error">{error}</p> : null}
      {rows.length < 8 ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm academy-material-add"
          onClick={() => onChange([...rows, { title: '', url: '' }])}
        >
          <Plus size={14} />
          Добавить материал
        </button>
      ) : null}
    </div>
  )
}
