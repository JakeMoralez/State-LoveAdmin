import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
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
import { SettingsSection, useSettingsSection } from '../components/dev/SettingsSection'
import { useUnsavedNavigationGuard } from '../hooks/useProfileDraft'

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

  useSettingsSection(dirty, saving, `chat-${chat.peer_id}`)
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
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') as SettingsTab : 'chats'
  const [visited, setVisited] = useState<SettingsTab[]>([tab])
  const loadedSections = useRef(new Set<SettingsTab>())
  const [refreshes, setRefreshes] = useState<Record<string, number>>({})
  const [sectionState, setSectionState] = useState<Record<string, { dirty: boolean; busy: boolean }>>({})
  const onReport = useCallback((key: string, dirty: boolean, busy: boolean) => setSectionState(old => old[key]?.dirty === dirty && old[key]?.busy === busy ? old : { ...old, [key]: { dirty, busy } }), [])
  const [loads, setLoads] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [notices, setNotices] = useState<Record<string, string | null>>({})
  const [catalogBaseline, setCatalogBaseline] = useState('')
  const [chats, setChats] = useState<DevChat[]>([])
  const [kinds, setKinds] = useState<DevChatKind[]>([])
  const [openPeer, setOpenPeer] = useState<number | null>(null)
  const [catalog, setCatalog] = useState<DevCatalog | null>(null)
  const loading = !!loads[tab] || Object.entries(sectionState).some(([key, state]) => key.startsWith(tab + ':') && state.busy)
  const [saving, setSaving] = useState(false)
  const error = errors[tab]
  const notice = notices[tab]
  const setError = (value: string | null) => setErrors(old => ({ ...old, [tab]: value }))
  const setNotice = (value: string | null) => setNotices(old => ({ ...old, [tab]: value }))
  const catalogDirty = !!catalog && JSON.stringify(catalog) !== catalogBaseline
  const anyDirty = catalogDirty || Object.values(sectionState).some(s => s.dirty)
  useUnsavedNavigationGuard(anyDirty, 'Есть несохранённые настройки. Уйти со страницы и потерять изменения?')

  const loadChats = useCallback(async () => {
    const data = await api.devChats()
    setChats(data.chats.map(normalizeDevChat))
    setKinds(visibleChatKinds(data.kinds))
  }, [])

  const load = useCallback(async (section: SettingsTab) => {
    setLoads(old => ({ ...old, [section]: true }))
    setErrors(old => ({ ...old, [section]: null }))
    try {
      if (section === 'chats') await loadChats()
      else if (section === 'catalog') {
        const data = await api.devCatalog()
        const normalized = { ...data, tag_spheres: Object.fromEntries(Object.entries({ ...DEFAULT_TAG_SPHERES, ...(data.tag_spheres ?? {}) }).map(([tag, sphere]) => [tag, sphere === 'server' ? 'gov_structures' : sphere])) }
        setCatalog(normalized); setCatalogBaseline(JSON.stringify(normalized))
      } else setRefreshes(old => ({ ...old, [section]: (old[section] || 0) + 1 }))
    } catch (e) { setErrors(old => ({ ...old, [section]: formatError(e) })) }
    finally { setLoads(old => ({ ...old, [section]: false })) }
  }, [loadChats])
  useEffect(() => {
    if (loadedSections.current.has(tab)) return
    loadedSections.current.add(tab)
    // Lazily mount each settings resource once; hidden panels retain their forms.
    setVisited(old => old.includes(tab) ? old : [...old, tab])
    if (tab === 'chats' || tab === 'catalog') void load(tab)
  }, [tab, load])
  const refreshActive = () => {
    const dirty = tab === 'catalog' ? catalogDirty : Object.entries(sectionState).some(([key, state]) => key.startsWith(tab + ':') && state.dirty)
    if (dirty && !window.confirm('Обновить данные этой вкладки? Несохранённые правки могут быть сброшены.')) return
    void load(tab)
  }

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
        subtitle="Беседы, справочники, подключения и параметры портала"
        shrink
        actions={
          <button type="button" className="btn btn-secondary btn-sm" onClick={refreshActive} disabled={loading || saving}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
            Обновить
          </button>
        }
      />

      <div className="dev-settings-tabs" role="tablist" aria-label="Настройки">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`settings-tab-${item.id}`}
            aria-controls={`settings-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            aria-selected={tab === item.id}
            disabled={saving}
            onKeyDown={e => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
              e.preventDefault(); const i = TABS.findIndex(t => t.id === tab)
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
              setParams({ tab: TABS[next].id }); document.getElementById(`settings-tab-${TABS[next].id}`)?.focus()
            }}
            className={tab === item.id ? 'sphere-tab sphere-tab--active' : 'sphere-tab'}
            onClick={() => {
              setParams({ tab: item.id })
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="assign-success">{notice}</p> : null}

      <SettingsSection key={`chats-${refreshes['chats'] || 0}`} id="chats" active={tab === 'chats'} visited={visited.includes('chats')} onReport={onReport}>
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
              <div hidden={openPeer !== chat.peer_id}>
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
              </div>
            </article>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection key={`catalog-${refreshes['catalog'] || 0}`} id="catalog" active={tab === 'catalog'} visited={visited.includes('catalog')} onReport={onReport}>
{catalog && <>
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
            disabled={saving || !catalogDirty}
            onClick={() => {
              setSaving(true)
              setError(null)
              setNotice(null)
              api
                .saveDevCatalog(catalog)
                .then((saved) => {
                  setCatalog(saved)
                  setCatalogBaseline(JSON.stringify(saved))
                  setNotice('Справочники сохранены')
                })
                .catch((e) => setError(formatError(e)))
                .finally(() => setSaving(false))
            }}
          >
            {saving ? 'Сохранение…' : 'Сохранить справочники'}
          </button>
        </div>
</>}
      </SettingsSection>

      <SettingsSection key={`forum-${refreshes['forum'] || 0}`} id="forum" active={tab === 'forum'} visited={visited.includes('forum')} onReport={onReport}><ForumSettingsTab /></SettingsSection>
      <SettingsSection key={`integrations-${refreshes['integrations'] || 0}`} id="integrations" active={tab === 'integrations'} visited={visited.includes('integrations')} onReport={onReport}><IntegrationsSettingsTab /></SettingsSection>
      <SettingsSection key={`portal-${refreshes['portal'] || 0}`} id="portal" active={tab === 'portal'} visited={visited.includes('portal')} onReport={onReport}><PortalSettingsTab /></SettingsSection>
      <SettingsSection key={`notifications-${refreshes['notifications'] || 0}`} id="notifications" active={tab === 'notifications'} visited={visited.includes('notifications')} onReport={onReport}><NotificationsSettingsTab /></SettingsSection>
      <SettingsSection key={`commands-${refreshes['commands'] || 0}`} id="commands" active={tab === 'commands'} visited={visited.includes('commands')} onReport={onReport}><CommandsSettingsTab /></SettingsSection>

      <SettingsSection key={`system-${refreshes['system'] || 0}`} id="system" active={tab === 'system'} visited={visited.includes('system')} onReport={onReport}>
        <div className="dev-settings-system">
          <section className="glass-card dev-settings-block">
            <h3 className="dev-settings-block-title">Другие экраны</h3>
            <div className="dev-settings-links">
              <Link to="/forum/judge-list" className="dev-settings-link no-underline">
                <ListChecks size={16} /> Список судей на форуме
              </Link>
              <Link to="/checklist" className="dev-settings-link no-underline">
                <ListChecks size={16} /> Чек-листы · архив
              </Link>
              <Link to="/dev/leadership" className="dev-settings-link no-underline">
                <Shield size={16} /> Флаги is_leader (не реестр)
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
      </SettingsSection>

    </div>
  )
}
