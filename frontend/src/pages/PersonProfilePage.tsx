import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  api,
  ApiError,
  type LeaderMemberDetail,
  type StaffMemberDetail,
  type StaffMemberPermissions,
} from '../api'
import { useAuth } from '../context/AuthContext'
import { ProfileView } from '../components/profile/ProfileView'
import { StaffProfileModal } from '../components/staff/StaffProfileModal'
import { LeaderProfileModal } from '../components/staff/LeaderProfileModal'
import { effectiveLeaderPermissions } from '../lib/leaderPermissions'
import { profilePath } from '../lib/profileLinks'
import { staffLabel } from '../lib/staff'
import { PageSkeleton } from '../components/ui/LoadingState'

const EMPTY_STAFF_PERMS: StaffMemberPermissions = {
  edit_nickname: false,
  edit_access_level: false,
  edit_ca_access: false,
  edit_spheres: false,
  edit_sphere: false,
  edit_discord: false,
  edit_forum_account: false,
  revoke_staff_access: false,
  assign_staff: false,
  max_access_level: 0,
}

function stubStaff(vkId: number, publicId?: string): StaffMemberDetail {
  return {
    vk_id: vkId,
    public_id: publicId,
    nickname: `id${vkId}`,
    display_name: `id${vkId}`,
    username: null,
    access_level: 0,
    access_level_name: 'Нет доступа',
    access_role_title: 'Без доступа',
    badges: [],
    has_ca_access: false,
    ca_source: null,
    granted_by: null,
    granted_at: null,
    note: '',
    in_registry: false,
    permissions: EMPTY_STAFF_PERMS,
  }
}

function stubLeader(vkId: number, publicId?: string): LeaderMemberDetail {
  return {
    vk_id: vkId,
    public_id: publicId,
    nickname: `id${vkId}`,
    display_name: `id${vkId}`,
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
  }
}

function isNotInRegistryError(e: unknown): boolean {
  const status =
    e instanceof ApiError
      ? e.status
      : typeof e === 'object' && e && 'status' in e
        ? Number((e as { status: unknown }).status)
        : NaN
  const msg = e instanceof Error ? e.message : ''
  return status === 404 || status === 403 || /не найден в реестре/i.test(msg)
}

/**
 * Единая карточка человека: /profile/:profileId (публичный ID).
 * Числовой VK ID в URL резолвится и заменяется на канонический public_id.
 */
