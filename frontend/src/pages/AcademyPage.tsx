import { useEffect, useMemo, useState } from 'react'
import { GraduationCap, Plus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  api,
  ApiError,
  type AcademyAssignment,
  type AcademyCadet,
  type AcademyReviewItem,
  type AcademySummary,
  type AcademyTemplate,
  type StaffMember,
} from '../api'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Checkbox } from '../components/ui/Checkbox'
import { Select } from '../components/ui/Select'
import { ModalViewport } from '../components/ui/ModalViewport'
import { useAuth } from '../context/AuthContext'
import { ASSIGN_STAFF_MIN_LEVEL } from '../lib/accessLevels'
import {
  ACADEMY_DIRECTIONS,
  ACADEMY_STAGES,
  academyCanEnrollLevel,
  academyDueOverdue,
  academyReportLabel,
  academyStageChipClass,
  academyStatusChipClass,
  formatAcademyDate,
  formatAcademyDateTime,
} from '../lib/academy'
import { staffLabel } from '../lib/staff'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

type Tab = 'roster' | 'reviews' | 'tasks' | 'reserve'
type RosterFilter = 'all' | 'theory' | 'mentored' | 'practice' | 'attestation' | 'overdue' | 'no_mentor'

function errText(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message
  return 'Не удалось загрузить академию'
}

function parseLinks(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
}

