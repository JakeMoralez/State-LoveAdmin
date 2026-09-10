import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  Bug,
  Gift,
  KeyRound,
  ListChecks,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Trash2,
} from 'lucide-react'
import { ApiError, api, type DevCatalog, type DevChat, type DevChatKind } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Select } from '../components/ui/Select'
import {
  CommandsSettingsTab,
  ForumSettingsTab,
  IntegrationsSettingsTab,
  NotificationsSettingsTab,
  PortalSettingsTab,
} from '../components/dev/DevSettingsExtraTabs'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_TAG_SPHERES } from '../lib/leaderNickname'
import { SPHERE_OPTIONS } from '../lib/spheres'
import { PageSkeleton } from '../components/ui/LoadingState'

const SPHERE_SELECT_OPTIONS = SPHERE_OPTIONS.filter((s) => s.value !== 'server').map((s) => ({
  value: s.value,
  label: s.label,
}))

type SettingsTab =
  | 'chats'
  | 'catalog'
  | 'forum'
  | 'integrations'
  | 'portal'
  | 'notifications'
  | 'commands'
  | 'system'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'chats', label: 'Беседы' },
  { id: 'catalog', label: 'Справочники' },
  { id: 'forum', label: 'Форум' },
  { id: 'integrations', label: 'Интеграции' },
  { id: 'portal', label: 'Портал' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'commands', label: 'Права команд' },
  { id: 'system', label: 'Ссылки' },
]

const LEAVE_MODES = [
  { value: 'off', label: 'Ничего не делать' },
  { value: 'on', label: 'Кикать' },
  { value: 'ask', label: 'Спрашивать' },
]

const ON_OFF = [
  { value: 'off', label: 'Выкл' },
  { value: 'on', label: 'Вкл' },
]

function formatError(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Не удалось загрузить'
}

function normalizeDevChat(chat: DevChat): DevChat {
  if (chat.chat_kind !== 'sled_ca') return chat
  return {
    ...chat,
    chat_kind: 'staff',
    sphere: chat.sphere || 'central_apparatus',
    kind_label: 'Следящие · Центральный аппарат',
  }
}

function visibleChatKinds(kinds: DevChatKind[]): DevChatKind[] {
  return kinds.filter((item) => item.id !== 'sled_ca')
}

