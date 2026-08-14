import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, Gift, ListPlus, Pencil, Play, Save, Shuffle, Trash2 } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api, type LootCaseDetail, type LootCasePrize } from '../api'
import { PageHeader } from '../components/PageHeader'
import { ImageUploadButton } from '../components/ui/ImageUpload'
import { NumberStepper } from '../components/ui/NumberStepper'
import { CaseRarityPicker } from '../components/cases/CaseRarityPicker'
import { formatPrizeConfig, parsePrizeConfig } from '../components/cases/parsePrizeConfig'
import { rarityLabel, normalizeRarity, dropChanceRatio, formatDropChance, DEFAULT_SPIN_DURATION_MS, MIN_SPIN_DURATION_MS, MAX_SPIN_DURATION_MS, resolveSpinDurationMs } from '../components/cases/rouletteLayout'
import { useAuth } from '../context/AuthContext'

const PRIZE_LIST_PLACEHOLDER = `1кк | 20 | легендарный
5кк | 15 | эпический
20кк | 10 | редкий
Иммунитет выговора | 1
10 баллов | 30 | обычный`

type PrizeDraft = {
  title: string
  image_url: string
  weight: string
  sort_order: string
  rarity_label: string
}

const emptyPrizeDraft = (): PrizeDraft => ({
  title: '',
  image_url: '',
  weight: '1',
  sort_order: '0',
  rarity_label: '',
})

