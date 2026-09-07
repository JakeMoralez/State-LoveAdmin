import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type AcademyCadetDetail } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Select } from '../components/ui/Select'
import { DatePicker } from '../components/ui/DatePicker'
import { ACADEMY_DIRECTIONS, ACADEMY_EVENT_LABELS, ACADEMY_STAGES, formatAcademyDate } from '../lib/academy'

function errText(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message
  return 'Не удалось открыть карточку'
}

export function AcademyCadetPage() {
  const { vkId } = useParams()
  const navigate = useNavigate()
  const id = Number(vkId)
  const [data, setData] = useState<AcademyCadetDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [warning, setWarning] = useState('')
  const [mentorScore, setMentorScore] = useState('8')
  const [saving, setSaving] = useState(false)
  const [mentors, setMentors] = useState<{ vk_id: number; nickname: string }[]>([])

  const load = () => {
    if (!id) return
    setError(null)
    api
      .academyCadet(id)
      .then(setData)
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

  const patch = async (body: Parameters<typeof api.academyPatchCadet>[1]) => {
    setSaving(true)
    try {
      await api.academyPatchCadet(id, body)
      load()
    } catch (e: unknown) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const m = data?.metrics

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
        <div className="page-loading">Загрузка…</div>
      ) : (
        <>
          <div className="academy-card-head">
            <span>С {formatAcademyDate(data.enrolled_at)}</span>
            <span>Наставник: {data.mentor_name || 'не назначен'}</span>
            <span>Этап: {data.stage_label}</span>
            <span>Прогресс: {m?.progress ?? 0}%</span>
          </div>

          <dl className="academy-metrics">
            <div className="academy-metric">
              <dt>Выполнено заданий</dt>
              <dd>
                {m?.assignments_done ?? 0} / {m?.assignments_total ?? 0}
                {m && m.required_total > 0 ? ` (обяз. ${m.required_done}/${m.required_total})` : ''}
              </dd>
            </div>
            <div className="academy-metric">
              <dt>Средняя оценка</dt>
              <dd>{m?.average_score != null ? `${m.average_score} / 10` : '—'}</dd>
            </div>
            <div className="academy-metric">
              <dt>Просрочено</dt>
              <dd>{m?.overdue ?? 0}</dd>
            </div>
            <div className="academy-metric">
              <dt>Практических проверок</dt>
              <dd>{m?.practical_checks ?? 0}</dd>
            </div>
            <div className="academy-metric">
              <dt>Ошибок</dt>
              <dd>{m?.errors ?? 0}</dd>
            </div>
            <div className="academy-metric">
              <dt>Предупреждений</dt>
              <dd>{m?.warnings ?? 0}</dd>
            </div>
            <div className="academy-metric">
              <dt>Активность</dt>
              <dd>{m?.activity != null ? `${m.activity}%` : '—'}</dd>
            </div>
            <div className="academy-metric">
              <dt>Итоговый рейтинг</dt>
              <dd>{m?.rating ?? 0} / 100</dd>
            </div>
            <div className="academy-metric">
              <dt>Посещаемость</dt>
              <dd>
                {m?.sessions_present ?? 0}/{m?.sessions_total ?? 0}
                {m?.attendance_pct != null ? ` · ${m.attendance_pct}%` : ''}
              </dd>
            </div>
            <div className="academy-metric">
              <dt>Этап</dt>
              <dd>
                {m?.stage_required_done ?? 0}/{m?.stage_required_total ?? 0} обязательных
                {m?.stage_ready ? ' · можно переводить' : ''}
              </dd>
            </div>
          </dl>

          {data.can_manage && (
            <div className="academy-form-grid">
              <Select
                value={data.direction}
                onChange={(v) => void patch({ direction: v })}
                options={ACADEMY_DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))}
              />
              <Select
                value={data.stage}
                onChange={(v) => void patch({ stage: v })}
                options={ACADEMY_STAGES.map((d) => ({ value: d.value, label: d.label }))}
              />
              <Select
                value={data.mentor_vk_id ? String(data.mentor_vk_id) : ''}
                onChange={(v) => void patch(v ? { mentor_vk_id: Number(v) } : { clear_mentor: true })}
                options={[
                  { value: '', label: 'Без наставника' },
                  ...mentors.map((x) => ({ value: String(x.vk_id), label: x.nickname })),
                ]}
              />
              <DatePicker
                value={data.expected_end_at?.slice(0, 10) || null}
                onChange={(v) => void patch(v ? { expected_end_at: v } : { clear_expected_end: true })}
                showTime={false}
              />
              <Select
                value={data.status}
                onChange={(v) => void patch({ status: v })}
                options={[
                  { value: 'active', label: 'Обучается' },
                  { value: 'frozen', label: 'Заморожен' },
                  { value: 'expelled', label: 'Отчислен' },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  className="control"
                  style={{ maxWidth: 80 }}
                  value={mentorScore}
                  onChange={(e) => setMentorScore(e.target.value)}
                  aria-label="Оценка наставника"
                />
                <button
                  type="button"
                  className="btn btn-gold"
                  disabled={saving || data.status === 'graduated'}
                  onClick={() => {
                    void api.academyGraduate(id, Number(mentorScore) || 0).then(load).catch((e: unknown) => setError(errText(e)))
                  }}
                >
                  Выпустить в резерв
                </button>
                <Link to={`/assign?type=staff&vk_id=${id}`} className="btn btn-secondary no-underline">
                  Назначить ЗГС
                </Link>
              </div>
            </div>
          )}

          {data.can_manage && (
            <div className="academy-form-grid">
              <div>
                <textarea
                  className="control w-full"
                  rows={2}
                  placeholder="Комментарий в ленту"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-secondary mt-2"
                  disabled={!comment.trim()}
                  onClick={() => {
                    void api.academyComment(id, comment).then(() => {
                      setComment('')
                      load()
                    })
                  }}
                >
                  Комментарий
                </button>
              </div>
              <div>
                <textarea
                  className="control w-full"
                  rows={2}
                  placeholder="Предупреждение Академии"
                  value={warning}
                  onChange={(e) => setWarning(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-secondary mt-2"
                  disabled={!warning.trim()}
                  onClick={() => {
                    void api.academyWarning(id, warning).then(() => {
                      setWarning('')
                      load()
                    })
                  }}
                >
                  Предупреждение
                </button>
              </div>
            </div>
          )}

          {data.recommendation !== 'none' && (
            <p className="text-sm text-white/70 m-0">{data.recommendation_label}</p>
          )}

          <h2 className="text-base font-medium m-0">История обучения</h2>
          <div className="academy-timeline">
            {data.events.map((ev) => (
              <div key={ev.id} className="academy-timeline-item">
                <div className="academy-timeline-date">{formatAcademyDate(ev.created_at)}</div>
                <div>
                  {ev.actor_name} {ACADEMY_EVENT_LABELS[ev.action] || ev.action}
                  {ev.detail?.title ? ` «${String(ev.detail.title)}»` : ''}
                  {ev.detail?.score != null ? ` — ${String(ev.detail.score)}` : ''}
                  {typeof ev.detail?.text === 'string' ? ` — ${ev.detail.text}` : ''}
                  {typeof ev.detail?.comment === 'string' && ev.detail.comment ? ` — ${ev.detail.comment}` : ''}
                </div>
              </div>
            ))}
            {data.events.length === 0 ? <div className="text-white/45">Записей пока нет</div> : null}
          </div>
        </>
      )}
    </div>
  )
}
