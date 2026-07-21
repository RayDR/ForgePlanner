import { z } from 'zod'
import { canonicalPlanSchema } from './plan.schema.js'

export const canonicalPlanJsonSchema = z.toJSONSchema(canonicalPlanSchema, { target: 'draft-7' })

