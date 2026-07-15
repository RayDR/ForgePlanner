import type { PropsWithChildren } from 'react'

export function MonthPanel({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="month-panel">
      <h3>{title}</h3>
      <div className="month-panel-body">{children}</div>
    </section>
  )
}
