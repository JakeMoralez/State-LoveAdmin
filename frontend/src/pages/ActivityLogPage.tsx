import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { ActivityTable, ActivityToolbar } from '../components/activity/ActivityTable'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/ui/Select'
import { useAuth } from '../context/AuthContext'
import { api, type ActivityLogItem } from '../api'
import {
  ACTION_FILTER_OPTIONS,
  actionMatchesFilter,
} from '../lib/activityLabels'

export function ActivityLogPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<ActivityLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [q, setQ] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [reloadTick, setReloadTick] = useState(0)

  const canView = (user?.access_level ?? 0) >= 2

  useEffect(() => {
    if (!canView) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .activityLog({
        q: q || undefined,
        group: actionFilter !== 'all' ? actionFilter : undefined,
        limit: pageSize,
        offset,
      })
      .then((res) => {
        if (cancelled) return
        setItems(res.items)
        setTotal(res.total)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [actionFilter, canView, offset, pageSize, q, reloadTick])

  const visibleItems = useMemo(
    () => items.filter((item) => actionMatchesFilter(item.action, actionFilter)),
    [actionFilter, items],
  )
  const filtered = Boolean(q) || actionFilter !== 'all'

  const subtitle = canView
    ? total > 0
      ? `Назначения и правки на панели · ${total} записей`
      : 'Назначения и правки на панели'
    : undefined

  return (
    <div className="page-stack page-stack--activity">
      <PageHeader section="Команда" title="Журнал действий" subtitle={subtitle} icon={History} shrink />

      {!canView ? (
        <div className="page-empty-state page-empty-state--card">
          <p className="page-empty-state-title">Нет доступа</p>
          <p className="page-empty-state-hint">Журнал доступен с уровня Следящий (2)+.</p>
        </div>
      ) : (
        <section className="activity-table-card">
          <ActivityToolbar
            q={q}
            onQuery={(value) => {
              setQ(value)
              setOffset(0)
            }}
            pageSize={pageSize}
            onPageSize={(value) => {
              setPageSize(value)
              setOffset(0)
            }}
            loading={loading}
            onRefresh={() => setReloadTick((n) => n + 1)}
          >
            <Select
              className="activity-log-filter"
              size="sm"
              value={actionFilter}
              onChange={(value) => {
                setActionFilter(value)
                setOffset(0)
              }}
              options={ACTION_FILTER_OPTIONS}
            />
          </ActivityToolbar>

          <ActivityTable
            items={visibleItems}
            loading={loading}
            empty={filtered ? 'Ничего не найдено. Измените поиск или фильтр.' : 'Записей пока нет'}
            total={total}
            offset={offset}
            pageSize={pageSize}
            onPage={(page) => setOffset((page - 1) * pageSize)}
          />
        </section>
      )}
    </div>
  )
}
