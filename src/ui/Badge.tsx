import type { PropsWithChildren } from 'react'

type BadgeTone = 'slate' | 'blue' | 'green' | 'amber' | 'rose'

export function Badge({ tone = 'slate', children }: PropsWithChildren<{ tone?: BadgeTone }>) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
