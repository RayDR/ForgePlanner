import pino from 'pino'

export const LOGGER_REDACT_PATHS = ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token', 'req.headers.x-ai-guest-csrf', 'res.headers.set-cookie', '*.password', '*.token', '*.smtpPassword', '*.goal', '*.additionalContext', '*.constraints', '*.nonNegotiables', '*.instruction', '*.refinementInstruction', '*.proposal', '*.currentProposal', '*.plan', '*.snapshot', '*.conversionSnapshot', '*.content', '*.prompt', '*.providerInput', '*.providerOutput', '*.signedProposalToken', '*.signedConversionToken', '*.guestSessionToken', '*.authorization', '*.cookie', '*.csrf', '*.response.output']

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: LOGGER_REDACT_PATHS,
    censor: '[REDACTED]',
  },
})
