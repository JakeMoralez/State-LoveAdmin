import { useState } from 'react'
import { api } from '../../api'

export function ProfileConversations({ vkId }: { vkId: number }) {
  const [chats, setChats] = useState<{ peer_id: number; label: string; title?: string; present: boolean | null }[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true)
    setError('')
    try { setChats((await api.profileChats(vkId)).chats) }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось проверить беседы') }
    finally { setLoading(false) }
  }
  return <details className="glass-card lk-card profile-conversations" onToggle={e => {
    if (e.currentTarget.open && chats === null && !loading && !error) void load()
  }}>
    <summary>Беседы</summary>
    <p className="staff-profile-hint">Участие в беседе и назначение на должность учитываются отдельно.</p>
    {loading && <p role="status">Проверяем состав бесед…</p>}
    {error && <p role="alert">{error} <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>Повторить</button></p>}
    {chats && <ul>{chats.map(chat => <li key={chat.peer_id}>
      <span>{chat.title || `Беседа №${chat.peer_id - 2_000_000_000}`}</span><span>{chat.present === null ? 'Не удалось проверить' : chat.present ? 'Участвует' : 'Не участвует'}</span>
    </li>)}</ul>}
    {chats?.length === 0 && <p>Нет доступных бесед для проверки.</p>}
  </details>
}
