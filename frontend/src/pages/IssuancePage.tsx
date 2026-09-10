import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, ExternalLink, Gift, MoreHorizontal, Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, api, type IssuanceBody, type IssuanceItem, type IssuanceKind } from '../api'
import { PageHeader } from '../components/PageHeader'
import { FieldReq } from '../components/ui/FormField'
import { Alert } from '../components/ui/Alert'
import { PageSkeleton } from '../components/ui/LoadingState'
import { ModalViewport } from '../components/ui/ModalViewport'
import { useAuth } from '../context/AuthContext'
import {
  ISSUANCE_CREATE_MIN_LEVEL,
  formatIssuanceStamp,
  issuanceCheckerList,
  issuanceIssuedByLabel,
  issuanceRawAmount,
  issuanceStatusLabel,
  issuanceTotalPrefix,
} from '../lib/issuance'
import { cn } from '../lib/utils'

const KINDS: { id: IssuanceKind; label: string }[] = [
  { id: 'virts', label: 'Вирты' },
  { id: 'az', label: 'АЗ' },
]

const EMPTY_FORM = {
  role_title: '',
  nickname: '',
  amount: '',
  reason: '',
  proof_url: '',
}

export function IssuancePage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const kindParam = searchParams.get('kind')
  const kind: IssuanceKind = kindParam === 'az' ? 'az' : 'virts'
  const canOpen = (user?.access_level ?? 0) >= ISSUANCE_CREATE_MIN_LEVEL

  const [items, setItems] = useState<IssuanceItem[]>([])
  const [totalLabel, setTotalLabel] = useState('0')
  const [canCreate, setCanCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IssuanceItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [menuId, setMenuId] = useState<number | null>(null)
  const [copied, setCopied] = useState<'all' | number | null>(null)
  const copyTimer = useRef<number | null>(null)

  const pendingVirts = kind === 'virts' ? items.filter((row) => row.status === 'pending') : []

  const markCopied = (key: 'all' | number) => {
    if (copyTimer.current != null) window.clearTimeout(copyTimer.current)
    setCopied(key)
    copyTimer.current = window.setTimeout(() => setCopied(null), 1600)
  }

  const copyText = async (text: string, key: 'all' | number) => {
    try {
      await navigator.clipboard.writeText(text)
      markCopied(key)
    } catch {
      setError('Не удалось скопировать')
    }
  }

  const setKind = (next: IssuanceKind) => {
    setMenuId(null)
    setCopied(null)
    setSearchParams(next === 'virts' ? {} : { kind: next }, { replace: true })
  }

  const load = ({ silent = false } = {}) => {
    if (!canOpen) {
      setLoading(false)
      return Promise.resolve()
    }
    if (!silent) setLoading(true)
    setError(null)
    return api
      .issuance(kind)
      .then((r) => {
        setItems(r.items)
        setTotalLabel(r.total_issued_label)
        setCanCreate(r.permissions.can_create)
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError || err instanceof Error ? err.message : 'Не удалось загрузить выдачи')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [kind, canOpen])

  useEffect(() => {
    return () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current)
    }
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (row: IssuanceItem) => {
    setEditing(row)
    setForm({
      role_title: row.role_title,
      nickname: row.nickname,
      amount: String(row.amount),
      reason: row.reason,
      proof_url: row.proof_url,
    })
    setFormError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setFormError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    const body: IssuanceBody = {
      kind,
      role_title: form.role_title.trim(),
      nickname: form.nickname.trim(),
      amount: form.amount.trim(),
      reason: form.reason.trim(),
      proof_url: form.proof_url.trim(),
    }
    try {
      if (editing) {
        await api.updateIssuance(editing.id, {
          role_title: body.role_title,
          nickname: body.nickname,
          amount: body.amount,
          reason: body.reason,
          proof_url: body.proof_url,
        })
      } else {
        await api.createIssuance(body)
      }
      closeModal()
      await load({ silent: true })
    } catch (err: unknown) {
      setFormError(err instanceof ApiError || err instanceof Error ? err.message : 'Не удалось сохранить заявку')
    } finally {
      setSaving(false)
    }
  }

  const runRow = async (id: number, fn: () => Promise<unknown>) => {
    setBusyId(id)
    setMenuId(null)
    setError(null)
    try {
      await fn()
      await load({ silent: true })
    } catch (err: unknown) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Не удалось обновить заявку')
    } finally {
      setBusyId(null)
    }
  }

  if (!canOpen) {
    return (
      <div className="page-stack">
        <PageHeader section="Работа" title="Выдачи" icon={Gift} shrink />
        <p className="text-white/40 text-sm">Страница доступна ЗГС и выше.</p>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <PageHeader
        section="Работа"
        title="Выдачи"
        icon={Gift}
        shrink
        subtitle={
          <p className="issuance-total">
            {issuanceTotalPrefix(kind)}: <strong>{totalLabel}</strong>
          </p>
        }
        actions={
          kind === 'virts' || canCreate ? (
            <div className="issuance-header-actions">
              {kind === 'virts' ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm shrink-0"
                  disabled={pendingVirts.length === 0}
                  title="Никнейм // Вирты — для чекера"
                  onClick={() => void copyText(issuanceCheckerList(pendingVirts), 'all')}
                >
                  {copied === 'all' ? <Check size={14} /> : <Copy size={14} />}
                  {copied === 'all' ? 'Скопировано' : 'Скопировать все ники'}
                </button>
              ) : null}
              {canCreate ? (
                <button type="button" className="btn btn-gold btn-sm shrink-0" onClick={openCreate}>
                  <Plus size={16} />
                  Заявка
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <div className="issuance-tabs" role="tablist" aria-label="Тип выдачи">
        {KINDS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={kind === tab.id}
            className={cn('issuance-tab', kind === tab.id && 'issuance-tab--active')}
            onClick={() => setKind(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <ModalViewport open={modalOpen} onBackdropClick={closeModal}>
        <form
          className="glass-card academy-modal academy-modal--assign modal-pop relative z-10 flex w-full flex-col issuance-modal"
          onSubmit={(e) => void submit(e)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
            <h2 className="m-0 text-lg font-semibold">{editing ? 'Заявка' : 'Новая заявка'}</h2>
          </div>
          <div className="issuance-modal-body">
            <div className="issuance-form-grid">
              <label className="staff-profile-field">
                <span className="staff-profile-label">
                  Должность
                  <FieldReq />
                </span>
                <input
                  className="control w-full"
                  value={form.role_title}
                  onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))}
                  placeholder="Конгрессмен"
                  autoFocus
                />
              </label>
              <label className="staff-profile-field">
                <span className="staff-profile-label">
                  Никнейм
                  <FieldReq />
                </span>
                <input
                  className="control w-full"
                  value={form.nickname}
                  onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                  placeholder="Name_Surname"
                />
              </label>
              <label className="staff-profile-field">
                <span className="staff-profile-label">
                  {kind === 'az' ? 'Сумма, AZ' : 'Сумма, $'}
                  <FieldReq />
                </span>
                <input
                  className="control w-full"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder={kind === 'az' ? '5000' : '70000000'}
                />
              </label>
              <label className="staff-profile-field">
                <span className="staff-profile-label">
                  {kind === 'az' ? 'За что передано' : 'За что выдано'}
                  <FieldReq />
                </span>
                <input
                  className="control w-full"
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Отчёт, баллы, срок…"
                />
              </label>
            </div>
            <label className="staff-profile-field">
              <span className="staff-profile-label">Доказательство</span>
              <input
                className="control w-full"
                value={form.proof_url}
                onChange={(e) => setForm((f) => ({ ...f, proof_url: e.target.value }))}
                placeholder="https://forum.arizona-rp.com/…"
              />
            </label>
            {formError ? <Alert>{formError}</Alert> : null}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[0.06]">
            <button type="button" className="btn btn-secondary" onClick={closeModal}>
              Отмена
            </button>
            <button type="submit" className="btn btn-gold" disabled={saving}>
              {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </ModalViewport>

      {loading ? (
        <PageSkeleton variant="registry" label="Загрузка выдач" />
      ) : items.length === 0 ? (
        <div className="staff-registry-empty">Нет заявок в этом разделе</div>
      ) : (
        <div className="staff-registry issuance-registry">
          <div className="staff-registry-head">
            <span>Дата</span>
            <span>Статус</span>
            <span>Никнейм</span>
            <span>{kind === 'az' ? 'АЗ' : 'Вирты'}</span>
            <span>За что</span>
            <span>Док-ва</span>
            <span>Кто</span>
            <span />
          </div>
          <div className="staff-registry-body">
            {items.map((row) => (
              <div
                key={row.id}
                className={cn(
                  'staff-registry-row',
                  row.status === 'rejected' && 'issuance-row--rejected',
                  row.status === 'issued' && 'issuance-row--issued',
                )}
              >
                <IssuanceStamp iso={row.created_at} />
                <span className="issuance-col-status">
                  <span
                    className={cn(
                      'issuance-status',
                      row.status === 'issued' && 'issuance-status--issued',
                      row.status === 'rejected' && 'issuance-status--rejected',
                    )}
                  >
                    {issuanceStatusLabel(row.status, kind)}
                  </span>
                </span>
                <span className="issuance-col-person">
                  <span className="staff-nick">{row.nickname}</span>
                  <span className="issuance-role" title={row.role_title}>
                    {row.role_title}
                  </span>
                </span>
                <span className="issuance-col-amount">
                  <span>{row.amount_label}</span>
                  {kind === 'virts' ? (
                    <button
                      type="button"
                      className={cn('issuance-copy-btn', copied === row.id && 'is-copied')}
                      title="Скопировать сумму"
                      aria-label={`Скопировать ${issuanceRawAmount(row.amount)}`}
                      onClick={() => void copyText(issuanceRawAmount(row.amount), row.id)}
                    >
                      {copied === row.id ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  ) : null}
                </span>
                <span className="issuance-col-reason">
                  <span className="issuance-reason" title={row.reason}>
                    {row.reason}
                  </span>
                </span>
                <span className="issuance-col-proof">
                  {row.proof_url ? (
                    <a
                      className="issuance-proof"
                      href={row.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Открыть доказательство"
                      aria-label="Доказательство"
                    >
                      <ExternalLink size={15} />
                    </a>
                  ) : (
                    <span className="issuance-who-empty">—</span>
                  )}
                </span>
                <span className="issuance-col-who">
                  <WhoLine label="Подал" name={row.created_by_name} vkId={row.created_by_vk_id} />
                  <WhoLine
                    label={issuanceIssuedByLabel(kind)}
                    name={row.issued_by_name}
                    vkId={row.issued_by_vk_id}
                  />
                </span>
                <span className="issuance-col-actions">
                  <IssuanceRowMenu
                    row={row}
                    open={menuId === row.id}
                    busy={busyId === row.id}
                    onToggle={() => setMenuId((id) => (id === row.id ? null : row.id))}
                    onClose={() => setMenuId(null)}
                    onIssue={() => void runRow(row.id, () => api.issueIssuance(row.id))}
                    onUnissue={() => void runRow(row.id, () => api.unissueIssuance(row.id))}
                    onEdit={() => {
                      setMenuId(null)
                      openEdit(row)
                    }}
                    onReject={() => void runRow(row.id, () => api.rejectIssuance(row.id))}
                    onUnreject={() => void runRow(row.id, () => api.unrejectIssuance(row.id))}
                    onDelete={() => void runRow(row.id, () => api.deleteIssuance(row.id))}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function IssuanceStamp({ iso }: { iso: string | null }) {
  const stamp = formatIssuanceStamp(iso)
  return (
    <span className="issuance-col-date">
      <time dateTime={iso ?? undefined} className="issuance-stamp">
        <span className="issuance-stamp-date">{stamp.date}</span>
        {stamp.time ? <span className="issuance-stamp-time">{stamp.time}</span> : null}
      </time>
    </span>
  )
}

function WhoLine({
  label,
  name,
  vkId,
}: {
  label: string
  name: string | null
  vkId?: number | null
}) {
  const real = Boolean(name && !/^id\d+$/i.test(name))
  const text = real ? name : vkId ? String(vkId) : '—'
  return (
    <span className="issuance-who-line">
      <span className="issuance-who-label">{label}</span>
      <span className={cn('issuance-who-name', real && 'is-nick', !real && !vkId && 'is-empty')}>
        {text}
      </span>
    </span>
  )
}

function IssuanceRowMenu({
  row,
  open,
  busy,
  onToggle,
  onClose,
  onIssue,
  onUnissue,
  onEdit,
  onReject,
  onUnreject,
  onDelete,
}: {
  row: IssuanceItem
  open: boolean
  busy: boolean
  onToggle: () => void
  onClose: () => void
  onIssue: () => void
  onUnissue: () => void
  onEdit: () => void
  onReject: () => void
  onUnreject: () => void
  onDelete: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const items = [
    row.permissions.can_issue
      ? { key: 'issue', label: row.kind === 'az' ? 'Передать ГА/ЗГА' : 'Выдать', onClick: onIssue }
      : null,
    row.permissions.can_unissue
      ? {
          key: 'unissue',
          label: row.kind === 'az' ? 'Снять передачу' : 'Снять выдачу',
          onClick: onUnissue,
        }
      : null,
    row.permissions.can_unreject ? { key: 'unreject', label: 'Снять отклонение', onClick: onUnreject } : null,
    row.permissions.can_edit ? { key: 'edit', label: 'Изменить', onClick: onEdit } : null,
    row.permissions.can_reject ? { key: 'reject', label: 'Отклонить', onClick: onReject, danger: true } : null,
    row.permissions.can_delete ? { key: 'delete', label: 'Удалить', onClick: onDelete, danger: true } : null,
  ].filter((item): item is { key: string; label: string; onClick: () => void; danger?: boolean } => item != null)

  const syncMenuPosition = useCallback(() => {
    const root = rootRef.current
    const menu = menuRef.current
    if (!root || !menu) return
    const rect = root.getBoundingClientRect()
    const menuH = menu.offsetHeight || items.length * 36 + 12
    const menuW = Math.max(menu.offsetWidth, 184)
    const margin = 8
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const flipUp = spaceBelow < menuH && rect.top > spaceBelow
    const top = flipUp ? rect.top - menuH - 4 : rect.bottom + 4
    const left = Math.min(Math.max(margin, rect.right - menuW), window.innerWidth - menuW - margin)
    menu.style.top = `${Math.max(margin, top)}px`
    menu.style.left = `${left}px`
  }, [items.length])

  useLayoutEffect(() => {
    if (!open) return
    syncMenuPosition()
  }, [open, syncMenuPosition])

  useEffect(() => {
    if (!open) return
    let raf = 0
    const onReposition = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(syncMenuPosition)
    }
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open, syncMenuPosition])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (items.length === 0) return <span className="issuance-who-empty">—</span>

  const menu =
    open && typeof document !== 'undefined' ? (
      <div className="issuance-menu-list issuance-menu-list--portal" role="menu" ref={menuRef}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className={cn('issuance-menu-item', item.danger && 'issuance-menu-item--danger')}
            disabled={busy}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </div>
    ) : null

  return (
    <div className="issuance-menu" ref={rootRef}>
      <button
        type="button"
        className="staff-settings-btn"
        title="Действия"
        aria-label="Действия"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy}
        onClick={onToggle}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
