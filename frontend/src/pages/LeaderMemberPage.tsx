import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type LeaderMemberDetail } from '../api'
import { ProfileView } from '../components/profile/ProfileView'
import { LeaderProfileModal } from '../components/staff/LeaderProfileModal'

export function LeaderMemberPage() {
  const { vkId } = useParams()
  const navigate = useNavigate()
  const parsedId = vkId ? parseInt(vkId, 10) : NaN
  const [member, setMember] = useState<LeaderMemberDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const load = () => {
    if (!Number.isFinite(parsedId)) return
    setLoading(true)
    setError(null)
    api
      .leaderMember(parsedId)
      .then(setMember)
      .catch((e: unknown) => {
        setMember(null)
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось загрузить профиль')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [parsedId])

  if (!Number.isFinite(parsedId)) {
    return <div className="text-white/50">Некорректный ID</div>
  }

  if (loading) {
    return <div className="text-white/50 animate-fade-in">Загрузка профиля…</div>
  }

  if (error || !member) {
    return (
      <div>
        <p className="text-white/50">{error || 'Не найден'}</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={() => navigate('/leaders')}>
          К реестру
        </button>
      </div>
    )
  }

  const canOpenSettings = member.permissions.edit_discord

  return (
    <>
      {canOpenSettings && (
        <div className="staff-member-toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSettingsOpen(true)}>
            Настройки
          </button>
        </div>
      )}

      <ProfileView
        profile={{
          vk_id: member.vk_id,
          nickname: member.nickname,
          username: member.username,
          avatar_url: member.avatar_url,
          access_level: 0,
          access_level_name: 'Руководство',
          access_role_title: member.position || 'Руководство',
          panel_role: 'leader',
          has_ca_access: false,
          server_id: member.server_id ?? 30,
          badges: member.badges?.length ? member.badges : ['🛡'],
          sphere: member.note || undefined,
        }}
        backTo={{ label: 'Руководство', href: '/leaders' }}
      />

      <LeaderProfileModal
        member={member}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={load}
      />
    </>
  )
}