export function AcademyPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab | null>(null)
  const [filter, setFilter] = useState<RosterFilter>('all')
  const [summary, setSummary] = useState<AcademySummary | null>(null)
  const [roster, setRoster] = useState<AcademyCadet[]>([])
  const [reserve, setReserve] = useState<AcademyCadet[]>([])
  const [mine, setMine] = useState<AcademyCadet[]>([])
  const [assignments, setAssignments] = useState<AcademyAssignment[]>([])
  const [reviews, setReviews] = useState<AcademyReviewItem[]>([])
  const [templates, setTemplates] = useState<AcademyTemplate[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [mentors, setMentors] = useState<{ vk_id: number; nickname: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [submitFor, setSubmitFor] = useState<AcademyAssignment | null>(null)
  const [saving, setSaving] = useState(false)

  const canLead = Boolean(summary?.is_lead) || (user?.access_level ?? 0) >= 3
  const canEnroll = Boolean(summary?.can_enroll) || (user?.access_level ?? 0) >= ASSIGN_STAFF_MIN_LEVEL
  const canAssign = canLead || mine.length > 0
  const activeTab = tab ?? 'tasks'

  const load = async () => {
    setError(null)
    try {
      const [sum, ros, my, asg, rev, ment] = await Promise.all([
        api.academySummary(),
        api.academyRoster(false),
        api.academyMine(),
        api.academyAssignments(),
        api.academyReviews(),
        api.academyMentors(),
      ])
      setSummary(sum)
      setRoster(ros.members)
      setMine(my.members)
      setAssignments(asg.assignments)
      setReviews(rev.items)
      setMentors(ment.mentors)
      if (sum.is_lead || sum.can_enroll) {
        const [res, st, tpls] = await Promise.all([
          api.academyReserve(),
          api.staff(),
          api.academyTemplates(),
        ])
        setReserve(res.members)
        setStaff(st.members)
        setTemplates(tpls.templates)
      } else if (my.members.length > 0) {
        const tpls = await api.academyTemplates()
        setTemplates(tpls.templates)
      }
      setTab((current) => {
        if (current) return current
        if (sum.is_lead) return 'roster'
        if (sum.is_mentor || my.members.length > 0) return 'reviews'
        return 'tasks'
      })
    } catch (e: unknown) {
      setError(errText(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const candidates = useMemo(
    () => staff.filter((m) => academyCanEnrollLevel(m.access_level) && !m.is_academy),
    [staff],
  )

  const filteredRoster = useMemo(() => {
    return roster.filter((c) => {
      if (c.status === 'graduated' || c.status === 'expelled') return false
      if (filter === 'all') return true
      if (filter === 'theory') return c.stage === 'theory'
      if (filter === 'mentored') return c.stage === 'mentored'
      if (filter === 'practice') return c.stage === 'practice'
      if (filter === 'attestation') return c.stage === 'attestation'
      if (filter === 'overdue') return (c.metrics?.overdue ?? 0) > 0
      if (filter === 'no_mentor') return !c.mentor_vk_id
      return true
    })
  }, [roster, filter])

  const myAssignments = useMemo(() => {
    const vk = user?.vk_id ?? 0
    return assignments.filter((a) => a.assignee_vk_ids.includes(vk))
  }, [assignments, user?.vk_id])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'roster', label: 'Состав' },
    { id: 'reviews', label: 'На проверке' },
    { id: 'tasks', label: 'Мои задания' },
    ...(canLead ? [{ id: 'reserve' as const, label: 'Резерв' }] : []),
  ]

  return (
    <div className="page-stack">
      <PageHeader
        section="Работа"
        title="Академия"
        icon={GraduationCap}
        shrink
        subtitle={
          summary
            ? `${summary.cadets} академиков · ${summary.pending_reviews} на проверке`
            : 'Подготовка управленца сферы'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canAssign ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAssignOpen(true)}>
                Выдать задание
              </button>
            ) : null}
            {canEnroll ? (
              <button type="button" className="btn btn-gold btn-sm" onClick={() => setEnrollOpen(true)}>
                <Plus size={16} />
                Зачислить
              </button>
            ) : null}
          </div>
        }
      />

      <div className="sphere-tabs" role="tablist" aria-label="Академия">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeTab === item.id}
            className={activeTab === item.id ? 'sphere-tab sphere-tab--active' : 'sphere-tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <Alert className="shrink-0">{error}</Alert>}

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : activeTab === 'roster' ? (
        <>
          <div className="academy-stats">
            <div className="academy-stat">
              <div className="academy-stat-value">{summary?.cadets ?? 0}</div>
              <div className="academy-stat-label">Академиков</div>
            </div>
            <div className="academy-stat">
              <div className="academy-stat-value">{summary?.pending_reviews ?? 0}</div>
              <div className="academy-stat-label">На проверке</div>
            </div>
            <div className="academy-stat">
              <div className="academy-stat-value">{summary?.ready_for_attestation ?? 0}</div>
              <div className="academy-stat-label">К аттестации</div>
            </div>
            <div className="academy-stat">
              <div className="academy-stat-value">{summary?.graduates_month ?? 0}</div>
              <div className="academy-stat-label">Выпусков за месяц</div>
            </div>
          </div>
          <div className="sphere-tabs" role="tablist" aria-label="Фильтр состава">
            {(
              [
                ['all', 'Все'],
                ['theory', 'Теория'],
                ['mentored', 'С наставником'],
                ['practice', 'Практика'],
                ['attestation', 'Аттестация'],
                ['overdue', 'Просрочки'],
                ['no_mentor', 'Без наставника'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? 'sphere-tab sphere-tab--active' : 'sphere-tab'}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <RosterList rows={filteredRoster} />
          {canLead ? (
            <TemplateEditor
              templates={templates}
              onSaved={load}
              onError={setError}
            />
          ) : null}
        </>
      ) : activeTab === 'reviews' ? (
        <ReviewQueue items={reviews} onChanged={load} onError={setError} />
      ) : activeTab === 'tasks' ? (
        <MyTasks items={myAssignments} onSubmit={setSubmitFor} />
      ) : (
        <RosterList rows={reserve} reserve />
      )}

      <EnrollModal
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        candidates={candidates}
        mentors={mentors}
        saving={saving}
        onSubmit={async (payload) => {
          setSaving(true)
          try {
            await api.academyEnroll(payload)
            setEnrollOpen(false)
            await load()
          } catch (e: unknown) {
            setError(errText(e))
          } finally {
            setSaving(false)
          }
        }}
      />

      <AssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        templates={templates.filter((t) => t.is_active)}
        people={canLead ? roster.filter((c) => c.status === 'active') : mine}
        canLead={canLead}
        saving={saving}
        onSubmit={async (payload) => {
          setSaving(true)
          try {
            await api.academyCreateAssignment(payload)
            setAssignOpen(false)
            await load()
          } catch (e: unknown) {
            setError(errText(e))
          } finally {
            setSaving(false)
          }
        }}
      />

      <SubmitModal
        assignment={submitFor}
        onClose={() => setSubmitFor(null)}
        onSubmit={async (body, links) => {
          if (!submitFor) return
          await api.academySubmitReport(submitFor.id, { body, proof_urls: links })
          setSubmitFor(null)
          await load()
        }}
      />
    </div>
  )
}

function RosterList({ rows, reserve }: { rows: AcademyCadet[]; reserve?: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="staff-registry-empty">
        {reserve ? 'В кадровом резерве пока никого нет.' : 'В составе пока никого нет.'}
      </div>
    )
  }
  return (
    <div className={`staff-registry academy-registry${reserve ? ' academy-registry--reserve' : ''}`}>
      <div className="staff-registry-head">
        <span className="staff-registry-th staff-col-num">№</span>
        <span className="staff-registry-th staff-col-nick">Академик</span>
        <span className="staff-registry-th academy-col-dir">Направление</span>
        <span className="staff-registry-th academy-col-mentor">Наставник</span>
        {reserve ? (
          <span className="staff-registry-th academy-col-rec">Рекомендация</span>
        ) : (
          <>
            <span className="staff-registry-th academy-col-stage">Этап</span>
            <span className="staff-registry-th academy-col-tasks">Задания</span>
            <span className="staff-registry-th academy-col-overdue">Просрочки</span>
          </>
        )}
      </div>
      <div className="staff-registry-body ll-scroll">
        {rows.map((c, i) => {
          const overdue = (c.metrics?.overdue ?? 0) > 0
          return (
            <div key={c.id} className="staff-registry-row">
              <div className="staff-col-num">{i + 1}</div>
              <div className="staff-col-nick">
                <span className="staff-avatar-wrap">
                  <img src={c.avatar_url || DEFAULT_AVATAR} alt="" className="staff-avatar" loading="lazy" />
                </span>
                <Link to={`/academy/${c.vk_id}`} className="staff-nick staff-nick-link no-underline">
                  {c.nickname}
                </Link>
              </div>
              <div className="academy-col-dir">{c.direction_label}</div>
              <div className="academy-col-mentor">{c.mentor_name || '—'}</div>
              {reserve ? (
                <div className="academy-col-rec">{c.recommendation_label}</div>
              ) : (
                <>
                  <div className="academy-col-stage">
                    <span className={academyStageChipClass(c.stage, c.status, overdue)}>{c.stage_label}</span>
                  </div>
                  <div className="academy-col-tasks">
                    {c.metrics?.assignments_done ?? 0}/{c.metrics?.assignments_total ?? 0}
                  </div>
                  <div className={`academy-col-overdue${overdue ? ' academy-col-overdue--warn' : ''}`}>
                    {c.metrics?.overdue ?? 0}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReviewQueue({
  items,
  onChanged,
  onError,
}: {
  items: AcademyReviewItem[]
  onChanged: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, { score: string; comment: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  if (items.length === 0) {
    return <div className="staff-registry-empty">Очередь проверки пуста.</div>
  }

  const act = async (item: AcademyReviewItem, action: string) => {
    const key = `${item.assignment_id}-${item.vk_id}`
    const draft = drafts[key] || { score: '', comment: '' }
    if (action === 'accept' && draft.score === '') {
      onError('Укажите оценку, чтобы принять задание')
      return
    }
    setBusy(key)
    try {
      await api.academyReviewReport(item.assignment_id, item.vk_id, {
        action,
        score: draft.score === '' ? undefined : Number(draft.score),
        comment: draft.comment.trim(),
      })
      await onChanged()
    } catch (e: unknown) {
      onError(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="academy-queue">
      {items.map((item) => {
        const key = `${item.assignment_id}-${item.vk_id}`
        const draft = drafts[key] || { score: '', comment: '' }
        return (
          <article key={key} className="academy-review-card">
            <div className="academy-review-head">
              <Link to={`/academy/${item.vk_id}`} className="academy-review-nick no-underline">
                {item.nickname}
              </Link>
              <h2 className="academy-review-title">{item.title}</h2>
              <span className={academyStatusChipClass(item.status)}>{item.status_label}</span>
              <span className="academy-task-meta">{formatAcademyDateTime(item.submitted_at)}</span>
            </div>
            {item.body ? <p className="academy-review-body">{item.body}</p> : null}
            {item.proof_urls.length > 0 ? (
              <ul className="academy-review-links">
                {item.proof_urls.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="academy-review-actions">
              <div>
                <label className="staff-profile-label" htmlFor={`score-${key}`}>
                  Оценка 0…{item.max_points}
                </label>
                <input
                  id={`score-${key}`}
                  className="control"
                  inputMode="numeric"
                  value={draft.score}
                  onChange={(e) =>
                    setDrafts((cur) => ({ ...cur, [key]: { ...draft, score: e.target.value } }))
                  }
                />
              </div>
              <div>
                <label className="staff-profile-label" htmlFor={`comment-${key}`}>
                  Комментарий
                </label>
                <input
                  id={`comment-${key}`}
                  className="control"
                  value={draft.comment}
                  onChange={(e) =>
                    setDrafts((cur) => ({ ...cur, [key]: { ...draft, comment: e.target.value } }))
                  }
                />
              </div>
              <div className="academy-review-buttons">
                <button
                  type="button"
                  className="btn btn-gold"
                  disabled={busy === key}
                  onClick={() => void act(item, 'accept')}
                >
                  Принять
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy === key}
                  onClick={() => void act(item, 'revision')}
                >
                  Доработка
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy === key}
                  onClick={() => void act(item, 'reject')}
                >
                  Отклонить
                </button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function MyTasks({
  items,
  onSubmit,
}: {
  items: AcademyAssignment[]
  onSubmit: (item: AcademyAssignment) => void
}) {
  if (items.length === 0) {
    return <div className="staff-registry-empty">Вам пока не выдавали задания.</div>
  }
  return (
    <div className="academy-queue">
      {items.map((item) => {
        const status = item.viewer_status || 'open'
        const overdue = academyDueOverdue(item.due_at, status)
        const canSubmit = status !== 'accepted'
        return (
          <article key={item.id} className="academy-task-card">
            <div className="academy-task-head">
              <h2 className="academy-task-title">{item.title}</h2>
              <span className={academyStatusChipClass(status)}>
                {item.viewer_status_label || academyReportLabel(status)}
              </span>
              <span className={`academy-task-meta${overdue ? ' academy-task-meta--warn' : ''}`}>
                до {formatAcademyDate(item.due_at)}
              </span>
            </div>
            {item.description ? <p className="academy-task-desc">{item.description}</p> : null}
            {canSubmit ? (
              <button type="button" className="btn btn-gold btn-sm mt-3" onClick={() => onSubmit(item)}>
                Сдать
              </button>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

function EnrollModal({
  open,
  onClose,
  candidates,
  mentors,
  saving,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  candidates: StaffMember[]
  mentors: { vk_id: number; nickname: string }[]
  saving: boolean
  onSubmit: (body: { vk_id: number; direction: string; mentor_vk_id: number | null }) => Promise<void>
}) {
  const [vkId, setVkId] = useState('')
  const [direction, setDirection] = useState('general')
  const [mentor, setMentor] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    setVkId('')
    setDirection('general')
    setMentor('')
    setFormError('')
  }, [open])

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div className="glass-card academy-modal modal-pop relative z-10 flex w-full flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="m-0 text-lg font-semibold">Зачислить в Академию</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3 ll-scroll">
          <div>
            <label className="staff-profile-label">Кто</label>
            <Select
              value={vkId}
              onChange={setVkId}
              options={[
                { value: '', label: 'Выберите следящего' },
                ...candidates.map((m) => ({ value: String(m.vk_id), label: staffLabel(m) })),
              ]}
            />
          </div>
          <div>
            <label className="staff-profile-label">Направление</label>
            <Select
              value={direction}
              onChange={setDirection}
              options={ACADEMY_DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))}
            />
          </div>
          <div>
            <label className="staff-profile-label">Наставник</label>
            <Select
              value={mentor}
              onChange={setMentor}
              options={[
                { value: '', label: 'Не назначен' },
                ...mentors.map((m) => ({ value: String(m.vk_id), label: m.nickname })),
              ]}
            />
          </div>
          <p className="staff-profile-hint m-0">Ник и должность не меняются.</p>
          {formError ? <Alert>{formError}</Alert> : null}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[0.06]">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-gold"
            disabled={saving}
            onClick={() => {
              if (!vkId) {
                setFormError('Выберите, кого зачислить')
                return
              }
              void onSubmit({
                vk_id: Number(vkId),
                direction,
                mentor_vk_id: mentor ? Number(mentor) : null,
              })
            }}
          >
            Зачислить
          </button>
        </div>
      </div>
    </ModalViewport>
  )
}

function AssignModal({
  open,
  onClose,
  templates,
  people,
  canLead,
  saving,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  templates: AcademyTemplate[]
  people: AcademyCadet[]
  canLead: boolean
  saving: boolean
  onSubmit: (body: {
    template_id: number
    assignee_vk_ids?: number[]
    all_active?: boolean
    all_mentees?: boolean
  }) => Promise<void>
}) {
  const [templateId, setTemplateId] = useState('')
  const [target, setTarget] = useState('')
  const [confirmAll, setConfirmAll] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    setTemplateId('')
    setTarget('')
    setConfirmAll(false)
    setFormError('')
  }, [open])

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div className="glass-card academy-modal modal-pop relative z-10 flex w-full flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="m-0 text-lg font-semibold">Выдать задание</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="staff-profile-label">Шаблон</label>
            <Select
              value={templateId}
              onChange={setTemplateId}
              options={[
                { value: '', label: 'Выберите шаблон' },
                ...templates.map((t) => ({ value: String(t.id), label: `${t.title} · ${t.stage_label}` })),
              ]}
            />
          </div>
          <div>
            <label className="staff-profile-label">Кому</label>
            <Select
              value={target}
              onChange={setTarget}
              options={[
                { value: '', label: 'Выберите академика' },
                { value: 'mine', label: 'Всем моим подопечным' },
                ...(canLead ? [{ value: 'all', label: 'Всем активным' }] : []),
                ...people.map((c) => ({ value: String(c.vk_id), label: c.nickname })),
              ]}
            />
          </div>
          {target === 'all' ? (
            <label className="ui-checkbox-label staff-profile-check">
              <Checkbox checked={confirmAll} onChange={setConfirmAll} />
              Да, выдать всем активным академикам
            </label>
          ) : null}
          {formError ? <Alert>{formError}</Alert> : null}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[0.06]">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-gold"
            disabled={saving}
            onClick={() => {
              if (!templateId) {
                setFormError('Выберите шаблон')
                return
              }
              if (!target) {
                setFormError('Выберите, кому выдать задание')
                return
              }
              if (target === 'all' && !confirmAll) {
                setFormError('Подтвердите выдачу всем активным')
                return
              }
              void onSubmit({
                template_id: Number(templateId),
                all_active: target === 'all',
                all_mentees: target === 'mine',
                assignee_vk_ids: target === 'all' || target === 'mine' ? undefined : [Number(target)],
              })
            }}
          >
            Выдать
          </button>
        </div>
      </div>
    </ModalViewport>
  )
}

function SubmitModal({
  assignment,
  onClose,
  onSubmit,
}: {
  assignment: AcademyAssignment | null
  onClose: () => void
  onSubmit: (body: string, links: string[]) => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [links, setLinks] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!assignment) return
    setBody('')
    setLinks('')
    setFormError('')
  }, [assignment])

  return (
    <ModalViewport open={Boolean(assignment)} onBackdropClick={onClose}>
      <div className="glass-card academy-modal modal-pop relative z-10 flex w-full flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="m-0 text-lg font-semibold">Сдать: {assignment?.title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="staff-profile-label" htmlFor="academy-submit-body">
              Текст отчёта
            </label>
            <textarea
              id="academy-submit-body"
              className="control w-full"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div>
            <label className="staff-profile-label" htmlFor="academy-submit-links">
              Ссылки
            </label>
            <textarea
              id="academy-submit-links"
              className="control w-full"
              placeholder="https://…"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
            />
          </div>
          {formError ? <Alert>{formError}</Alert> : null}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[0.06]">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-gold"
            disabled={saving}
            onClick={() => {
              const proof = parseLinks(links)
              if (!body.trim() && proof.length === 0) {
                setFormError('Напишите текст или добавьте ссылку')
                return
              }
              setSaving(true)
              setFormError('')
              void onSubmit(body.trim(), proof)
                .catch((e: unknown) => setFormError(errText(e)))
                .finally(() => setSaving(false))
            }}
          >
            Отправить
          </button>
        </div>
      </div>
    </ModalViewport>
  )
}

function TemplateEditor({
  templates,
  onSaved,
  onError,
}: {
  templates: AcademyTemplate[]
  onSaved: () => Promise<void>
  onError: (msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState('theory')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm w-fit" onClick={() => setOpen(true)}>
        Шаблоны заданий
      </button>
    )
  }

  return (
    <div className="academy-manage">
      <h2 className="academy-manage-title">Шаблоны заданий</h2>
      <ul className="m-0 mb-3 pl-4 text-sm text-white/70">
        {templates.map((t) => (
          <li key={t.id}>
            {t.title} · {t.stage_label}
          </li>
        ))}
      </ul>
      <div className="academy-form-grid">
        <div>
          <label className="staff-profile-label">Название</label>
          <input className="control w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="staff-profile-label">Этап</label>
          <Select
            value={stage}
            onChange={setStage}
            options={ACADEMY_STAGES.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
        <div className="col-span-full">
          <label className="staff-profile-label">Описание</label>
          <textarea className="control w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn-gold btn-sm"
          disabled={saving || !title.trim()}
          onClick={() => {
            setSaving(true)
            void api
              .academyCreateTemplate({
                title: title.trim(),
                category: stage === 'practice' ? 'practice' : 'theory',
                stage,
                max_points: 10,
                due_days: 3,
                required: true,
                description,
                proof_kinds: ['text', 'link'],
                reviewer_kind: 'mentor',
                is_active: true,
                sort_order: templates.length,
              })
              .then(() => {
                setTitle('')
                setDescription('')
                return onSaved()
              })
              .catch((e: unknown) => onError(errText(e)))
              .finally(() => setSaving(false))
          }}
        >
          Добавить шаблон
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Скрыть
        </button>
      </div>
    </div>
  )
}
