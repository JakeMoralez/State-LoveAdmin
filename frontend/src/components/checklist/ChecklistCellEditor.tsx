import { useEffect, useState } from 'react'
import { Check, ImagePlus, Images, Loader2, Video, X } from 'lucide-react'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'
import { MOBILE_NAV_QUERY, useMediaQuery } from '../../hooks/useMediaQuery'

export type ChecklistCellData = {
  proof_urls?: string[]
  proof_url: string | null
  proof_note: string
  proof_video_url?: string | null
  proof_gallery?: boolean
  proof_gallery_url?: string | null
  proof_image_count?: number
  done: boolean
  can_edit?: boolean
}

function galleryIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const match = url.match(/\/uploads\/galleries\/([a-f0-9]{32})/)
  return match?.[1] ?? null
}

function absUrl(url: string): string {
  return url.startsWith('http') ? url : `${window.location.origin}${url}`
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function videoLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('youtube') || host === 'youtu.be') return 'YouTube'
    if (host.includes('vk.com') || host.includes('vkvideo')) return 'VK Видео'
    if (host.includes('rutube')) return 'Rutube'
    if (host.includes('twitch')) return 'Twitch'
    return 'Видео'
  } catch {
    return 'Видео'
  }
}

export function ChecklistCellEditor({
  cell,
  disabled,
  onSave,
}: {
  cell: ChecklistCellData
  disabled: boolean
  onSave: (patch: {
    proof_urls?: string[]
    proof_url?: string | null
    proof_note?: string
    proof_video_url?: string | null
  }) => Promise<void>
}) {
  const { toast } = useToast()
  const [note, setNote] = useState(cell.proof_note)
  const [galleryUrl, setGalleryUrl] = useState<string | null>(
    cell.proof_gallery ? cell.proof_gallery_url ?? cell.proof_url : null,
  )
  const [imageUrls, setImageUrls] = useState<string[]>(cell.proof_urls ?? [])
  const [imageCount, setImageCount] = useState(cell.proof_image_count ?? cell.proof_urls?.length ?? 0)
  const [videoUrl, setVideoUrl] = useState(cell.proof_video_url ?? '')
  const [videoDraft, setVideoDraft] = useState(cell.proof_video_url ?? '')
  const [uploading, setUploading] = useState(false)
  const isCompact = useMediaQuery(MOBILE_NAV_QUERY)
  const readOnly = disabled

  useEffect(() => {
    setNote(cell.proof_note)
    if (cell.proof_gallery) {
      setGalleryUrl(cell.proof_gallery_url ?? cell.proof_url)
      setImageUrls(cell.proof_urls ?? [])
      setImageCount(cell.proof_image_count ?? cell.proof_urls?.length ?? 0)
    } else {
      setGalleryUrl(null)
      setImageUrls([])
      setImageCount(0)
    }
    const nextVideo = cell.proof_video_url ?? ''
    setVideoUrl(nextVideo)
    setVideoDraft(nextVideo)
  }, [
    cell.proof_note,
    cell.proof_url,
    cell.proof_urls,
    cell.proof_gallery,
    cell.proof_gallery_url,
    cell.proof_image_count,
    cell.proof_video_url,
  ])

  const persist = (
    nextNote: string,
    nextGalleryUrl: string | null,
    nextImageUrls: string[],
    nextVideoUrl: string | null,
  ) => {
    const sameNote = nextNote === cell.proof_note
    const prevGallery = cell.proof_gallery ? cell.proof_gallery_url ?? cell.proof_url : null
    const sameGallery = nextGalleryUrl === prevGallery
    const prevImages = cell.proof_urls ?? []
    const sameImages =
      nextImageUrls.length === prevImages.length && nextImageUrls.every((u, i) => u === prevImages[i])
    const prevVideo = cell.proof_video_url ?? null
    const sameVideo = (nextVideoUrl ?? null) === (prevVideo ?? null)
    if (!sameNote || !sameGallery || !sameImages || !sameVideo) {
      void onSave({
        proof_note: nextNote,
        proof_url: nextGalleryUrl,
        proof_urls: nextGalleryUrl ? nextImageUrls : [],
        proof_video_url: nextVideoUrl,
      })
    }
  }

  const flushNote = () => persist(note, galleryUrl, imageUrls, videoUrl || null)

  const flushVideo = () => {
    const next = normalizeUrl(videoDraft)
    setVideoUrl(next ?? '')
    setVideoDraft(next ?? '')
    persist(note, galleryUrl, imageUrls, next)
  }

  const removeGallery = () => {
    setGalleryUrl(null)
    setImageUrls([])
    setImageCount(0)
    persist(note, null, [], videoUrl || null)
  }

  const removeVideo = () => {
    setVideoUrl('')
    setVideoDraft('')
    persist(note, galleryUrl, imageUrls, null)
  }

  const onUpload = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : []
    if (!files.length) return

    setUploading(true)
    try {
      const existingId = galleryIdFromUrl(galleryUrl)
      const res = await api.uploadGallery(files, existingId ?? undefined)
      setGalleryUrl(res.url)
      setImageUrls(res.images)
      setImageCount(res.count)
      persist(note, res.url, res.images, videoUrl || null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setUploading(false)
    }
  }

  if (readOnly && !cell.done) {
    return <div className="checklist-entry checklist-entry--empty">—</div>
  }

  const galleryHref = galleryUrl ? absUrl(galleryUrl) : null
  const videoHref = videoUrl ? absUrl(videoUrl) : null
  const hasProofs = Boolean(galleryUrl || videoUrl)

  const proofChips = hasProofs ? (
    <div className="checklist-cell-chips">
      {galleryUrl && galleryHref && (
        <div className="checklist-proof-chip checklist-proof-chip--album">
          <a href={galleryHref} target="_blank" rel="noreferrer" className="checklist-proof-chip-link">
            <Images size={13} strokeWidth={2.25} />
            <span>Альбом · {imageCount || imageUrls.length}</span>
          </a>
          {!readOnly && (
            <button type="button" className="checklist-proof-chip-remove" onClick={removeGallery} title="Удалить альбом">
              <X size={11} />
            </button>
          )}
        </div>
      )}
      {videoUrl && videoHref && (
        <div className="checklist-proof-chip checklist-proof-chip--video">
          <a href={videoHref} target="_blank" rel="noreferrer" className="checklist-proof-chip-link">
            <Video size={13} strokeWidth={2.25} />
            <span>{videoLabel(videoUrl)}</span>
          </a>
          {!readOnly && (
            <button type="button" className="checklist-proof-chip-remove" onClick={removeVideo} title="Удалить видео">
              <X size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  ) : null

  const cardClass = [
    'checklist-cell-card',
    cell.done ? 'checklist-cell-card--done' : '',
    isCompact ? 'checklist-cell-card--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cardClass}>
      {!readOnly && !isCompact && proofChips}

      {!readOnly ? (
        <div className="checklist-cell-compose">
          {isCompact ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={flushNote}
              rows={2}
              placeholder="Заметка…"
              className="checklist-cell-note checklist-cell-note--area"
            />
          ) : (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={flushNote}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  flushNote()
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              placeholder="Заметка…"
              className="checklist-cell-note"
            />
          )}
          {isCompact ? proofChips : null}
          <div className="checklist-cell-toolbar">
            <label className="checklist-cell-action" title={galleryUrl ? 'Добавить скрины' : 'Загрузить скрины'}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                multiple
                disabled={uploading}
                onChange={(e) => {
                  void onUpload(e.target.files)
                  e.target.value = ''
                }}
              />
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              <span>{galleryUrl ? 'Ещё' : 'Скрины'}</span>
            </label>
            <input
              value={videoDraft}
              onChange={(e) => setVideoDraft(e.target.value)}
              onBlur={flushVideo}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  flushVideo()
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              placeholder={isCompact ? 'Видео' : 'Ссылка на видео'}
              className="checklist-cell-video-input"
            />
          </div>
        </div>
      ) : (
        <>
          {proofChips}
          {note && <p className="checklist-entry-note">{note}</p>}
        </>
      )}

      {cell.done && (
        <span className="checklist-cell-done" title="Заполнено">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
    </div>
  )
}
