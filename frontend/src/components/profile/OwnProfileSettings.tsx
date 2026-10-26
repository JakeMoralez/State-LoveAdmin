import { useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useProfileDraft } from '../../hooks/useProfileDraft'
import { forumMemberUrl, parseForumMemberUrl } from '../../lib/forumAccount'
import { looksLikeDiscordId } from '../../lib/discordId'
import { Switch } from '../ui/Switch'
import { ContactRound, BellRing } from 'lucide-react'
import { ForumAccountField } from '../ui/ForumAccountField'
import type { ProfileViewData } from './ProfileView'

export function OwnProfileSettings({ profile, contacts = true }: { profile: ProfileViewData; contacts?: boolean }) {
  const { user, refresh } = useAuth()
  const { toast } = useToast()
  const [values, setValues] = useState({ discord: '', forum: '', tasks: true, assignments: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ forum?: string; discord?: string }>({})
  const baseline = { discord: profile.discord_id ?? '', forum: forumMemberUrl(profile.username, profile.vk_id), tasks: profile.notify_tasks !== false, assignments: profile.notify_assign !== false }
  const draft = useProfileDraft(`${user?.vk_id}:${profile.server_id}:${profile.vk_id}:preferences`, baseline, values, setValues)
  const save = async () => {
    const errors: { forum?: string; discord?: string } = {}
    if (contacts && (values.forum || baseline.forum) && !parseForumMemberUrl(values.forum).ok) errors.forum = 'Укажите ссылку или ID аккаунта на форуме'
    if (contacts && values.discord && !looksLikeDiscordId(values.discord)) errors.discord = 'Discord ID — 17–20 цифр'
    setFieldErrors(errors)
    if (Object.keys(errors).length) { setSuccess(false); return }
    setSaving(true); setError(''); setSuccess(false)
    try {
      await api.updateProfile({ ...(contacts ? { discord_id: values.discord.trim() || null, ...(values.forum.trim() ? { forum_account: values.forum.trim() } : {}) } : {}), notify_tasks: values.tasks, notify_assign: values.assignments })
      draft.clear(); toast('Настройки сохранены', 'success'); await refresh(); setSuccess(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить') }
    finally { setSaving(false) }
  }
  return <section className="profile-own-settings profile-preferences" aria-label="Личные настройки">
    <div className="profile-preferences-grid">
      {contacts && <section className="profile-preferences-card">
        <header><span className="profile-preferences-icon"><ContactRound size={19} /></span><div><h2>Контакты</h2><p>Аккаунты, связанные с вашим профилем.</p></div></header>
        <div className="profile-preferences-fields">
          <ForumAccountField id="profile-own-forum" value={values.forum} error={fieldErrors.forum} hint="Ссылка на профиль или числовой ID участника форума." onChange={forum => { setValues(v => ({ ...v, forum })); setFieldErrors(e => ({ ...e, forum: undefined })); setSuccess(false) }} />
          <label className="staff-profile-field" htmlFor="profile-own-discord">Discord ID
            <input id="profile-own-discord" aria-label="Discord ID" className="control" inputMode="numeric" autoComplete="off" value={values.discord} aria-invalid={!!fieldErrors.discord} aria-describedby="profile-discord-hint" onChange={e => { setValues(v => ({ ...v, discord: e.target.value })); setFieldErrors(e => ({ ...e, discord: undefined })); setSuccess(false) }} />
            <span id="profile-discord-hint" className={fieldErrors.discord ? 'staff-profile-error' : 'staff-profile-hint'}>{fieldErrors.discord || 'Числовой ID пользователя, а не имя Discord. Привязка используется для входа на портал.'}</span>
          </label>
        </div>
      </section>}
      <section className="profile-preferences-card">
        <header><span className="profile-preferences-icon"><BellRing size={19} /></span><div><h2>Уведомления</h2><p>Выберите, о чём бот будет сообщать вам в VK.</p></div></header>
        <div className="profile-preferences-options">
          <div className="profile-preferences-option"><div><label htmlFor="profile-notify-tasks">Задачи</label><p>Уведомления о задачах и напоминания о сроках.</p></div><Switch id="profile-notify-tasks" aria-label="Уведомления о задачах в VK" checked={values.tasks} disabled={saving} onChange={tasks => { setValues(v => ({ ...v, tasks })); setSuccess(false) }} /></div>
          <div className="profile-preferences-option"><div><label htmlFor="profile-notify-assign">Назначения</label><p>Сообщения об изменениях вашего назначения.</p></div><Switch id="profile-notify-assign" aria-label="Уведомления о назначениях в VK" checked={values.assignments} disabled={saving} onChange={assignments => { setValues(v => ({ ...v, assignments })); setSuccess(false) }} /></div>
        </div>
      </section>
    </div>
    {error && <p className="staff-profile-error" role="alert">{error}</p>}
    <footer className="profile-preferences-footer"><span role="status">{success ? 'Настройки сохранены' : draft.ready && draft.dirty ? 'Есть несохранённые изменения' : 'Изменения не внесены'}</span><div className="staff-profile-footer-actions">
      <button type="button" className="btn btn-secondary" disabled={!draft.ready || !draft.dirty || saving} onClick={() => { draft.discard(); setFieldErrors({}); setError(''); setSuccess(false) }}>Сбросить</button>
      <button type="button" className="btn btn-gold" disabled={!draft.ready || !draft.dirty || saving} onClick={() => void save()}>{saving ? 'Сохранение…' : 'Сохранить настройки'}</button>
    </div></footer>
  </section>
}
