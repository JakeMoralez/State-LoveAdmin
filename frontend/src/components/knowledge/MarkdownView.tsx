import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../lib/utils'

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const text = source?.trim() ? source : '_Пусто_'
  return (
    <div className={cn('kb-md', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}