function ChatEditor({
  chat,
  kinds,
  saving,
  onSave,
}: {
  chat: DevChat
  kinds: DevChatKind[]
  saving: boolean
  onSave: (body: {
    chat_kind: string
    sphere: string | null
    kick_on_leave: string
    kick_on_rejoin: string
    auto_mute_on_join: string
  }) => void
}) {
  const [kind, setKind] = useState(chat.chat_kind)
  const [sphere, setSphere] = useState(chat.sphere ?? '')
  const [leave, setLeave] = useState(chat.kick_on_leave)
  const [rejoin, setRejoin] = useState(chat.kick_on_rejoin)
  const [mute, setMute] = useState(chat.auto_mute_on_join)

  useEffect(() => {
    setKind(chat.chat_kind)
    setSphere(chat.sphere ?? '')
    setLeave(chat.kick_on_leave)
    setRejoin(chat.kick_on_rejoin)
    setMute(chat.auto_mute_on_join)
  }, [chat])

  const meta = kinds.find((item) => item.id === kind)
  const sphereOptions = (meta?.spheres ?? []).map((item) => ({ value: item.id, label: item.label }))

  useEffect(() => {
    const next = kinds.find((item) => item.id === kind)
    if (!next?.needs_sphere) {
      setSphere('')
      return
    }
    const allowed = new Set(next.spheres.map((item) => item.id))
    setSphere((prev) => (prev && allowed.has(prev) ? prev : ''))
  }, [kind, kinds])

  const dirty =
    kind !== chat.chat_kind ||
    (sphere || null) !== (chat.sphere || null) ||
    leave !== chat.kick_on_leave ||
    rejoin !== chat.kick_on_rejoin ||
    mute !== chat.auto_mute_on_join

  return (
    <div className="dev-settings-chat-edit">
      <div className="assign-grid">
        <div className="assign-field">
          <label className="assign-label">Тип</label>
          <Select
            value={kind}
            onChange={setKind}
            options={kinds.map((item) => ({ value: item.id, label: item.label }))}
            disabled={saving}
          />
        </div>
        {meta?.needs_sphere ? (
          <div className="assign-field">
            <label className="assign-label">Сфера</label>
            <Select
              value={sphere}
              onChange={setSphere}
              options={sphereOptions}
              placeholder="Выберите сферу"
              disabled={saving}
            />
          </div>
        ) : null}
        <div className="assign-field">
          <label className="assign-label">Кик при выходе</label>
          <Select value={leave} onChange={setLeave} options={LEAVE_MODES} disabled={saving} />
        </div>
        <div className="assign-field">
          <label className="assign-label">Кик при возврате</label>
          <Select value={rejoin} onChange={setRejoin} options={ON_OFF} disabled={saving} />
        </div>
        <div className="assign-field">
          <label className="assign-label">Мут при входе</label>
          <Select value={mute} onChange={setMute} options={ON_OFF} disabled={saving} />
        </div>
      </div>
      <button
        type="button"
        className="btn btn-gold btn-sm mt-3"
        disabled={saving || !dirty || Boolean(meta?.needs_sphere && !sphere)}
        onClick={() =>
          onSave({
            chat_kind: kind,
            sphere: meta?.needs_sphere ? sphere : null,
            kick_on_leave: leave,
            kick_on_rejoin: rejoin,
            auto_mute_on_join: mute,
          })
        }
      >
        {saving ? 'Сохранение…' : 'Сохранить беседу'}
      </button>
    </div>
  )
}

