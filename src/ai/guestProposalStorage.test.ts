import { beforeEach, describe, expect, it } from 'vitest'
import { GUEST_SCOPE } from '../persistence/identityScope'
import { readTemporarySessionState, saveTemporarySessionState } from '../persistence/temporarySessionStorage'

class MemoryStorage implements Storage { private values = new Map<string,string>(); get length(){return this.values.size} clear(){this.values.clear()} getItem(key:string){return this.values.get(key) ?? null} key(index:number){return [...this.values.keys()][index] ?? null} removeItem(key:string){this.values.delete(key)} setItem(key:string,value:string){this.values.set(key,value)} }

describe('guest proposal temporary namespace', () => {
  const storage = new MemoryStorage()
  beforeEach(() => storage.clear())
  it('does not overwrite temporary plan state', () => { saveTemporarySessionState({ plan: 1 }, { scope: GUEST_SCOPE, storage, namespace: 'plans' }); saveTemporarySessionState({ proposal: 2 }, { scope: GUEST_SCOPE, storage, namespace: 'ai-proposals' }); expect(readTemporarySessionState({ scope: GUEST_SCOPE, storage, namespace: 'plans' })).toEqual({ plan: 1 }); expect(readTemporarySessionState({ scope: GUEST_SCOPE, storage, namespace: 'ai-proposals' })).toEqual({ proposal: 2 }) })
})
