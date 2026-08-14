import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { CaseRoulette } from '../components/cases/CaseRoulette'
import { useAuth } from '../context/AuthContext'
import { useMobileTopBarTitle } from '../context/MobileTopBarTitleContext'

export function LootCaseSpinPage() {
  const { id } = useParams()
  const caseId = Number(id)
  const { user, loading: authLoading } = useAuth()
  const [caseTitle, setCaseTitle] = useState('Кейс')

  useMobileTopBarTitle('Прокрутка кейса')

  useEffect(() => {
    if (!Number.isFinite(caseId)) return
    api.devCase(caseId).then((c) => setCaseTitle(c.title)).catch(() => {})
  }, [caseId])

  if (!authLoading && user && !user.can_dev_panel) {
    return <Navigate to="/dashboard" replace />
  }

  if (!Number.isFinite(caseId)) {
    return <Navigate to="/dev/cases" replace />
  }

  return (
    <div className="case-spin-page">
      <div className="case-spin-topbar">
        <Link to={`/dev/cases/${caseId}`} className="case-spin-back">
          <ArrowLeft size={16} />
          К редактору
        </Link>
      </div>

      <div className="case-spin-stage">
        <CaseRoulette caseId={caseId} caseTitle={caseTitle} />
      </div>
    </div>
  )
}
