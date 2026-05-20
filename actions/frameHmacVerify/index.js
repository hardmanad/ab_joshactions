const { Core } = require('@adobe/aio-sdk')
const crypto = require('crypto')
const { errorResponse } = require('../utils')

function verifySignature (secret, timestamp, rawBody, signature) {
  const message = `v0:${timestamp}:${rawBody}`
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(message).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    const { signature, timestamp, secret, body, bodyBase64 } = params

    if (!signature || !secret) {
      return errorResponse(400, 'missing required parameters: signature, secret', logger)
    }

    let rawBody = ''
    if (bodyBase64) {
      rawBody = Buffer.from(bodyBase64, 'base64').toString('utf8')
    } else if (body !== undefined) {
      rawBody = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const valid = verifySignature(secret, timestamp || '', rawBody, signature)
    logger.info(`frameHmacVerify: validation ${valid ? 'succeeded' : 'failed'}`)

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ valid })
    }
  } catch (error) {
    logger.error('Unexpected error: ' + error.message)
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main
