import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { Alert } from '../ui/Alert'
import { useSettingsSection } from './SettingsSection'

export function ForumListKeySettings() {
  const [status, setStatus] = useState<{ configured: boolean; external_server_id: number | null } | null>(null)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useSettingsSection(Boolean(key), busy || !status && !error, 'forum-list-key')
  const load = () => { setError(''); void api.forumListKeyStatus().then(setStatus).catch(e => setError(e instanceof Error ? e.message : 'Не удалось проверить подключение')) }
  useEffect(() => { void api.forumListKeyStatus().then(setStatus).catch(e => setError(e instanceof Error ? e.message : 'Не удалось проверить подключение')) }, [])
  const save = async () => {
    setBusy(true); setError(''); setNotice('')
    try { const result = await api.forumListKeySave(key.trim()); setStatus(result); setKey(''); setNotice(result.notice || 'Ключ проверен и сохранён. Обновление форумного списка запущено.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить ключ') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!window.confirm('Отключить внешний API форумного списка и очистить его снимок? Общий шаблон сохранится.')) return
    setBusy(true); setError(''); setNotice('')
    try { setStatus(await api.forumListKeyRemove()); setKey(''); setNotice('Подключение отключено') }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось отключить API') }
    finally { setBusy(false) }
  }
  return <section className="glass-card dev-settings-block">
    <h3 className="dev-settings-block-title">Форумный список · r-arrow.ru</h3>
    <p className="fl-hint">{status ? status.configured ? `Ключ настроен${status.external_server_id ? ` · Сервер ${status.external_server_id}` : ''}` : 'Ключ не настроен' : 'Проверяем подключение…'}. Лимит сервиса — 8 запросов в минуту.</p>
    <p className="fl-hint">Новый ключ проверяется перед заменой. Значение сохраняется только на сервере и не возвращается в браузер.</p>
    {error && <Alert>{error} {!status && <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Повторить</button>}</Alert>}
    {notice && <p className="assign-success" role="status">{notice}</p>}
    <label className="staff-profile-field"><span className="staff-profile-label">Новый API-ключ r-arrow.ru</span><input type="password" aria-label="Новый API-ключ r-arrow.ru" className="control w-full" autoComplete="new-password" spellCheck={false} maxLength={512} placeholder={status?.configured ? 'Введите новый ключ для замены' : 'Введите API-ключ'} value={key} onChange={e => setKey(e.target.value)} disabled={busy} /></label>
    <div className="fl-actions" style={{ marginTop: '.8rem' }}><button type="button" className="btn btn-gold" disabled={busy || key.trim().length < 16} onClick={() => void save()}>{busy ? 'Проверяем…' : 'Проверить и сохранить ключ'}</button>{status?.configured && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void remove()}>Отключить API</button>}<Link to="/forum/list" className="btn btn-secondary">Открыть форумный список</Link></div>
  </section>
}
