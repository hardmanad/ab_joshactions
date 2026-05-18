/*
* <license header>
*/

/**
 * Returns properties for a single file in Adobe Files storage (via files.getProperties).
 * Same pattern as listFiles; requires a storage path (e.g. "<uuid>/<fileName>").
 */

require('../shim-runtime-crypto')
const { Core, Files } = require('@adobe/aio-sdk')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')

function basename (remotePath) {
  if (!remotePath || typeof remotePath !== 'string') return ''
  const trimmed = remotePath.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  return i === -1 ? trimmed : trimmed.slice(i + 1)
}

function mapFile (f) {
  return {
    path: f.name,
    name: basename(f.name),
    size: f.contentLength,
    contentType: f.contentType,
    creationTime: f.creationTime,
    lastModified: f.lastModified,
    etag: f.etag,
    isDirectory: f.isDirectory,
    isPublic: f.isPublic,
    url: f.url,
    internalUrl: f.internalUrl
  }
}

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling the main action getFileProperties')

    logger.debug(stringParameters(params))

    const requiredParams = ['path']
    const requiredHeaders = ['Authorization']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    const path = typeof params.path === 'string' ? params.path.trim() : ''
    if (path.length < 3 || !path.includes('/')) {
      return errorResponse(400, 'path must be a storage path like "<id>/<fileName>"', logger)
    }

    const files = await Files.init()
    const raw = await files.getProperties(path)

    return {
      statusCode: 200,
      body: {
        ok: true,
        file: mapFile(raw)
      }
    }
  } catch (error) {
    if (error.code === 'ERROR_FILE_NOT_EXISTS') {
      return errorResponse(404, 'file not found', logger)
    }
    if (error.code === 'ERROR_BAD_FILE_TYPE') {
      return errorResponse(400, error.message || 'invalid path type for this operation', logger)
    }
    logger.error(error)
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main
