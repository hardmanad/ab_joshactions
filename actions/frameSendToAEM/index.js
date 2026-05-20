/*
* <license header>
*/

const { Core } = require('@adobe/aio-sdk')
const crypto = require('crypto')
const { errorResponse } = require('../utils')

const SIGNATURE_TOLERANCE_SECONDS = 500
const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'
const FRAMEIO_API_BASE = 'https://api.frame.io/v4'
const FRAMEIO_SCOPES = 'openid,AdobeID,frame.s2s.all'
const AEM_SCOPES = 'openid,AdobeID,read_organizations,additional_info.projectedProductContext'

const FORM_RESPONSE = {
  title: 'Upload to AEM Assets',
  description: 'Enter the AEM Assets folder path where this file should be uploaded.',
  fields: [
    {
      type: 'select',
      label: 'Select the AEM Environment',
      name: 'aem_environment',
      options: [
        {
          name: 'GenStudio Solution Prod',
          value: 'https://author-p142461-e1463136.adobeaemcloud.com/'
        }
      ]
    },
    {
      type: 'text',
      label: 'AEM Folder Path (relative to /content/dam/)',
      name: 'aem_folder_path',
      description: 'Type the AEM Assets folder path where this file should be uploaded'
    }
  ]
}

function verifySignature (secret, timestamp, rawBody, signature) {
  const message = `v0:${timestamp}:${rawBody}`
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(message).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

async function getImsToken (clientId, clientSecret, scopes) {
  const res = await fetch(IMS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: scopes
    }).toString()
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`IMS token request failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.access_token
}

async function getFrameAsset (accountId, fileId, token) {
  const url = `${FRAMEIO_API_BASE}/accounts/${accountId}/files/${fileId}` +
    '?include=media_links.original,media_links.high_quality,metadata'
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Frame.io asset fetch failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function getFrameioFileMetadata (accountId, fileId, token) {
  const url = `${FRAMEIO_API_BASE}/accounts/${accountId}/files/${fileId}/metadata?show_null=true`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Frame.io metadata fetch failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function updateFrameioMetadata (accountId, projectId, fileId, fieldDefinitionId, value, token) {
  const url = `${FRAMEIO_API_BASE}/accounts/${accountId}/projects/${projectId}/metadata/values`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: {
        file_ids: [fileId],
        values: [{ field_definition_id: fieldDefinitionId, value }]
      }
    })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Frame.io metadata update failed (${res.status}): ${text}`)
  }
}

async function getAllFrameioUsers (accountId, token, logger) {
  const allUsers = []
  let url = `${FRAMEIO_API_BASE}/accounts/${accountId}/users?include_total_count=true&page_size=100`

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Frame.io users fetch failed (${res.status}): ${text}`)
    }
    const json = await res.json()

    for (const item of (json.data || [])) {
      allUsers.push(item.user)
    }
    const next = json.links?.next
    url = next ? (next.startsWith('http') ? next : `https://api.frame.io${next}`) : null
  }

  return allUsers
}

async function addFrameioComment (accountId, fileId, commentText, token) {
  const url = `${FRAMEIO_API_BASE}/accounts/${accountId}/files/${fileId}/comments`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ data: { text: commentText } })
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Frame.io comment creation failed (${res.status}): ${errText}`)
  }
  return res.json()
}

async function importAssetToAem (aemHost, folderPath, asset, clientId, token) {
  const host = aemHost.replace(/\/$/, '')
  const folder = `/content/dam/${folderPath.replace(/^\//, '')}`
  const url = `${host}/adobe/assets/import/fromUrl`

  const body = {
    folder,
    assetMetadata: {
      weframeid: asset.id,
      framelink: asset.view_url
    },
    files: [
      {
        fileName: asset.name,
        mimeType: asset.media_type,
        fileSize: asset.file_size,
        url: asset.media_links.original.download_url
      }
    ]
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Api-Key': clientId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AEM import request failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function pollAemImportJob (aemHost, jobId, clientId, token, logger) {
  const host = aemHost.replace(/\/$/, '')
  const url = `${host}/adobe/assets/import/jobs/${jobId}/result`
  const maxAttempts = 20
  const intervalMs = 3000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Api-Key': clientId
      }
    })

    if (res.status === 404) {
      // still processing — keep waiting
    } else if (!res.ok) {
      const text = await res.text()
      throw new Error(`AEM import job result check failed (${res.status}): ${text}`)
    } else {
      const result = await res.json()
      const items = result.items || []
      const failed = items.filter(i => i.status === 'failed')
      if (failed.length > 0) {
        throw new Error(`AEM import job had failed items: ${JSON.stringify(failed)}`)
      }
      if (items.length > 0 && items.every(i => i.status === 'imported')) {
        logger.info(`AEM import job ${jobId} — completed (${items.length} item(s))`)
        return result
      }
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }

  throw new Error(`AEM import job ${jobId} timed out after ${(maxAttempts * intervalMs) / 1000}s`)
}

// Invokes this same action non-blocking so Frame.io gets an immediate 200.
// OpenWhisk injects default params (IMS_CLIENT_ID etc.) on every invocation,
// so only dynamic data needs to be forwarded.
async function invokeSelfAsync (payload) {
  const host = process.env.__OW_API_HOST || 'https://adobeioruntime.net'
  const apiKey = process.env.__OW_API_KEY
  const namespace = process.env.__OW_NAMESPACE
  // __OW_ACTION_NAME format: /{namespace}/{package}/{action}
  const actionPath = (process.env.__OW_ACTION_NAME || '').split('/').slice(2).join('/')

  const url = `${host}/api/v1/namespaces/${encodeURIComponent(namespace)}/actions/${actionPath}?blocking=false`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(apiKey).toString('base64'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`async self-invocation failed (${res.status}): ${text}`)
  }
}

