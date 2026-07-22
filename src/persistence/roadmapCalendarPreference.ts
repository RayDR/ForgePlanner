import { GUEST_SCOPE, getIdentityScope, scopedKey } from './identityScope'

export type RoadmapCalendarPageSize = 1 | 2 | 3 | 4

const PREFERENCE_KEY = 'roadmap-calendar-page-size'

function preferenceKey() {
  return scopedKey(getIdentityScope() ?? GUEST_SCOPE, PREFERENCE_KEY)
}

export function recommendedRoadmapCalendarPageSize(viewportWidth: number): RoadmapCalendarPageSize {
  if (viewportWidth <= 600) return 1
  if (viewportWidth <= 1024) return 2
  if (viewportWidth <= 1440) return 3
  return 4
}

export function resolveRoadmapCalendarPageSize(viewportWidth: number, desktopPreference: RoadmapCalendarPageSize): RoadmapCalendarPageSize {
  return viewportWidth <= 1024 ? recommendedRoadmapCalendarPageSize(viewportWidth) : desktopPreference
}

export function readRoadmapCalendarPageSize(storage: Storage = window.localStorage): RoadmapCalendarPageSize | null {
  const value = Number(storage.getItem(preferenceKey()))
  return value >= 1 && value <= 4 && Number.isInteger(value) ? value as RoadmapCalendarPageSize : null
}

export function writeRoadmapCalendarPageSize(value: RoadmapCalendarPageSize, storage: Storage = window.localStorage) {
  storage.setItem(preferenceKey(), String(value))
}
