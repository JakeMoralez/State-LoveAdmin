import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type StaffMemberDetail } from '../api'
import { useAuth } from '../context/AuthContext'
import { ProfileView } from '../components/profile/ProfileView'
import { StaffProfileModal } from '../components/staff/StaffProfileModal'
import { staffLabel } from '../lib/staff'
import { PageSkeleton } from '../components/ui/LoadingState'

export function StaffMemberPage() {
  const { vkId } = useParams()
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
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
    return <PageSkeleton variant="detail" label="Загрузка профиля" />
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
    perms.edit_spheres ||
    perms.edit_ca_access ||
    perms.edit_sphere ||
    perms.edit_discord ||
    perms.revoke_staff_access

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
          access_level: member.access_level,
          access_level_name: member.access_level_name,
          access_role_title: member.access_role_title,
          has_ca_access: member.has_ca_access,
          server_id: member.server_id ?? 30,
          badges: member.badges,
          sphere: member.sphere,
          spheres: member.spheres,
          is_senior: member.is_senior,
          senior_spheres: member.senior_spheres,
          discord_id: member.discord_id,
          discord_username: member.discord_username,
          discord_display_name: member.discord_display_name,
          granted_at: member.granted_at,
          promoted_at: member.promoted_at,
        }}
        backTo={{ label: 'Следящие', href: '/staff' }}
      />

      <StaffProfileModal
        member={member}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(result) => {
          if (result?.removed) {
            navigate('/staff')
            return
          }
          load()
          if (member.vk_id === user?.vk_id) {
            void refresh()
          }
        }}
        permissions={member.permissions}
      />
    </>
  )
}
