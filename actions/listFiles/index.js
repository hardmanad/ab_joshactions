/*
* <license header>
*/

/**
 * Lists all files in this app’s Adobe Files storage (private + public roots).
 * Returns one object per blob with path, size, and other RemoteFileProperties fields.
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
    logger.info('Calling the main action listFiles')

    logger.debug(stringParameters(params))

    const requiredParams = []
    const requiredHeaders = ['Authorization']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    const files = await Files.init()
    const rawList = await files.list('/')

    const items = (rawList || []).map(mapFile)

    return {
      statusCode: 200,
      body: {
        ok: true,
        count: items.length,
        files: items
      }
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main
