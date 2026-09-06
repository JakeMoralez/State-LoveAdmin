import { ExternalLink } from 'lucide-react'
import {
  FORUM_MEMBER_URL_EXAMPLE,
  forumMemberUrl,
  parseForumMemberUrl,
} from '../../lib/forumAccount'
import { cn } from '../../lib/utils'

interface ForumAccountFieldProps {
  id: string
  label?: string
  labelClassName?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  readOnly?: boolean
  readOnlyMemberId?: string | null
  vkId?: number | null
  error?: string | null
  hint?: string | null
  placeholder?: string
}

export function ForumAccountField({
  id,
  label = 'Аккаунт на форуме',
  labelClassName,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  readOnlyMemberId,
  vkId,
  error,
  hint = null,
  placeholder = FORUM_MEMBER_URL_EXAMPLE,
}: ForumAccountFieldProps) {
  const readOnlyUrl = readOnlyMemberId ? forumMemberUrl(readOnlyMemberId, vkId) : ''

  return (
    <div className="forum-field">
      <label className={cn('forum-field-label', labelClassName)} htmlFor={id}>
        {label}
      </label>
      {readOnly ? (
        readOnlyUrl ? (
          <p className="forum-field-readonly">
            <a href={readOnlyUrl} target="_blank" rel="noreferrer" className="link-gold">
              {readOnlyUrl}
              <ExternalLink size={13} className="inline ml-1 opacity-60" />
            </a>
          </p>
        ) : (
          <p className="forum-field-readonly">—</p>
        )
      ) : (
        <>
          <input
            id={id}
            type="text"
            inputMode="url"
            autoComplete="off"
            className="control w-full"
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
          />
          {error ? (
            <p id={`${id}-error`} className="forum-field-error" role="alert">
              {error}
            </p>
          ) : hint ? (
            <p id={`${id}-hint`} className="forum-field-hint">
              {hint}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

export function validateForumField(
  raw: string,
  touched: boolean,
): { ok: boolean; message: string | null } {
  if (!touched) return { ok: true, message: null }
  const result = parseForumMemberUrl(raw)
  return result.ok ? { ok: true, message: null } : { ok: false, message: result.message }
}
