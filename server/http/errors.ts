import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { logger } from '../config/logger.js'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
  }
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next
  if (error instanceof ZodError) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', fields: error.flatten().fieldErrors } })
    return
  }
  if (error instanceof ApiError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } })
    return
  }
  logger.error({ err: error }, 'Unhandled request error')
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } })
}
