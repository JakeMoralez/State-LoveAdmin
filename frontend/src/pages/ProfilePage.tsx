import { useAuth } from '../context/AuthContext'
import { ProfileView } from '../components/profile/ProfileView'

export function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <ProfileView
      profile={{
        vk_id: user.vk_id,
        nickname: user.nickname,
        username: user.username,
        avatar_url: user.avatar_url,
        access_level: user.access_level,
        access_level_name: user.access_level_name,
        panel_role: user.panel_role,
        has_ca_access: user.has_ca_access,
        server_id: user.server_id,
        dev_persona: user.dev_persona,
      }}
      showQuickLinks
    />
  )
}