export function LootCaseEditPage() {
  const { id } = useParams()
  const caseId = Number(id)
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [data, setData] = useState<LootCaseDetail | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [spinDurationSec, setSpinDurationSec] = useState(Math.round(DEFAULT_SPIN_DURATION_MS / 1000))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prizeDraft, setPrizeDraft] = useState<PrizeDraft>(emptyPrizeDraft)
  const [editingPrizeId, setEditingPrizeId] = useState<number | null>(null)
  const [prizeListText, setPrizeListText] = useState('')
  const [replacePrizes, setReplacePrizes] = useState(false)
  const [importing, setImporting] = useState(false)
  const [shuffling, setShuffling] = useState(false)

  const load = useCallback(() => {
    if (!Number.isFinite(caseId)) return
    setLoading(true)
    setError(null)
    api
      .devCase(caseId)
      .then((res) => {
        setData(res)
        setTitle(res.title)
        setDescription(res.description)
        setCoverImageUrl(res.cover_image_url)
        setIsActive(res.is_active)
        setSpinDurationSec(Math.round(resolveSpinDurationMs(res.spin_duration_ms) / 1000))
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка загрузки')
      })
      .finally(() => setLoading(false))
  }, [caseId])

  useEffect(() => {
    load()
  }, [load])

  const saveCase = async () => {
    if (!title.trim()) {
      window.alert('Укажите название кейса')
      return
    }
    setSaving(true)
    try {
      const updated = await api.updateDevCase(caseId, {
        title: title.trim(),
        description: description.trim(),
        cover_image_url: coverImageUrl.trim(),
        is_active: isActive,
        spin_duration_ms: spinDurationSec * 1000,
      })
      setData(updated)
      setSpinDurationSec(Math.round(resolveSpinDurationMs(updated.spin_duration_ms) / 1000))
    } catch (e: unknown) {
      window.alert(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const deleteCase = async () => {
    if (!window.confirm('Удалить кейс и все призы?')) return
    try {
      await api.deleteDevCase(caseId)
      navigate('/dev/cases')
    } catch (e: unknown) {
      window.alert(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка удаления')
    }
  }

  const resetPrizeForm = () => {
    setPrizeDraft(emptyPrizeDraft())
    setEditingPrizeId(null)
  }

  const fillPrizeForm = (prize: LootCasePrize) => {
    setEditingPrizeId(prize.id)
    setPrizeDraft({
      title: prize.title,
      image_url: prize.image_url,
      weight: String(prize.weight),
      sort_order: String(prize.sort_order),
      rarity_label: normalizeRarity(prize.rarity_label),
    })
  }

  const savePrize = async () => {
    if (!prizeDraft.title.trim()) {
      window.alert('Укажите название приза')
      return
    }
    const weight = Number(prizeDraft.weight)
    const sortOrder = Number(prizeDraft.sort_order)
    if (!Number.isFinite(weight) || weight < 1) {
      window.alert('Количество в ленте должно быть не меньше 1')
      return
    }
    try {
      if (editingPrizeId) {
        await api.updateDevCasePrize(caseId, editingPrizeId, {
          title: prizeDraft.title.trim(),
          image_url: prizeDraft.image_url.trim(),
          weight,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
          rarity_label: normalizeRarity(prizeDraft.rarity_label),
        })
      } else {
        await api.createDevCasePrize(caseId, {
          title: prizeDraft.title.trim(),
          image_url: prizeDraft.image_url.trim(),
          weight,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
          rarity_label: normalizeRarity(prizeDraft.rarity_label),
        })
      }
      resetPrizeForm()
      load()
    } catch (e: unknown) {
      window.alert(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка сохранения приза')
    }
  }

  const parsedList = useMemo(() => parsePrizeConfig(prizeListText), [prizeListText])

  const importPrizeList = async () => {
    const { prizes, errors } = parsePrizeConfig(prizeListText)
    if (errors.length) {
      window.alert(errors.slice(0, 8).join('\n') + (errors.length > 8 ? `\n…ещё ${errors.length - 8}` : ''))
      return
    }
    if (prizes.length === 0) {
      window.alert('Вставьте список: каждая строка «название | количество | редкость»')
      return
    }
    if (replacePrizes && data?.prizes.length) {
      if (!window.confirm(`Удалить текущие ${data.prizes.length} призов и добавить ${prizes.length} из списка?`)) {
        return
      }
    }
    setImporting(true)
    try {
      const updated = await api.importDevCasePrizes(caseId, {
        replace: replacePrizes,
        prizes: prizes.map((p, i) => ({
          title: p.title,
          weight: p.weight,
          rarity_label: p.rarity,
          sort_order: (replacePrizes ? 0 : data?.prizes.length ?? 0) + i,
        })),
      })
      setData(updated)
      setTitle(updated.title)
      setDescription(updated.description)
      setCoverImageUrl(updated.cover_image_url)
      setIsActive(updated.is_active)
      setSpinDurationSec(Math.round(resolveSpinDurationMs(updated.spin_duration_ms) / 1000))
      setPrizeListText('')
    } catch (e: unknown) {
      window.alert(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка импорта списка')
      load()
    } finally {
      setImporting(false)
    }
  }

  const copyCurrentList = async () => {
    const text = formatPrizeConfig(data?.prizes ?? [])
    if (!text) {
      window.alert('Пока нет призов, чтобы скопировать')
      return
    }
    setPrizeListText(text)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* textarea already filled */
    }
  }

  const shufflePrizes = async () => {
    if (!data || data.prizes.length < 2 || shuffling) return
    setShuffling(true)
    try {
      const updated = await api.shuffleDevCasePrizes(caseId)
      setData(updated)
    } catch (e: unknown) {
      window.alert(e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось перемешать')
    } finally {
      setShuffling(false)
    }
  }

  const removePrize = async (prizeId: number) => {
    if (!window.confirm('Удалить приз?')) return
    try {
      await api.deleteDevCasePrize(caseId, prizeId)
      if (editingPrizeId === prizeId) resetPrizeForm()
      load()
    } catch (e: unknown) {
      window.alert(e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка удаления')
    }
  }

  if (!authLoading && user && !user.can_dev_panel) {
    return <Navigate to="/dashboard" replace />
  }

  if (loading) return <div className="page-loading">Загрузка…</div>
  if (error || !data) {
    return <div className="glass-card glass-card-pad text-red-400 text-sm">{error ?? 'Кейс не найден'}</div>
  }

  return (
    <div className="page-stack">
      <PageHeader
        section="Разработка"
        title={data.title}
        icon={Gift}
        back={{ href: '/dev/cases', label: 'Кейсы' }}
        subtitle={`${data.prizes.length} призов`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/dev/cases/${caseId}/spin`}
              className={`btn-primary btn-sm ${!data.can_spin ? 'pointer-events-none opacity-50' : ''}`}
              aria-disabled={!data.can_spin}
              title={data.can_spin ? 'Открыть режим прокрутки' : 'Нужно минимум 2 приза'}
            >
              <Play size={16} />
              Прокрутка
            </Link>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void saveCase()} disabled={saving}>
              <Save size={16} />
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm text-red-300" onClick={() => void deleteCase()}>
              <Trash2 size={16} />
              Удалить
            </button>
          </div>
        }
      />

      <div className="glass-card glass-card-pad case-edit-form">
        <div className="case-edit-grid">
          <label className="case-field">
            <span className="case-field-label">Название</span>
            <input className="control w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="case-field case-field--full">
            <span className="case-field-label">Описание</span>
            <textarea
              className="control w-full case-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Необязательно — для себя и оператора"
            />
          </label>
          <div className="case-field case-field--full">
            <span className="case-field-label">Обложка</span>
            <div className="case-cover-row">
              {coverImageUrl ? (
                <img src={coverImageUrl} alt="" className="case-cover-preview" />
              ) : (
                <div className="case-cover-preview case-cover-preview--empty">Нет изображения</div>
              )}
              <ImageUploadButton label="Загрузить обложку" onUploaded={(url) => setCoverImageUrl(url)} />
            </div>
          </div>
          <label className="case-field">
            <span className="case-field-label">Длительность прокрутки (сек)</span>
            <NumberStepper
              ariaLabel="Длительность прокрутки в секундах"
              min={MIN_SPIN_DURATION_MS / 1000}
              max={MAX_SPIN_DURATION_MS / 1000}
              value={spinDurationSec}
              onChange={setSpinDurationSec}
            />
            <span className="case-field-hint">
              Время анимации рулетки до остановки. От {MIN_SPIN_DURATION_MS / 1000} до {MAX_SPIN_DURATION_MS / 1000} секунд.
            </span>
          </label>
          <label className="ui-checkbox-label text-sm text-white/70">
            <input
              type="checkbox"
              className="ui-checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className="ui-checkbox-box" />
            Активен
          </label>
        </div>
      </div>

      <div className="glass-card glass-card-pad case-prizes-section">
        <h2 className="case-section-title">Призы</h2>

        <p className="case-section-hint">
          Шанс: сначала редкость, внутри редкости — по количеству в ленте.
          Число «в ленте» только для рулетки, на шанс не влияет.
          В списке: «1кк | 20 | легендарный».
        </p>

        <div className="case-prize-bulk">
          <div className="case-prize-bulk-head">
            <span className="case-field-label">Список</span>
            {data.prizes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyCurrentList()}>
                  <ClipboardCopy size={14} />
                  Скопировать текущий
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={data.prizes.length < 2 || shuffling}
                  onClick={() => void shufflePrizes()}
                >
                  <Shuffle size={14} />
                  Перемешать
                </button>
              </div>
            )}
          </div>
          <textarea
            className="control w-full case-prize-bulk-textarea"
            rows={10}
            spellCheck={false}
            placeholder={PRIZE_LIST_PLACEHOLDER}
            value={prizeListText}
            onChange={(e) => setPrizeListText(e.target.value)}
          />
          <div className="case-prize-bulk-foot">
            <label className="ui-checkbox-label text-sm text-white/70">
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={replacePrizes}
                onChange={(e) => setReplacePrizes(e.target.checked)}
              />
              <span className="ui-checkbox-box" />
              Заменить текущие призы
            </label>
            <span className="case-prize-bulk-meta">
              {parsedList.errors.length
                ? `${parsedList.errors.length} ошибок`
                  : parsedList.prizes.length
                    ? `${parsedList.prizes.length} призов`
                    : 'название | кол-во | редкость'}
            </span>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={importing || parsedList.prizes.length === 0}
              onClick={() => void importPrizeList()}
            >
              <ListPlus size={16} />
              {importing ? 'Добавление…' : replacePrizes ? 'Загрузить список' : 'Добавить списком'}
            </button>
          </div>
        </div>

        <div className="case-prize-form">
          <label className="case-field">
            <span className="case-field-label">Название приза</span>
            <input
              className="control w-full"
              value={prizeDraft.title}
              placeholder="Например: 50 000$"
              onChange={(e) => setPrizeDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </label>
          <label className="case-field">
            <span className="case-field-label">Сколько раз в ленте</span>
            <NumberStepper
              ariaLabel="Количество в ленте"
              min={1}
              max={200}
              value={Number(prizeDraft.weight) || 1}
              onChange={(v) => setPrizeDraft((d) => ({ ...d, weight: String(v) }))}
            />
            <span className="case-field-hint">
              Сколько карточек этого приза видно в рулетке. На шанс выпадения не влияет.
            </span>
          </label>
          <label className="case-field">
            <span className="case-field-label">Порядок в рулетке</span>
            <NumberStepper
              ariaLabel="Порядок в рулетке"
              min={0}
              max={Math.max(20, data.prizes.length + 2)}
              value={Number(prizeDraft.sort_order) || 0}
              onChange={(v) => setPrizeDraft((d) => ({ ...d, sort_order: String(v) }))}
            />
            <span className="case-field-hint">Меньше число — левее в ленте. Обычно 0, 1, 2…</span>
          </label>
          <div className="case-field case-field--full">
            <span className="case-field-label">Редкость (шанс и цвет рамки)</span>
            <CaseRarityPicker
              value={prizeDraft.rarity_label}
              onChange={(v) => setPrizeDraft((d) => ({ ...d, rarity_label: v }))}
            />
            <span className="case-field-hint">
              Обычный — самый частый, легендарный — самый редкий. Призы одной редкости делят шанс поровну.
            </span>
          </div>
          <div className="case-field case-field--image">
            <span className="case-field-label">Картинка приза</span>
            <div className="case-cover-row">
              {prizeDraft.image_url ? (
                <img src={prizeDraft.image_url} alt="" className="case-prize-thumb" />
              ) : (
                <div className="case-prize-thumb case-prize-thumb--empty">?</div>
              )}
              <ImageUploadButton
                label="Загрузить"
                onUploaded={(url) => setPrizeDraft((d) => ({ ...d, image_url: url }))}
              />
            </div>
          </div>
          <div className="case-prize-form-actions">
            <button type="button" className="btn-primary btn-sm" onClick={() => void savePrize()}>
              {editingPrizeId ? 'Обновить приз' : 'Добавить приз'}
            </button>
            {editingPrizeId && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={resetPrizeForm}>
                Отмена
              </button>
            )}
          </div>
        </div>

        {data.prizes.length === 0 ? (
          <p className="text-white/45 text-sm mt-4">Добавьте минимум 2 приза для прокрутки</p>
        ) : (
          <div className="case-prizes-table">
            <div className="case-prizes-head">
              <div>#</div>
              <div>Картинка</div>
              <div>Название</div>
              <div>В ленте</div>
              <div>Редкость</div>
              <div>Шанс</div>
              <div />
            </div>
            {data.prizes.map((prize, i) => (
              <div key={prize.id} className="case-prizes-row">
                <div>{i + 1}</div>
                <div>
                  {prize.image_url ? (
                    <img src={prize.image_url} alt="" className="case-prize-thumb" />
                  ) : (
                    <div className="case-prize-thumb case-prize-thumb--empty">?</div>
                  )}
                </div>
                <div>{prize.title}</div>
                <div>{prize.weight}</div>
                <div>{rarityLabel(prize.rarity_label)}</div>
                <div>{formatDropChance(dropChanceRatio(prize, data.prizes))}</div>
                <div className="case-prizes-row-actions">
                  <button
                    type="button"
                    className="btn-icon h-8 w-8"
                    aria-label={`Изменить приз «${prize.title}»`}
                    title="Изменить"
                    onClick={() => fillPrizeForm(prize)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon btn-icon--danger h-8 w-8"
                    aria-label={`Удалить приз «${prize.title}»`}
                    title="Удалить"
                    onClick={() => void removePrize(prize.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
