/*
* <license header>
*/

/**
 * Deletes a file in Adobe cloud storage at the given path
 * (e.g. "ddf0a70e-413a-4f5a-8627-36b1a52cae51/mynewfile.psd").
 */

require('../shim-runtime-crypto')
const { Core, Files } = require('@adobe/aio-sdk')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling the main action deleteFile')

    logger.debug(stringParameters(params))

    const requiredParams = ['path']
    const requiredHeaders = ['Authorization']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    const path = typeof params.path === 'string' ? params.path.trim() : ''
    if (path.length < 3 || !path.includes('/')) {
      return errorResponse(400, 'path must be a non-empty path like "<id>/<fileName>"', logger)
    }

    const files = await Files.init()
    const deleted = await files.delete(path)

    return {
      statusCode: 200,
      body: {
        ok: true,
        path,
        deleted
      }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main
