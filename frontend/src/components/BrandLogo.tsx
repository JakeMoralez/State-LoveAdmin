type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClass: Record<BrandLogoSize, string> = {
  sm: 'brand-logo--sm',
  md: 'brand-logo--md',
  lg: 'brand-logo--lg',
  xl: 'brand-logo--xl',
}

interface BrandLogoProps {
  size?: BrandLogoSize
  className?: string
  plain?: boolean
}

export function BrandLogo({ size = 'md', className = '', plain = false }: BrandLogoProps) {
  if (plain) {
    return (
      <div className={`brand-logo brand-logo--plain ${sizeClass[size]} ${className}`.trim()} aria-hidden>
        <div className="brand-logo-mark" />
      </div>
    )
  }

  return (
    <div className={`brand-logo ${sizeClass[size]} ${className}`.trim()} aria-hidden>
      <div className="brand-logo-frame">
        <div className="brand-logo-frame-inner">
          <div className="brand-logo-mark" />
        </div>
      </div>
    </div>
  )
}