export function PersonProfilePage() {
  const { profileId } = useParams()
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const key = (profileId || '').trim()

  const [vkId, setVkId] = useState<number | null>(null)
  const [publicId, setPublicId] = useState<string | null>(null)
  const [staff, setStaff] = useState<StaffMemberDetail | null>(null)
  const [leader, setLeader] = useState<LeaderMemberDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [staffSettingsOpen, setStaffSettingsOpen] = useState(false)
  const [leaderSettingsOpen, setLeaderSettingsOpen] = useState(false)

  const loadMembers = (resolvedVk: number, resolvedPublic: string) => {
    setLoading(true)
    setError(null)
    void Promise.all([
      api.staffMember(resolvedVk).catch((e: unknown) => {
        if (isNotInRegistryError(e)) return stubStaff(resolvedVk, resolvedPublic)
        throw e
      }),
      api.leaderMember(resolvedVk).catch((e: unknown) => {
        if (isNotInRegistryError(e)) return stubLeader(resolvedVk, resolvedPublic)
        throw e
      }),
    ])
      .then(([s, l]) => {
        setStaff({ ...s, public_id: s.public_id || resolvedPublic })
        setLeader({ ...l, public_id: l.public_id || resolvedPublic })
      })
      .catch((e: unknown) => {
        setStaff(null)
        setLeader(null)
        setError(e instanceof Error ? e.message : 'Не удалось загрузить профиль')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!key) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .resolveProfile(key)
      .then((resolved) => {
        if (cancelled) return
        setVkId(resolved.vk_id)
        setPublicId(resolved.public_id)
        if (key !== resolved.public_id) {
          navigate(profilePath(resolved.public_id), { replace: true })
          return
        }
        loadMembers(resolved.vk_id, resolved.public_id)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setVkId(null)
        setPublicId(null)
        setStaff(null)
        setLeader(null)
        setError(e instanceof Error ? e.message : 'Профиль не найден')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [key, navigate])

  if (!key) {
    return <div className="text-white/50">Некорректный ID</div>
  }

  if (loading) {
    return <PageSkeleton variant="detail" label="Загрузка профиля" />
  }

  if (error || !staff || vkId == null) {
    return (
      <div>
        <p className="text-white/50">{error || 'Не найден'}</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={() => navigate(-1)}>
          Назад
        </button>
      </div>
    )
  }

  const staffInRegistry = staff.in_registry !== false && staff.access_level > 0
  const leaderInRegistry = Boolean(leader && leader.in_registry !== false)
  const preferStaff = staffInRegistry || !leaderInRegistry

  const staffPerms = staff.permissions
  const canOpenStaffSettings =
    staffInRegistry &&
    (staffPerms.edit_nickname ||
      staffPerms.edit_access_level ||
      staffPerms.edit_spheres ||
      staffPerms.edit_ca_access ||
      staffPerms.edit_sphere ||
      staffPerms.edit_discord ||
      staffPerms.revoke_staff_access)

  const leaderPerms = leader
    ? effectiveLeaderPermissions(leader, user?.access_level ?? 0, user?.vk_id ?? 0)
    : null
  const canOpenLeaderSettings =
    leaderInRegistry && leaderPerms && (leaderPerms.manage_registry || leaderPerms.edit_discord)

  const backTo = staffInRegistry
    ? { label: 'Следящие', href: '/staff' }
    : leaderInRegistry
      ? { label: 'Руководители', href: '/leaders' }
      : { label: 'Назад', href: '/dashboard' }

  const headerActions =
    canOpenStaffSettings || canOpenLeaderSettings ? (
      <div className="flex flex-wrap gap-2">
        {canOpenStaffSettings ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStaffSettingsOpen(true)}>
            Настройки штата
          </button>
        ) : null}
        {canOpenLeaderSettings ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLeaderSettingsOpen(true)}>
            Настройки руководителя
          </button>
        ) : null}
      </div>
    ) : undefined

  const reload = () => {
    if (vkId != null && publicId) loadMembers(vkId, publicId)
  }

  return (
    <>
      {preferStaff ? (
        <ProfileView
          headerActions={headerActions}
          profile={{
            vk_id: staff.vk_id,
            nickname: staffLabel(staff),
            username: staff.username,
            avatar_url: staff.avatar_url,
            access_level: staff.access_level,
            access_level_name: staff.access_level_name,
            access_role_title: staff.access_role_title,
            has_ca_access: staff.has_ca_access,
            server_id: staff.server_id ?? 30,
            badges: staff.badges,
            sphere: staff.sphere,
            spheres: staff.spheres,
            is_senior: staff.is_senior,
            senior_spheres: staff.senior_spheres,
            discord_id: staff.discord_id,
            discord_username: staff.discord_username,
            discord_display_name: staff.discord_display_name,
            granted_at: staff.granted_at,
            promoted_at: staff.promoted_at,
            in_registry: staffInRegistry,
          }}
          backTo={backTo}
        />
      ) : leader ? (
        <ProfileView
          headerActions={headerActions}
          profile={{
            vk_id: leader.vk_id,
            nickname: staffLabel(leader),
            username: leader.username,
            avatar_url: leader.avatar_url,
            access_level: 0,
            access_level_name: leaderInRegistry ? 'Руководители' : 'Нет доступа',
            access_role_title:
              leader.access_role_title ||
              (leaderInRegistry ? leader.position || 'Руководители' : 'Без доступа'),
            has_ca_access: false,
            server_id: leader.server_id ?? 30,
            badges: leader.badges?.length ? leader.badges : leaderInRegistry ? ['🛡'] : [],
            discord_id: leader.discord_id,
            discord_username: leader.discord_username,
            discord_display_name: leader.discord_display_name,
            sphere: leader.note || undefined,
            in_registry: leaderInRegistry,
          }}
          backTo={backTo}
        />
      ) : null}

      {canOpenStaffSettings ? (
        <StaffProfileModal
          member={staff}
          open={staffSettingsOpen}
          onClose={() => setStaffSettingsOpen(false)}
          onSaved={(result) => {
            if (result?.removed) {
              navigate('/staff')
              return
            }
            reload()
            if (staff.vk_id === user?.vk_id) {
              void refresh()
            }
          }}
          permissions={staff.permissions}
        />
      ) : null}

      {canOpenLeaderSettings && leader ? (
        <LeaderProfileModal
          member={leader}
          open={leaderSettingsOpen}
          onClose={() => setLeaderSettingsOpen(false)}
          onSaved={reload}
        />
      ) : null}
    </>
  )
}
