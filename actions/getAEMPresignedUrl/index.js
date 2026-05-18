/*
* <license header>
*/

/**
 * Proxies to AEM block_download API and returns the JSON response to the caller.
 * Param: id (e.g. urn:aaid:aem:...). Forwards Authorization to AEM when present.
 */

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')

const AEM_BLOCK_DOWNLOAD_URL =
  'https://author-p142461-e1463136.adobeaemcloud.com/adobe/repository/;api=block_download;t=1776'

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling the main action getAEMPresignedUrl')

    logger.debug(stringParameters(params))

    const requiredParams = ['id']
    const requiredHeaders = ['Authorization']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    const id = typeof params.id === 'string' ? params.id.trim() : String(params.id).trim()
    if (!id) {
      return errorResponse(400, 'id must be non-empty', logger)
    }

    const url = `${AEM_BLOCK_DOWNLOAD_URL}?id=${encodeURIComponent(id)}`

    const headers = {
      Accept: 'application/json'
    }
    const authorization = params.__ow_headers?.authorization
    if (authorization) {
      headers.Authorization = authorization
    }

    const res = await fetch(url, { method: 'GET', headers })
    const text = await res.text()

    let jsonBody
    try {
      jsonBody = JSON.parse(text)
    } catch (e) {
      logger.error('AEM response was not valid JSON', e)
      return errorResponse(502, 'AEM returned a non-JSON response', logger)
    }

    return {
      statusCode: res.status,
      headers: {
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(jsonBody)
    }
  } catch (error) {
    logger.error(error)
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main
