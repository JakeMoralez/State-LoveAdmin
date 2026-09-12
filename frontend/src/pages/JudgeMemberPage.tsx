import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, type LeaderMemberDetail } from '../api'
import { ProfileView } from '../components/profile/ProfileView'
import { LeaderProfileModal } from '../components/staff/LeaderProfileModal'
import { useAuth } from '../context/AuthContext'
import { effectiveLeaderPermissions } from '../lib/leaderPermissions'
import { staffLabel } from '../lib/staff'
import { PageSkeleton } from '../components/ui/LoadingState'

export function JudgeMemberPage() {
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
      .judgeMember(parsedId)
      .then(setMember)
      .catch((e: unknown) => {
        const status = e instanceof ApiError ? e.status : typeof e === 'object' && e && 'status' in e ? Number((e as { status: unknown }).status) : NaN
        const msg = e instanceof Error ? e.message : ''
        if (status === 404 || status === 403 || /не найден в реестре/i.test(msg)) {
          setMember({
            vk_id: parsedId,
            nickname: `id${parsedId}`,
            display_name: `id${parsedId}`,
            in_registry: false,
            access_role_title: 'Без доступа',
            badges: [],
            permissions: {
              edit_nickname: false,
              edit_forum_account: false,
              edit_position: false,
              edit_note: false,
              edit_discord: false,
              clear_nickname: false,
              remove_from_registry: false,
              manage_registry: false,
            },
          })
          setError(null)
          return
        }
        setMember(null)
        setError(msg || 'Не удалось загрузить профиль')
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
        <button type="button" className="btn btn-secondary mt-4" onClick={() => navigate('/judges')}>
          К реестру
        </button>
      </div>
    )
  }

  const inRegistry = member.in_registry !== false
  const perms = effectiveLeaderPermissions(member, user?.access_level ?? 0, user?.vk_id ?? 0)
  const canOpenSettings = inRegistry && (perms.manage_registry || perms.edit_discord)

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
          access_level_name: inRegistry ? 'Судья' : 'Нет доступа',
          access_role_title:
            member.access_role_title || (inRegistry ? member.position || 'Судья' : 'Без доступа'),
          has_ca_access: false,
          server_id: member.server_id ?? 30,
          badges: member.badges?.length ? member.badges : inRegistry ? ['⚖'] : [],
          discord_id: member.discord_id,
          discord_username: member.discord_username,
          discord_display_name: member.discord_display_name,
          in_registry: inRegistry,
        }}
        backTo={{ label: 'Судьи', href: '/judges' }}
      />

      {canOpenSettings ? (
        <LeaderProfileModal
          member={member}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSaved={load}
        />
      ) : null}
    </>
  )
}
