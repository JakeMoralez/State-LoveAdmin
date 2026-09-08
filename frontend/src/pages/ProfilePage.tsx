import { useAuth } from '../context/AuthContext'
import { ProfileView } from '../components/profile/ProfileView'

export function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <ProfileView
      profile={{
        vk_id: user.vk_id,
        nickname: user.bot_nickname ?? user.nickname,
        username: user.username,
        avatar_url: user.avatar_url,
        access_level: user.access_level,
        access_level_name: user.access_level_name,
        access_role_title: user.access_role_title,
        has_ca_access: user.has_ca_access,
        server_id: user.server_id,
        dev_persona: user.dev_persona,
        sphere: user.sphere,
        spheres: user.spheres,
        is_senior: user.is_senior,
        senior_spheres: user.senior_spheres,
        discord_id: user.discord_id,
        discord_username: user.discord_username,
        discord_display_name: user.discord_display_name,
        notify_tasks: user.notify_tasks,
        notify_assign: user.notify_assign,
        granted_at: user.granted_at,
        promoted_at: user.promoted_at,
      }}
      showQuickLinks
    />
  )
}
