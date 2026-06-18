type BrandLogoSize = 'sm' | 'md' | 'lg'

const sizeClass: Record<BrandLogoSize, string> = {
  sm: 'brand-logo--sm',
  md: 'brand-logo--md',
  lg: 'brand-logo--lg',
}

interface BrandLogoProps {
  size?: BrandLogoSize
  className?: string
}

export function BrandLogo({ size = 'md', className = '' }: BrandLogoProps) {
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