async function processUpload (params, logger) {
  const { IMS_CLIENT_ID: clientId, IMS_CLIENT_SECRET: clientSecret } = params
  if (!clientId || !clientSecret) {
    logger.error('IMS_CLIENT_ID or IMS_CLIENT_SECRET is not configured')
    return
  }

  const {
    account_id: accountId,
    project_id: projectId,
    user_id: userId,
    resources,
    aem_environment: aemEnvironment,
    aem_folder_path: aemFolderPath
  } = params

  const [frameioToken, aemToken] = await Promise.all([
    getImsToken(clientId, clientSecret, FRAMEIO_SCOPES),
    getImsToken(clientId, clientSecret, AEM_SCOPES)
  ])
  logger.info('IMS tokens acquired')

  const allUsers = await getAllFrameioUsers(accountId, frameioToken, logger)
  const triggeringUser = allUsers.find(u => u.id === userId)
  const userName = triggeringUser?.name || userId

  const repoId = aemEnvironment.replace(/^https?:\/\//, '').replace(/\/$/, '')

  for (const resource of resources) {
    const asset = await getFrameAsset(accountId, resource.id, frameioToken)
    const assetData = asset.data

    logger.info(`importing "${assetData.name}" to AEM: ${aemFolderPath}`)
    const importResult = await importAssetToAem(aemEnvironment, aemFolderPath, assetData, clientId, aemToken)

    const jobResult = await pollAemImportJob(aemEnvironment, importResult.id, clientId, aemToken, logger)

    const aemAssetUrn = jobResult.items[0]?.assetId
    const aemAssetUuid = aemAssetUrn?.replace('urn:aaid:aem:', '')

    const metadataResponse = await getFrameioFileMetadata(accountId, resource.id, frameioToken)
    const aemAssetIdField = (metadataResponse.data?.metadata || [])
      .find(f => f.field_definition_name === 'AEM Asset ID')

    if (!aemAssetIdField) {
      logger.error(`asset ${resource.id} has no "AEM Asset ID" metadata field — skipping writeback`)
      continue
    }

    await updateFrameioMetadata(accountId, projectId, resource.id, aemAssetIdField.field_definition_id, aemAssetUuid, frameioToken)
    logger.info(`asset "${assetData.name}" complete — AEM UUID written back to Frame.io`)

    const damPath = `/content/dam/${aemFolderPath.replace(/^\//, '')}/${assetData.name}`
    const assetLink = `https://experience.adobe.com/?repoId=${repoId}#/@bilbroug/assets/detail${damPath}`
    const comment = `Uploaded to AEM by: ${userName}\nUploaded to: ${aemFolderPath}\nAsset Link: ${assetLink}`

    await addFrameioComment(accountId, resource.id, comment, frameioToken)
    logger.info(`comment posted on Frame.io asset "${assetData.name}"`)
  }
}

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    // Async processing path — invoked by self, Frame.io already received 200
    if (params._async) {
      logger.info('frameSendToAEM async processing started')
      await processUpload(params, logger)
      return { statusCode: 200, body: '{}' }
    }

    // Webhook path — respond to Frame.io as fast as possible
    logger.info('frameSendToAEM invoked')

    const headers = params.__ow_headers || {}
    const timestamp = headers['x-frameio-request-timestamp']
    const signature = headers['x-frameio-signature']

    if (!timestamp || !signature) {
      return errorResponse(401, 'missing Frame.io signature headers', logger)
    }

    const now = Math.floor(Date.now() / 1000)
    if (now - parseInt(timestamp, 10) > SIGNATURE_TOLERANCE_SECONDS) {
      return errorResponse(401, 'request timestamp too old', logger)
    }

    const secret = params.FRAMEIO_SECRET
    if (!secret) {
      logger.error('FRAMEIO_SECRET is not configured')
      return errorResponse(500, 'server configuration error', logger)
    }

    const rawBody = params.__ow_body
      ? Buffer.from(params.__ow_body, 'base64').toString('utf8')
      : ''

    if (!verifySignature(secret, timestamp, rawBody, signature)) {
      logger.info('rejected request with invalid signature')
      return errorResponse(401, 'invalid signature', logger)
    }

    let body
    try {
      body = JSON.parse(rawBody)
    } catch {
      return errorResponse(400, 'invalid JSON body', logger)
    }

    if (!body.data || Object.keys(body.data).length === 0) {
      logger.info('returning form prompt')
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(FORM_RESPONSE)
      }
    }

    const { aem_environment: aemEnvironment, aem_folder_path: aemFolderPath } = body.data

    if (!aemEnvironment || typeof aemEnvironment !== 'string' ||
        !aemFolderPath || typeof aemFolderPath !== 'string') {
      return errorResponse(400, 'data must include aem_environment and aem_folder_path', logger)
    }

    const resources = Array.isArray(body.resources) ? body.resources : []
    if (resources.length === 0) {
      return errorResponse(400, 'no resources provided', logger)
    }

    await invokeSelfAsync({
      _async: true,
      account_id: body.account_id,
      project_id: body.project?.id,
      user_id: body.user?.id,
      resources,
      aem_environment: aemEnvironment,
      aem_folder_path: aemFolderPath
    })

    logger.info(`async upload triggered for ${resources.length} resource(s) → ${aemEnvironment} / ${aemFolderPath}`)

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ title: 'Success' })
    }
  } catch (error) {
    logger.error('Unexpected error: ' + error.message)
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main
