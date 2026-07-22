import { describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '../persistence/testStorage'
import type { SessionPayload } from '../auth/authTypes'
import { getGuestCommentAuthor, resolveCommentAuthor } from './commentAuthor'
import { synchronizeGuestCommentAuthors } from './commentAuthor'
import { createForgePlanDraft } from '../hooks/useForgePlannerStore'

describe('automatic comment authors', () => {
  it('keeps a stable anonymous identifier inside one browser session', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('crypto', { randomUUID: () => '12345678-1234-4123-8123-123456789abc' })
    expect(getGuestCommentAuthor(storage)).toBe('Guest-12345678')
    expect(getGuestCommentAuthor(storage)).toBe('Guest-12345678')
    expect(getGuestCommentAuthor(new MemoryStorage())).toBe('Guest-12345678')
    vi.unstubAllGlobals()
  })

  it('uses the authenticated profile name without creating a guest identifier', () => {
    const storage = new MemoryStorage()
    const session = { user: { email: 'person@example.com', profile: { displayName: 'Alex Rivera' } } } as SessionPayload
    expect(resolveCommentAuthor(session, storage)).toBe('Alex Rivera')
    expect(storage.length).toBe(0)
  })

  it('replaces only this guest session author during explicit account sync', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('crypto', { randomUUID: () => '12345678-1234-4123-8123-123456789abc' })
    const guestAuthor = getGuestCommentAuthor(storage)
    const plan = createForgePlanDraft({ title: 'Test', description: '', startDate: '2026-08-01', endDate: '2026-08-31', planningMode: 'monthly' }, 'en', 'light', '11111111-1111-4111-8111-111111111111')
    plan.snapshot.activities = [{
      id: 'activity-1', title: 'Task', description: '', category: 'general', priority: 'medium', relationshipMode: 'independent', startDate: '2026-08-01', endDate: '2026-08-31', linkedActivityIds: [], dependencyIds: [], milestone: false, colorKey: 'blue', statusId: 'planned', notes: '', subtasks: [], history: [], monthlyEntries: {},
      comments: [{ id: 'own', author: guestAuthor, message: 'Mine', createdAt: '2026-08-01T00:00:00.000Z' }, { id: 'other', author: 'Guest-AAAAAAAA', message: 'Other', createdAt: '2026-08-01T00:00:00.000Z' }],
    }]
    const session = { user: { email: 'person@example.com', profile: { displayName: 'Alex Rivera' } } } as SessionPayload
    const synced = synchronizeGuestCommentAuthors(plan, session, storage)
    expect(synced.snapshot.activities[0].comments.map((comment) => comment.author)).toEqual(['Alex Rivera', 'Guest-AAAAAAAA'])
    expect(plan.snapshot.activities[0].comments[0].author).toBe(guestAuthor)
    vi.unstubAllGlobals()
  })
})
