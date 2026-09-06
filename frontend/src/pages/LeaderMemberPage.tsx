import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type LeaderMemberDetail } from '../api'
import { ProfileView } from '../components/profile/ProfileView'
import { LeaderProfileModal } from '../components/staff/LeaderProfileModal'
import { useAuth } from '../context/AuthContext'
import { effectiveLeaderPermissions } from '../lib/leaderPermissions'
import { staffLabel } from '../lib/staff'

export function LeaderMemberPage() {
  const { user } = useAuth()
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

  const perms = effectiveLeaderPermissions(
    member,
    user?.access_level ?? 0,
    user?.vk_id ?? 0,
  )
  const canOpenSettings = perms.manage_registry || perms.edit_discord

  return (
    <>
      <ProfileView
        headerActions={
          canOpenSettings ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSettingsOpen(true)}>
              Настройки
            </button>
          ) : undefined
        }
        profile={{
          vk_id: member.vk_id,
          nickname: staffLabel(member),
          username: member.username,
          avatar_url: member.avatar_url,
          access_level: 0,
          access_level_name: 'Руководство',
          access_role_title: member.position || 'Руководство',
          has_ca_access: false,
          server_id: member.server_id ?? 30,
          badges: member.badges?.length ? member.badges : ['🛡'],
          discord_id: member.discord_id,
          discord_username: member.discord_username,
          discord_display_name: member.discord_display_name,
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
