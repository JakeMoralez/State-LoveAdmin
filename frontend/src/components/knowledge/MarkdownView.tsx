import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/utils'
import { parseGithubAlert } from './markdownAlerts'
import { normalizeKnowledgeMarkdown } from './normalizeKnowledgeMarkdown'

const SAFE_HREF = /^(https?:|mailto:|#|\/)/i

export function isSafeMarkdownHref(href: string | undefined | null): boolean {
  if (!href) return false
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) return false
  return SAFE_HREF.test(trimmed)
}

const components: Components = {
  a({ href, children, ...props }) {
    if (!isSafeMarkdownHref(href)) {
      return <span className="kb-md-link-blocked">{children}</span>
    }
    const external = /^https?:/i.test(href || '')
    return (
      <a
        href={href}
        {...props}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  },
  ul({ className, children, ...props }) {
    const task = Boolean(className?.includes('contains-task-list'))
    return (
      <ul className={cn(className, task && 'kb-md-task-list')} {...props}>
        {children}
      </ul>
    )
  },
  ol({ className, children, ...props }) {
    return (
      <ol className={cn(className)} {...props}>
        {children}
      </ol>
    )
  },
  li({ className, children, ...props }) {
    const task = Boolean(className?.includes('task-list-item'))
    return (
      <li className={cn(className, task && 'kb-md-task-item')} {...props}>
        {children}
      </li>
    )
  },
  blockquote({ children, ...props }) {
    const alert = parseGithubAlert(children)
    if (alert) {
      const { def, leadNode, body } = alert
      const Icon = def.Icon
      return (
        <aside
          className={cn('kb-md-alert', `kb-md-alert--${def.variant}`)}
          role="note"
          aria-label={def.label}
        >
          <div className="kb-md-alert-title">
            <Icon size={15} strokeWidth={2} aria-hidden />
            <span>{def.label}</span>
          </div>
          <div className="kb-md-alert-body">
            {leadNode}
            {body}
          </div>
        </aside>
      )
    }
    return <blockquote {...props}>{children}</blockquote>
  },
  table({ children, ...props }) {
    return (
      <div className="kb-md-table-wrap">
        <table {...props}>{children}</table>
      </div>
    )
  },
  img({ src, alt }) {
    if (!src || !isSafeMarkdownHref(src)) {
      return alt ? <span className="kb-md-img-fallback">{alt}</span> : null
    }
    return <img src={src} alt={alt || ''} className="kb-md-img" loading="lazy" />
  },
}

/** GFM + Enter = новая строка (как комментарии GitHub). Без rehype-raw. */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const raw = source?.trim() ? normalizeKnowledgeMarkdown(source) : '_Пусто_'
  return (
    <div className={cn('kb-md', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {raw}
      </ReactMarkdown>
    </div>
  )
}
