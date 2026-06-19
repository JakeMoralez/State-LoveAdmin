import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type StaffMemberDetail } from '../api'
import { ProfileView } from '../components/profile/ProfileView'
import { StaffProfileModal } from '../components/staff/StaffProfileModal'

export function StaffMemberPage() {
  const { vkId } = useParams()
  const navigate = useNavigate()
  const parsedId = vkId ? parseInt(vkId, 10) : NaN
  const [member, setMember] = useState<StaffMemberDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const load = () => {
    if (!Number.isFinite(parsedId)) return
    setLoading(true)
    setError(null)
    api
      .staffMember(parsedId)
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
        <button type="button" className="btn btn-secondary mt-4" onClick={() => navigate('/staff')}>
          К реестру
        </button>
      </div>
    )
  }

  const perms = member.permissions
  const canOpenSettings =
    perms.edit_nickname ||
    perms.edit_access_level ||
    perms.edit_ca_access ||
    perms.edit_sphere ||
    perms.edit_discord

  return (
    <>
      <div className="staff-member-toolbar">
        {canOpenSettings && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSettingsOpen(true)}>
            Настройки
          </button>
        )}
      </div>

      <ProfileView
        profile={{
          vk_id: member.vk_id,
          nickname: member.nickname,
          username: member.username,
          avatar_url: member.avatar_url,
          access_level: member.access_level,
          access_level_name: member.access_level_name,
          access_role_title: member.access_role_title,
          panel_role: member.panel_role,
          has_ca_access: member.has_ca_access,
          server_id: member.server_id ?? 30,
          badges: member.badges,
          sphere: member.sphere,
        }}
        backTo={{ label: 'Следящие', href: '/staff' }}
      />

      <StaffProfileModal
        member={member}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={load}
        permissions={member.permissions}
      />
    </>
  )
}
