import { useEffect, useMemo, useState } from 'react'
import { GraduationCap, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  api,
  ApiError,
  type AcademyAssignment,
  type AcademyCadet,
  type AcademySession,
  type AcademySummary,
  type AcademyTemplate,
  type StaffMember,
} from '../api'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Select } from '../components/ui/Select'
import { DatePicker } from '../components/ui/DatePicker'
import { useAuth } from '../context/AuthContext'
import { ACADEMY_DIRECTIONS, academyCanEnrollLevel, formatAcademyDate } from '../lib/academy'
import { staffLabel } from '../lib/staff'

type Tab = 'roster' | 'mine' | 'assignments' | 'sessions' | 'reserve'
type RosterFilter = 'all' | 'theory' | 'practice' | 'attestation' | 'overdue' | 'no_mentor' | 'graduates'

function errText(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message
  return 'Не удалось загрузить академию'
}

export function AcademyPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('roster')
  const [filter, setFilter] = useState<RosterFilter>('all')
  const [summary, setSummary] = useState<AcademySummary | null>(null)
  const [roster, setRoster] = useState<AcademyCadet[]>([])
  const [mine, setMine] = useState<AcademyCadet[]>([])
  const [assignments, setAssignments] = useState<AcademyAssignment[]>([])
  const [templates, setTemplates] = useState<AcademyTemplate[]>([])
  const [sessions, setSessions] = useState<AcademySession[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [mentors, setMentors] = useState<{ vk_id: number; nickname: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEnroll, setShowEnroll] = useState(false)
  const [enrollVk, setEnrollVk] = useState('')
  const [enrollDir, setEnrollDir] = useState('general')
  const [enrollMentor, setEnrollMentor] = useState('')
  const [saving, setSaving] = useState(false)

  const [assignTemplate, setAssignTemplate] = useState('')
  const [assignAll, setAssignAll] = useState(true)
  const [assignTarget, setAssignTarget] = useState('')
  const [sessionTitle, setSessionTitle] = useState('')
  const [sessionDate, setSessionDate] = useState('')

  const canLead = Boolean(summary?.is_lead) || (user?.access_level ?? 0) >= 3

  const load = async () => {
    setError(null)
    try {
      const [sum, ros, my, asg, sess, st, ment, tpls] = await Promise.all([
        api.academySummary(),
        api.academyRoster(true),
        api.academyMine(),
        api.academyAssignments(),
        api.academySessions(),
        api.staff(),
        api.academyMentors(),
        api.academyTemplates(),
      ])
      setSummary(sum)
      setRoster(ros.members)
      setMine(my.members)
      setAssignments(asg.assignments)
      setSessions(sess.sessions)
      setStaff(st.members)
      setMentors(ment.mentors)
      setTemplates(tpls.templates)
    } catch (e: unknown) {
      setError(errText(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [filter])

  const candidates = useMemo(
    () =>
      staff.filter(
        (m) => academyCanEnrollLevel(m.access_level) && !m.is_academy,
      ),
    [staff],
  )

  const filteredRoster = useMemo(() => {
    return roster.filter((c) => {
      if (filter === 'all') return c.status === 'active' || c.status === 'frozen'
      if (filter === 'theory') return c.stage === 'theory' || c.stage === 'mentored'
      if (filter === 'practice') return c.stage === 'practice'
      if (filter === 'attestation') return c.stage === 'attestation'
      if (filter === 'overdue') return (c.metrics?.overdue ?? 0) > 0
      if (filter === 'no_mentor') return !c.mentor_vk_id && c.status !== 'graduated'
      if (filter === 'graduates') return c.status === 'graduated'
      return true
    })
  }, [roster, filter])

  const enroll = async () => {
    if (!enrollVk) return
    setSaving(true)
    try {
      await api.academyEnroll({
        vk_id: Number(enrollVk),
        direction: enrollDir,
        mentor_vk_id: enrollMentor ? Number(enrollMentor) : null,
      })
      setShowEnroll(false)
      setEnrollVk('')
      await load()
    } catch (e: unknown) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const issueAssignment = async () => {
    if (!assignTemplate && assignAll) return
    setSaving(true)
    try {
      await api.academyCreateAssignment({
        template_id: assignTemplate ? Number(assignTemplate) : null,
        all_active: assignAll,
        assignee_vk_ids: !assignAll && assignTarget ? [Number(assignTarget)] : undefined,
      })
      await load()
    } catch (e: unknown) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const createSession = async () => {
    if (!sessionTitle.trim()) return
    setSaving(true)
    try {
      await api.academyCreateSession({
        title: sessionTitle.trim(),
        held_at: sessionDate || undefined,
        status: 'held',
      })
      setSessionTitle('')
      await load()
    } catch (e: unknown) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const review = async (assignmentId: number, vkId: number, action: string, score?: number) => {
    try {
      await api.academyReviewReport(assignmentId, vkId, { action, score })
      await load()
    } catch (e: unknown) {
      setError(errText(e))
    }
  }

  const submit = async (assignmentId: number) => {
    const text = window.prompt('Текст отчёта')
    if (text == null) return
    try {
      await api.academySubmitReport(assignmentId, { body: text })
      await load()
    } catch (e: unknown) {
      setError(errText(e))
    }
  }

  const mark = async (sessionId: number, vkId: number, status: string) => {
    try {
      await api.academySetAttendance(sessionId, { [vkId]: status })
      await load()
    } catch (e: unknown) {
      setError(errText(e))
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'roster', label: 'Сводка' },
    { id: 'mine', label: 'Мои академики' },
    { id: 'assignments', label: 'Задания' },
    { id: 'sessions', label: 'Занятия' },
    { id: 'reserve', label: 'Резерв' },
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
            ? `${summary.cadets} академиков · ${summary.mentors} наставников`
            : 'Подготовка управленца сферы'
        }
        actions={
          canLead ? (
            <button type="button" className="btn btn-gold btn-sm" onClick={() => setShowEnroll((v) => !v)}>
              <Plus size={16} />
              Зачислить
            </button>
          ) : undefined
        }
      />

      <div className="sphere-tabs" role="tablist" aria-label="Академия">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'sphere-tab sphere-tab--active' : 'sphere-tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <Alert className="shrink-0">{error}</Alert>}

      {showEnroll && canLead && (
        <div className="academy-form-grid">
          <Select
            value={enrollVk}
            onChange={setEnrollVk}
            options={[
              { value: '', label: 'Академик' },
              ...candidates.map((m) => ({ value: String(m.vk_id), label: staffLabel(m) })),
            ]}
          />
          <Select
            value={enrollDir}
            onChange={setEnrollDir}
            options={ACADEMY_DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))}
          />
          <Select
            value={enrollMentor}
            onChange={setEnrollMentor}
            options={[
              { value: '', label: 'Без наставника' },
              ...mentors.map((m) => ({ value: String(m.vk_id), label: m.nickname })),
            ]}
          />
          <button type="button" className="btn btn-gold" disabled={saving || !enrollVk} onClick={() => void enroll()}>
            Зачислить без смены ника
          </button>
        </div>
      )}

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : tab === 'roster' ? (
        <>
          <div className="academy-stats">
            <div className="academy-stat">
              <div className="academy-stat-value">{summary?.cadets ?? 0}</div>
              <div className="academy-stat-label">Академиков</div>
            </div>
            <div className="academy-stat">
              <div className="academy-stat-value">{summary?.mentors ?? 0}</div>
              <div className="academy-stat-label">Наставников</div>
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
                ['practice', 'Практика'],
                ['attestation', 'Аттестация'],
                ['overdue', 'Просрочки'],
                ['no_mentor', 'Без наставника'],
                ['graduates', 'Выпускники'],
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
          <RosterTable rows={filteredRoster} />
        </>
      ) : tab === 'mine' ? (
        <RosterTable rows={mine} showPending />
      ) : tab === 'assignments' ? (
        <div className="page-stack">
          {(canLead || mine.length > 0) && (
            <div className="academy-form-grid">
              <Select
                value={assignTemplate}
                onChange={setAssignTemplate}
                options={[
                  { value: '', label: 'Шаблон задания' },
                  ...templates.filter((t) => t.is_active).map((t) => ({ value: String(t.id), label: `${t.title} · ${t.stage_label}` })),
                ]}
              />
              <Select
                value={assignAll ? 'all' : assignTarget}
                onChange={(v) => {
                  if (v === 'all') {
                    setAssignAll(true)
                    setAssignTarget('')
                  } else {
                    setAssignAll(false)
                    setAssignTarget(v)
                  }
                }}
                options={[
                  { value: 'all', label: canLead ? 'Все активные' : 'Мои академики' },
                  ...roster
                    .filter((c) => c.status === 'active')
                    .map((c) => ({ value: String(c.vk_id), label: c.nickname })),
                ]}
              />
              <button type="button" className="btn btn-gold" disabled={saving || !assignTemplate} onClick={() => void issueAssignment()}>
                Выдать задание
              </button>
            </div>
          )}
          {assignments.length === 0 ? (
            <div className="staff-registry-empty">Заданий пока нет</div>
          ) : (
            assignments.map((a) => (
              <div key={a.id} className="academy-assign-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>
                    #{a.id} {a.title}
                  </strong>
                  <span className="text-white/45 text-sm">
                    {a.stage_label} · до {formatAcademyDate(a.due_at)} · {a.pending_count} на проверке
                  </span>
                </div>
                {a.description ? <p className="text-white/55 text-sm mt-1 mb-0">{a.description}</p> : null}
                <div className="mt-2 flex flex-col gap-2">
                  {(a.reports || []).filter(Boolean).map((r) =>
                    r ? (
                      <div key={r.id} className="text-sm text-white/70">
                        id{r.vk_id}: {r.status}
                        {r.score != null ? ` · ${r.score}/${a.max_points}` : ''}
                        {r.body ? ` — ${r.body}` : ''}
                        {r.status === 'pending' && (canLead || mine.some((c) => c.vk_id === r.vk_id)) ? (
                          <span className="ml-2 inline-flex gap-1">
                            <button type="button" className="btn btn-sm btn-gold" onClick={() => void review(a.id, r.vk_id, 'accept', a.max_points)}>
                              Принять
                            </button>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => void review(a.id, r.vk_id, 'revision')}>
                              Доработка
                            </button>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => void review(a.id, r.vk_id, 'reject')}>
                              Отклонить
                            </button>
                          </span>
                        ) : null}
                      </div>
                    ) : null,
                  )}
                  {a.assignee_vk_ids.includes(user?.vk_id ?? 0) &&
                  !a.reports.some((r) => r && r.vk_id === user?.vk_id && r.status === 'accepted') ? (
                    <button type="button" className="btn btn-sm btn-secondary w-fit" onClick={() => void submit(a.id)}>
                      Сдать задание
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'sessions' ? (
        <div className="page-stack">
          {canLead && (
            <div className="academy-form-grid">
              <input
                className="control"
                placeholder="Тема занятия"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
              />
              <DatePicker value={sessionDate || null} onChange={(v) => setSessionDate(v ?? '')} showTime={false} />
              <button type="button" className="btn btn-gold" disabled={saving || !sessionTitle.trim()} onClick={() => void createSession()}>
                Отметить занятие
              </button>
            </div>
          )}
          {sessions.length === 0 ? (
            <div className="staff-registry-empty">Занятий пока нет</div>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="academy-assign-card">
                <strong>{s.title}</strong>
                <div className="text-sm text-white/45">
                  {formatAcademyDate(s.held_at)} · присутствовало {s.present}, пропущено {s.absent}
                </div>
                {canLead && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {roster
                      .filter((c) => c.status === 'active')
                      .map((c) => (
                        <button
                          key={c.vk_id}
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() =>
                            void mark(s.id, c.vk_id, s.attendance[String(c.vk_id)] === 'present' ? 'absent' : 'present')
                          }
                        >
                          {c.nickname}: {s.attendance[String(c.vk_id)] || '—'}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <RosterTable rows={roster.filter((c) => c.status === 'graduated')} reserve />
      )}
    </div>
  )
}

function RosterTable({
  rows,
  showPending,
  reserve,
}: {
  rows: AcademyCadet[]
  showPending?: boolean
  reserve?: boolean
}) {
  if (rows.length === 0) {
    return <div className="staff-registry-empty">Пока никого нет</div>
  }
  return (
    <div className="ll-scroll">
      <table className="academy-table">
        <thead>
          <tr>
            <th>Академик</th>
            <th>Направление</th>
            <th>Наставник</th>
            <th>Этап</th>
            <th>{reserve ? 'Итог' : 'Баллы'}</th>
            <th>{reserve ? 'Рекомендация' : 'Прогресс'}</th>
            {showPending ? <th>Проверка</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/academy/${c.vk_id}`} className="no-underline">
                  {c.nickname}
                </Link>
                {!c.mentor_vk_id && c.status !== 'graduated' ? (
                  <span className="academy-chip academy-chip--warn ml-2">без наставника</span>
                ) : null}
              </td>
              <td>{c.direction_label}</td>
              <td>{c.mentor_name || '—'}</td>
              <td>{c.display_status}</td>
              <td>{reserve ? (c.attestation_total ?? c.metrics?.rating ?? '—') : (c.metrics?.rating ?? '—')}</td>
              <td>{reserve ? c.recommendation_label : `${c.metrics?.progress ?? 0}%`}</td>
              {showPending ? <td>{c.pending_reviews ?? 0}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
