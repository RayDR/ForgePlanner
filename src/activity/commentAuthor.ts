import type { SessionPayload } from '../auth/authTypes'
import type { ForgePlan } from '../types/forgePlanner'

const GUEST_AUTHOR_KEY = 'northstar:guest-comment-author'
const GUEST_AUTHOR_PATTERN = /^Guest-[A-Z0-9]{8}$/

export function readGuestCommentAuthor(storage: Storage = window.sessionStorage) {
  const value = storage.getItem(GUEST_AUTHOR_KEY)
  return value && GUEST_AUTHOR_PATTERN.test(value) ? value : null
}

export function getGuestCommentAuthor(storage: Storage = window.sessionStorage) {
  const existing = readGuestCommentAuthor(storage)
  if (existing) return existing
  const identifier = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
  const author = `Guest-${identifier}`
  storage.setItem(GUEST_AUTHOR_KEY, author)
  return author
}

export function resolveCommentAuthor(session: SessionPayload | null, storage: Storage = window.sessionStorage) {
  return session?.user.profile?.displayName?.trim() || session?.user.email || getGuestCommentAuthor(storage)
}

export function synchronizeGuestCommentAuthors(
  plan: ForgePlan,
  session: SessionPayload,
  storage: Storage = window.sessionStorage,
): ForgePlan {
  const guestAuthor = readGuestCommentAuthor(storage)
  if (!guestAuthor) return plan
  const accountAuthor = session.user.profile?.displayName?.trim() || session.user.email
  let changed = false
  const activities = plan.snapshot.activities.map((activity) => {
    const comments = activity.comments.map((comment) => {
      if (comment.author !== guestAuthor) return comment
      changed = true
      return { ...comment, author: accountAuthor }
    })
    return comments === activity.comments ? activity : { ...activity, comments }
  })
  return changed ? { ...plan, snapshot: { ...plan.snapshot, activities } } : plan
}
