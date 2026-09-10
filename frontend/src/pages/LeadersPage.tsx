import { Shield } from 'lucide-react'
import { api } from '../api'
import { OfficeRegistryPage } from '../components/staff/OfficeRegistryPage'

export function LeadersPage() {
  return (
    <OfficeRegistryPage
      title="Руководители"
      icon={Shield}
      badge="🛡"
      profilePath="/leaders"
      assignType="leader"
      list={api.leaders}
      loadOne={api.leaderMember}
      sphereFilter
      subtitleActive="Реестр лидеров и руководства · назначить — через «Назначить»"
      subtitleInactive="Снятые с реестра · без активного флага руководителя"
    />
  )
}
