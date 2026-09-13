import { Scale } from 'lucide-react'
import { api } from '../api'
import { OfficeRegistryPage } from '../components/staff/OfficeRegistryPage'

export function JudgesPage() {
  return (
    <OfficeRegistryPage
      title="Судьи"
      icon={Scale}
      badge="⚖"
      assignType="judge"
      list={api.judges}
      loadOne={api.judgeMember}
    />
  )
}
