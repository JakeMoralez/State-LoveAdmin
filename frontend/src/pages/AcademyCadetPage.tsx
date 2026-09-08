import { useEffect, useState } from 'react'
import { GraduationCap, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type AcademyAssignment, type AcademyCadetDetail } from '../api'
import { PageHeader } from '../components/PageHeader'
import { AssignmentMaterials } from '../components/academy/AssignmentMaterials'
import { Alert } from '../components/ui/Alert'
import { DatePicker } from '../components/ui/DatePicker'
import { Select } from '../components/ui/Select'
import { ModalViewport } from '../components/ui/ModalViewport'
import {
  ACADEMY_DIRECTIONS,
  ACADEMY_EVENT_LABELS,
  ACADEMY_STAGES,
  academyDueOverdue,
  academyProgressPct,
  academyReportLabel,
  academyStageChipClass,
  academyStatusChipClass,
  formatAcademyDate,
} from '../lib/academy'
import { useAuth } from '../context/AuthContext'
import { ASSIGN_STAFF_MIN_LEVEL } from '../lib/accessLevels'
import { PageSkeleton } from '../components/ui/LoadingState'

const DEFAULT_AVATAR = 'https://vk.com/images/camera_100.png'

function errText(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message
  return 'Не удалось открыть карточку'
}

function academyEventText(ev: {
  actor_name: string
  action: string
  detail?: Record<string, unknown> | null
}): string {
  const bits = [
    ev.actor_name,
    ACADEMY_EVENT_LABELS[ev.action] || ev.action,
    ev.detail?.title ? `«${String(ev.detail.title)}»` : '',
    ev.detail?.score != null ? `— ${String(ev.detail.score)}` : '',
    typeof ev.detail?.text === 'string' ? `— ${ev.detail.text}` : '',
    typeof ev.detail?.comment === 'string' && ev.detail.comment ? `— ${ev.detail.comment}` : '',
  ]
  return bits.filter(Boolean).join(' ').replace(/\s+—/g, ' —')
}

function formatHistoryStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function parseLinks(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
}