function StringListEditor({
  title,
  hint,
  values,
  onChange,
  placeholder,
}: {
  title: string
  hint?: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  return (
    <section className="dev-settings-block glass-card">
      <h3 className="dev-settings-block-title">{title}</h3>
      {hint ? <p className="dev-settings-hint">{hint}</p> : null}
      <ul className="dev-settings-list">
        {values.map((item, index) => (
          <li key={`${item}-${index}`}>
            <input
              className="control w-full"
              value={item}
              onChange={(e) => {
                const next = [...values]
                next[index] = e.target.value
                onChange(next)
              }}
            />
            <button
              type="button"
              className="btn-icon"
              aria-label="Удалить"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="dev-settings-add">
        <input
          className="control w-full"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const value = draft.trim()
            if (!value) return
            onChange([...values, value])
            setDraft('')
          }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            const value = draft.trim()
            if (!value) return
            onChange([...values, value])
            setDraft('')
          }}
        >
          <Plus size={15} />
          Добавить
        </button>
      </div>
    </section>
  )
}

function FactionListEditor({
  title,
  hint,
  values,
  tagSpheres,
  onChange,
  placeholder,
}: {
  title: string
  hint?: string
  values: string[]
  tagSpheres: Record<string, string>
  onChange: (next: { values: string[]; tagSpheres: Record<string, string> }) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const setTag = (index: number, nextValue: string) => {
    const prev = values[index]
    const nextValues = [...values]
    nextValues[index] = nextValue
    const nextSpheres = { ...tagSpheres }
    const sphere = nextSpheres[prev] ?? DEFAULT_TAG_SPHERES[nextValue] ?? ''
    if (prev && prev !== nextValue) delete nextSpheres[prev]
    if (nextValue.trim()) nextSpheres[nextValue.trim()] = sphere || 'gov_structures'
    onChange({ values: nextValues, tagSpheres: nextSpheres })
  }
  const setSphere = (tag: string, sphere: string) => {
    onChange({ values, tagSpheres: { ...tagSpheres, [tag]: sphere } })
  }
  return (
    <section className="dev-settings-block dev-settings-block--factions glass-card">
      <header className="dev-settings-block-head">
        <h3 className="dev-settings-block-title">{title}</h3>
        {hint ? <p className="dev-settings-hint">{hint}</p> : null}
      </header>
      <div className="dev-settings-list-head" aria-hidden="true">
        <span>Тег</span>
        <span>Сфера</span>
        <span />
      </div>
      <ul className="dev-settings-list dev-settings-list--sphere">
        {values.map((item, index) => (
          <li key={`${item}-${index}`}>
            <input
              className="control control-md"
              value={item}
              aria-label={`Тег фракции ${index + 1}`}
              onChange={(e) => setTag(index, e.target.value)}
            />
            <Select
              value={tagSpheres[item] ?? DEFAULT_TAG_SPHERES[item] ?? ''}
              onChange={(sphere) => setSphere(item, sphere)}
              options={SPHERE_SELECT_OPTIONS}
              placeholder="Сфера"
            />
            <button
              type="button"
              className="btn-icon btn-icon--danger"
              aria-label={`Удалить ${item || 'фракцию'}`}
              onClick={() => {
                const nextSpheres = { ...tagSpheres }
                delete nextSpheres[item]
                onChange({
                  values: values.filter((_, i) => i !== index),
                  tagSpheres: nextSpheres,
                })
              }}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="dev-settings-add dev-settings-add--sphere">
        <input
          className="control control-md"
          value={draft}
          placeholder={placeholder}
          aria-label="Новый тег фракции"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const value = draft.trim()
            if (!value) return
            onChange({
              values: [...values, value],
              tagSpheres: {
                ...tagSpheres,
                [value]: DEFAULT_TAG_SPHERES[value] ?? 'gov_structures',
              },
            })
            setDraft('')
          }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            const value = draft.trim()
            if (!value) return
            onChange({
              values: [...values, value],
              tagSpheres: {
                ...tagSpheres,
                [value]: DEFAULT_TAG_SPHERES[value] ?? 'gov_structures',
              },
            })
            setDraft('')
          }}
        >
          <Plus size={15} />
          Добавить
        </button>
      </div>
    </section>
  )
}

function TagListEditor({
  title,
  items,
  tagSpheres,
  onChange,
}: {
  title: string
  items: { value: string; label: string }[]
  tagSpheres: Record<string, string>
  onChange: (next: {
    items: { value: string; label: string }[]
    tagSpheres: Record<string, string>
  }) => void
}) {
  return (
    <section className="dev-settings-block dev-settings-block--tags glass-card">
      <header className="dev-settings-block-head">
        <h3 className="dev-settings-block-title">{title}</h3>
      </header>
      <div className="dev-settings-list-head dev-settings-list-head--triple" aria-hidden="true">
        <span>Тег</span>
        <span>Подпись</span>
        <span>Сфера</span>
        <span />
      </div>
      <ul className="dev-settings-list dev-settings-list--triple">
        {items.map((item, index) => (
          <li key={`${item.value}-${index}`}>
            <input
              className="control control-md"
              value={item.value}
              placeholder="Тег"
              aria-label={`Тег ${index + 1}`}
              onChange={(e) => {
                const next = [...items]
                const prev = item.value
                const value = e.target.value
                next[index] = { ...item, value }
                const nextSpheres = { ...tagSpheres }
                const sphere = nextSpheres[prev] ?? DEFAULT_TAG_SPHERES[value] ?? ''
                if (prev && prev !== value) delete nextSpheres[prev]
                if (value.trim()) nextSpheres[value.trim()] = sphere || 'central_apparatus'
                onChange({ items: next, tagSpheres: nextSpheres })
              }}
            />
            <input
              className="control control-md"
              value={item.label}
              placeholder="Подпись"
              aria-label={`Подпись ${index + 1}`}
              onChange={(e) => {
                const next = [...items]
                next[index] = { ...item, label: e.target.value }
                onChange({ items: next, tagSpheres })
              }}
            />
            <Select
              value={tagSpheres[item.value] ?? DEFAULT_TAG_SPHERES[item.value] ?? ''}
              onChange={(sphere) =>
                onChange({
                  items,
                  tagSpheres: { ...tagSpheres, [item.value]: sphere },
                })
              }
              options={SPHERE_SELECT_OPTIONS}
              placeholder="Сфера"
            />
            <button
              type="button"
              className="btn-icon btn-icon--danger"
              aria-label={`Удалить ${item.label || item.value || 'запись'}`}
              onClick={() => {
                const nextSpheres = { ...tagSpheres }
                delete nextSpheres[item.value]
                onChange({
                  items: items.filter((_, i) => i !== index),
                  tagSpheres: nextSpheres,
                })
              }}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="dev-settings-add">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onChange({ items: [...items, { value: '', label: '' }], tagSpheres })}
        >
          <Plus size={15} />
          Добавить
        </button>
      </div>
    </section>
  )
}

export function DevSettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<SettingsTab>('chats')
  const [chats, setChats] = useState<DevChat[]>([])
  const [kinds, setKinds] = useState<DevChatKind[]>([])
  const [openPeer, setOpenPeer] = useState<number | null>(null)
  const [catalog, setCatalog] = useState<DevCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadChats = async () => {
    const data = await api.devChats()
    setChats(data.chats.map(normalizeDevChat))
    setKinds(visibleChatKinds(data.kinds))
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const catalogData = await api.devCatalog()
      setCatalog({
        ...catalogData,
        tag_spheres: Object.fromEntries(
          Object.entries({ ...DEFAULT_TAG_SPHERES, ...(catalogData.tag_spheres ?? {}) }).map(
            ([tag, sphere]) => [tag, sphere === 'server' ? 'gov_structures' : sphere],
          ),
        ),
      })
      try {
        await loadChats()
      } catch (e) {
        setChats([])
        setKinds([])
        if (tab === 'chats') setError(formatError(e))
      }
    } catch (e) {
      setError(formatError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => a.kind_label.localeCompare(b.kind_label, 'ru') || a.peer_id - b.peer_id),
    [chats],
  )

  if (!authLoading && user && !user.can_dev_panel) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="page-stack page-stack--dev">
      <PageHeader
        section="Разработка"
        title="Настройки"
        icon={Settings}
        subtitle="Беседы, форум, интеграции, права команд и runtime-настройки"
        shrink
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
            Обновить
          </button>
        }
      />

      <div className="sphere-tabs" role="tablist" aria-label="Настройки">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'sphere-tab sphere-tab--active' : 'sphere-tab'}
            onClick={() => {
              setTab(item.id)
              setError(null)
              setNotice(null)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="assign-success">{notice}</p> : null}

      {tab === 'chats' && (
        <div className="dev-settings-chats">
          {loading && !chats.length ? <PageSkeleton variant="list" label="Загрузка бесед" /> : null}
          {!loading && !chats.length && !error ? (
            <div className="staff-registry-empty">Бесед пока нет — или бот не видит зарегистрированные чаты.</div>
          ) : null}
          {sortedChats.map((chat) => (
            <article key={chat.peer_id} className="glass-card dev-settings-chat">
              <button
                type="button"
                className="dev-settings-chat-head"
                onClick={() => setOpenPeer((prev) => (prev === chat.peer_id ? null : chat.peer_id))}
              >
                <div>
                  <div className="dev-settings-chat-title">{chat.title}</div>
                  <div className="dev-settings-chat-meta">
                    {chat.kind_label}
                    {chat.alias ? ` · ${chat.alias}` : ''}
                    {` · ${chat.peer_id}`}
                    {chat.member_count != null ? ` · ${chat.member_count} чел.` : ''}
                  </div>
                </div>
                <span className="dev-settings-chat-toggle">{openPeer === chat.peer_id ? 'Свернуть' : 'Настроить'}</span>
              </button>
              {openPeer === chat.peer_id ? (
                <ChatEditor
                  chat={chat}
                  kinds={kinds}
                  saving={saving}
                  onSave={(body) => {
                    setSaving(true)
                    setError(null)
                    setNotice(null)
                    api
                      .updateDevChat(chat.peer_id, body)
                      .then((updated) => {
                        setChats((prev) =>
                          prev.map((row) => (row.peer_id === updated.peer_id ? normalizeDevChat(updated) : row)),
                        )
                        setNotice('Беседа сохранена')
                      })
                      .catch((e) => setError(formatError(e)))
                      .finally(() => setSaving(false))
                  }}
                />
              ) : null}
            </article>
          ))}
        </div>
      )}

      {tab === 'catalog' && catalog && (
        <div className="dev-settings-catalog">
          <Alert>
            Новая фракция здесь появится в «Назначить». В /snick бота её нужно добавить отдельно.
          </Alert>
          <FactionListEditor
            title="Фракции"
            hint="Тег в нике закрепляется за сферой. От этого зависит фильтр на странице «Руководители»."
            values={catalog.factions}
            tagSpheres={catalog.tag_spheres ?? {}}
            onChange={({ values, tagSpheres }) =>
              setCatalog({ ...catalog, factions: values, tag_spheres: tagSpheres })
            }
            placeholder="LSPD"
          />
          <TagListEditor
            title="Министры"
            items={catalog.ministers}
            tagSpheres={catalog.tag_spheres ?? {}}
            onChange={({ items, tagSpheres }) =>
              setCatalog({ ...catalog, ministers: items, tag_spheres: tagSpheres })
            }
          />
          <TagListEditor
            title="Советники"
            items={catalog.advisors}
            tagSpheres={catalog.tag_spheres ?? {}}
            onChange={({ items, tagSpheres }) =>
              setCatalog({ ...catalog, advisors: items, tag_spheres: tagSpheres })
            }
          />
          <StringListEditor
            title="Должности судей"
            values={catalog.judge_positions}
            onChange={(judge_positions) => setCatalog({ ...catalog, judge_positions })}
            placeholder="Судья Верховного суда"
          />
          <button
            type="button"
            className="btn btn-gold"
            disabled={saving}
            onClick={() => {
              setSaving(true)
              setError(null)
              setNotice(null)
              api
                .saveDevCatalog(catalog)
                .then((saved) => {
                  setCatalog(saved)
                  setNotice('Справочники сохранены')
                })
                .catch((e) => setError(formatError(e)))
                .finally(() => setSaving(false))
            }}
          >
            {saving ? 'Сохранение…' : 'Сохранить справочники'}
          </button>
        </div>
      )}

      {tab === 'forum' ? <ForumSettingsTab /> : null}
      {tab === 'integrations' ? <IntegrationsSettingsTab /> : null}
      {tab === 'portal' ? <PortalSettingsTab /> : null}
      {tab === 'notifications' ? <NotificationsSettingsTab /> : null}
      {tab === 'commands' ? <CommandsSettingsTab /> : null}

      {tab === 'system' && (
        <div className="dev-settings-system">
          <section className="glass-card dev-settings-block">
            <h3 className="dev-settings-block-title">Другие экраны</h3>
            <div className="dev-settings-links">
              <Link to="/forum/judge-list" className="dev-settings-link no-underline">
                <ListChecks size={16} /> Список судей на форуме
              </Link>
              <Link to="/checklist" className="dev-settings-link no-underline">
                <ListChecks size={16} /> Чеклист
              </Link>
              <Link to="/dev/leadership" className="dev-settings-link no-underline">
                <Shield size={16} /> Флаги руководства
              </Link>
              <Link to="/access" className="dev-settings-link no-underline">
                <KeyRound size={16} /> Доступы
              </Link>
              <Link to="/dev/cases" className="dev-settings-link no-underline">
                <Gift size={16} /> Кейсы
              </Link>
              <Link to="/dev" className="dev-settings-link no-underline">
                <Bug size={16} /> Лог ошибок
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
