/*
* <license header>
*/

/**
 * This will take in some params and return a presigned url
 */


//const fetch = require('node-fetch')
require('../shim-runtime-crypto')
const { Core, Files, State } = require('@adobe/aio-sdk')
const { errorResponse, getBearerToken, stringParameters, checkMissingRequestInputs } = require('../utils')
const uuid = require('uuid')

// main function that will be executed by Adobe I/O Runtime
async function main (params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    // 'info' is the default level if not set
    logger.info('Calling the main action get-presigned-storage-url')

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params))

    // check for missing request input parameters and headers
    const requiredParams = ['fileName']
    const requiredHeaders = ['Authorization']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      // return and log client errors
      return errorResponse(400, errorMessage, logger)
    }

    const cscUtilKey = uuid.v4()

    // set optional post parameters if not supplied
    if(!params.expiryInSeconds){
      params.expiryInSeconds = 7200 //two hours
    }

    if(!params.permissions){
      params.permissions = 'rw'
    }

    if(params.fileName.length < 2){
      return errorResponse(400, "you need to specify a fileName", logger)
    }

    let response = {
      statusCode: 200,
      body: {
        fileName: params.fileName,
        cscUtilKey: cscUtilKey,
        expiryInSeconds: params.expiryInSeconds,
        permissions: params.permissions
      }
    }

    const files = await Files.init()
    const state = await State.init()
    const uploadPath = `${cscUtilKey}/${params.fileName}`
    const preSignUrl = await files.generatePresignURL(uploadPath, { expiryInSeconds: params.expiryInSeconds, permissions: params.permissions })
    response.body.presignedUrl = preSignUrl
    response.body.uploadPath = uploadPath //TEST

    await state.put(
      cscUtilKey,
      JSON.stringify({ preSignedData: response.body }),
      { ttl: 345600 }
    )
    
    return response
  } catch (error) {
    // log any server errors
    logger.error(error)
    // return with 500
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main