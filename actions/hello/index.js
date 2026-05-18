/**
 * Sample public web action (no Adobe IMS).
 */
async function main (params) {
  const method = params.__ow_method || 'unknown'
  const path = params.__ow_path || ''

  const payload = {
    ok: true,
    message: 'Hello from Adobe I/O Runtime',
    method,
    path,
    query: params.__ow_query || {}
  }

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  }
}

exports.main = main
