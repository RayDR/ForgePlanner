import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

interface IconButtonProps extends PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> {
  label: string
}

export function IconButton({ label, className = '', children, ...props }: IconButtonProps) {
  return (
    <button type="button" className={`icon-button ${className}`.trim()} aria-label={label} {...props}>
      {children}
      <span className="tooltip" role="tooltip">
        {label}
      </span>
    </button>
  )
}