export function AcademyCadetPage() {
  const { vkId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const id = Number(vkId)
  const [data, setData] = useState<AcademyCadetDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [mentors, setMentors] = useState<{ vk_id: number; nickname: string }[]>([])
  const [direction, setDirection] = useState('general')
  const [stage, setStage] = useState('theory')
  const [mentor, setMentor] = useState('')
  const [endAt, setEndAt] = useState<string | null>(null)
  const [status, setStatus] = useState('active')
  const [graduateOpen, setGraduateOpen] = useState(false)
  const [submitFor, setSubmitFor] = useState<AcademyAssignment | null>(null)

  const load = () => {
    if (!id) return
    setError(null)
    api
      .academyCadet(id)
      .then((row) => {
        setData(row)
        setDirection(row.direction)
        setStage(row.stage)
        setMentor(row.mentor_vk_id ? String(row.mentor_vk_id) : '')
        setEndAt(row.expected_end_at?.slice(0, 10) || null)
        setStatus(row.status === 'graduated' || row.status === 'expelled' ? row.status : row.status)
      })
      .catch((e: unknown) => setError(errText(e)))
  }

  useEffect(() => {
    load()
    api.academyMentors().then((r) => setMentors(r.mentors)).catch(() => undefined)
  }, [id])

  if (!id) {
    navigate('/academy')
    return null
  }

  const saveManage = async () => {
    if (!data) return
    setSaving(true)
    try {
      await api.academyPatchCadet(id, {
        direction,
        stage,
        mentor_vk_id: mentor ? Number(mentor) : undefined,
        clear_mentor: !mentor,
        expected_end_at: endAt,
        clear_expected_end: !endAt,
        status: status === 'graduated' ? undefined : status,
      })
      load()
    } catch (e: unknown) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const m = data?.metrics
  const progress = academyProgressPct(m?.stage_required_done ?? 0, m?.stage_required_total ?? 0)

  return (
    <div className="page-stack">
      <PageHeader
        section="Академия"
        title={data?.nickname || 'Академик'}
        icon={GraduationCap}
        back={{ href: '/academy', label: 'К составу' }}
        subtitle={data ? `${data.display_status} · ${data.direction_label}` : undefined}
      />
      {error && <Alert>{error}</Alert>}
      {!data ? (
        <PageSkeleton variant="detail" label="Загрузка карточки" />
      ) : (
        <>
          <div className="academy-profile-head">
            <img src={data.avatar_url || DEFAULT_AVATAR} alt="" className="academy-profile-avatar" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{data.nickname}</strong>
                <span className={academyStageChipClass(data.stage, data.status, (m?.overdue ?? 0) > 0)}>
                  {data.stage_label}
                </span>
              </div>
              <p className="academy-profile-meta">
                {data.direction_label} · наставник {data.mentor_name || 'не назначен'} · с{' '}
                {formatAcademyDate(data.enrolled_at)}
              </p>
              <div
                className="academy-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label="Прогресс этапа"
              >
                <div className="academy-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <dl className="academy-metrics">
            <div className="academy-metric">
              <dt>Задания</dt>
              <dd>
                {m?.assignments_done ?? 0}/{m?.assignments_total ?? 0}
              </dd>
            </div>
            <div className="academy-metric">
              <dt>Просрочено</dt>
              <dd>{m?.overdue ?? 0}</dd>
            </div>
            <div className="academy-metric">
              <dt>Средняя оценка</dt>
              <dd>{m?.average_score != null ? `${m.average_score}/10` : '—'}</dd>
            </div>
            <div className="academy-metric">
              <dt>Прогресс этапа</dt>
              <dd>
                {m?.stage_required_done ?? 0}/{m?.stage_required_total ?? 0}
              </dd>
            </div>
          </dl>

          <section>
            <h2 className="academy-manage-title">Задания этого человека</h2>
            {(data.assignments || []).length === 0 ? (
              <div className="staff-registry-empty">Заданий пока нет</div>
            ) : (
              <div className="academy-queue">
                {(data.assignments || []).map((item) => {
                  const report = (item.reports || []).find((r) => r && r.vk_id === data.vk_id)
                  const status = report?.status || 'open'
                  const overdue = academyDueOverdue(item.due_at, status)
                  return (
                    <article key={item.id} className="academy-task-card">
                      <div className="academy-task-head">
                        <h3 className="academy-task-title">{item.title}</h3>
                        <span className={academyStatusChipClass(status)}>
                          {report?.status_label || academyReportLabel(status)}
                        </span>
                        <span className={`academy-task-meta${overdue ? ' academy-task-meta--warn' : ''}`}>
                          до {formatAcademyDate(item.due_at)}
                        </span>
                      </div>
                      {item.description ? <p className="academy-task-desc">{item.description}</p> : null}
                      <AssignmentMaterials items={item.materials} />
                      {data.is_self && status !== 'accepted' ? (
                        <button type="button" className="btn btn-gold btn-sm mt-3" onClick={() => setSubmitFor(item)}>
                          Сдать
                        </button>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {data.can_manage && data.status !== 'graduated' ? (
            <div className="academy-manage">
              <h2 className="academy-manage-title">Управление</h2>
              <div className="academy-form-grid">
                <div className="staff-profile-field">
                  <label className="staff-profile-label">Направление</label>
                  <Select
                    value={direction}
                    onChange={setDirection}
                    options={ACADEMY_DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))}
                  />
                </div>
                <div className="staff-profile-field">
                  <label className="staff-profile-label">Этап</label>
                  <Select
                    value={stage}
                    onChange={setStage}
                    options={ACADEMY_STAGES.map((d) => ({ value: d.value, label: d.label }))}
                  />
                </div>
                <div className="staff-profile-field">
                  <label className="staff-profile-label">Наставник</label>
                  <Select
                    value={mentor}
                    onChange={setMentor}
                    options={[
                      { value: '', label: 'Без наставника' },
                      ...mentors.map((x) => ({ value: String(x.vk_id), label: x.nickname })),
                    ]}
                  />
                </div>
                <div className="staff-profile-field">
                  <label className="staff-profile-label">Окончание</label>
                  <DatePicker value={endAt} onChange={setEndAt} showTime={false} />
                </div>
                <div className="staff-profile-field">
                  <label className="staff-profile-label">Статус</label>
                  <Select
                    value={status === 'graduated' ? 'active' : status}
                    onChange={setStatus}
                    options={[
                      { value: 'active', label: 'Обучается' },
                      { value: 'frozen', label: 'Заморожен' },
                      { value: 'expelled', label: 'Отчислен' },
                    ]}
                  />
                </div>
              </div>
              <div className="academy-manage-actions">
                <button type="button" className="btn btn-gold" disabled={saving} onClick={() => void saveManage()}>
                  Сохранить
                </button>
                {(user?.access_level ?? 0) >= 3 ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setGraduateOpen(true)}>
                    Выпустить в резерв
                  </button>
                ) : null}
              </div>
              <div className="staff-profile-field">
                <label className="staff-profile-label" htmlFor="academy-comment">
                  Комментарий в ленту
                </label>
                <textarea
                  id="academy-comment"
                  className="control w-full"
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-gold academy-manage-add"
                  disabled={!comment.trim()}
                  onClick={() => {
                    void api.academyComment(id, comment).then(() => {
                      setComment('')
                      load()
                    })
                  }}
                >
                  Добавить
                </button>
              </div>
            </div>
          ) : null}

          {data.status === 'graduated' ? (
            <div className="flex flex-wrap gap-2">
              {(user?.access_level ?? 0) >= ASSIGN_STAFF_MIN_LEVEL ? (
                <Link to={`/assign?type=staff&vk_id=${id}`} className="btn btn-gold no-underline">
                  Назначить ЗГС
                </Link>
              ) : null}
              {data.recommendation !== 'none' ? (
                <p className="m-0 self-center text-sm text-white/70">{data.recommendation_label}</p>
              ) : null}
            </div>
          ) : null}

          <section className="glass-card lk-card">
            <h2 className="profile-section-title">История обучения</h2>
            {data.events.length === 0 ? (
              <p className="lk-history-text m-0 text-white/45">Записей пока нет</p>
            ) : (
              <ol className="lk-history-list">
                {data.events.map((ev) => (
                  <li key={ev.id} className="lk-history-item">
                    <span className="lk-history-date">
                      {ev.created_at ? formatHistoryStamp(ev.created_at) : '—'}
                    </span>
                    <span className="lk-history-text">{academyEventText(ev)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      <GraduateModal
        open={graduateOpen}
        onClose={() => setGraduateOpen(false)}
        onSubmit={async (mentorScore, note) => {
          await api.academyGraduate(id, { mentor_score: mentorScore, comment: note })
          setGraduateOpen(false)
          load()
        }}
      />

      <CadetSubmitModal
        assignment={submitFor}
        onClose={() => setSubmitFor(null)}
        onSubmit={async (body, links) => {
          if (!submitFor) return
          await api.academySubmitReport(submitFor.id, { body, proof_urls: links })
          setSubmitFor(null)
          load()
        }}
      />
    </div>
  )
}

function GraduateModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (mentorScore: number, comment: string) => Promise<void>
}) {
  const [score, setScore] = useState('8')
  const [comment, setComment] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setScore('8')
    setComment('')
    setFormError('')
  }, [open])

  return (
    <ModalViewport open={open} onBackdropClick={onClose}>
      <div className="glass-card academy-modal modal-pop relative z-10 flex w-full flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="m-0 text-lg font-semibold">Выпуск в резерв</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="m-0 text-sm text-white/55">
            Итог аттестации считается на сервере. Нужна оценка наставника 0–10.
          </p>
          <div>
            <label className="staff-profile-label" htmlFor="academy-grad-score">
              Оценка наставника
            </label>
            <input
              id="academy-grad-score"
              className="control"
              inputMode="numeric"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
          <div>
            <label className="staff-profile-label" htmlFor="academy-grad-comment">
              Комментарий
            </label>
            <textarea
              id="academy-grad-comment"
              className="control w-full"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
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
              const n = Number(score)
              if (Number.isNaN(n) || n < 0 || n > 10) {
                setFormError('Оценка наставника — число от 0 до 10')
                return
              }
              setSaving(true)
              void onSubmit(n, comment.trim())
                .catch((e: unknown) => setFormError(errText(e)))
                .finally(() => setSaving(false))
            }}
          >
            Выпустить
          </button>
        </div>
      </div>
    </ModalViewport>
  )
}

function CadetSubmitModal({
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
          {assignment?.description ? <p className="academy-task-desc">{assignment.description}</p> : null}
          <AssignmentMaterials items={assignment?.materials} />
          <div>
            <label className="staff-profile-label" htmlFor="cadet-submit-body">
              Текст отчёта
            </label>
            <textarea id="cadet-submit-body" className="control w-full" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <label className="staff-profile-label" htmlFor="cadet-submit-links">
              Ссылки
            </label>
            <textarea
              id="cadet-submit-links"
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
