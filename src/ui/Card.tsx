import type { HTMLAttributes, PropsWithChildren } from 'react'

interface CardProps extends PropsWithChildren, HTMLAttributes<HTMLElement> {}

export function Card({ className = '', children, ...props }: CardProps) {
  return <section className={`card ${className}`.trim()} {...props}>{children}</section>
}
