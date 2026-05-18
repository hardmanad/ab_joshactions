/**
 * Bundled Runtime actions may not define globalThis.crypto.randomUUID, which
 * @azure/storage-blob (via aio-lib-files) requires for request correlation IDs.
 */
const nodeCrypto = require('crypto')

if (typeof globalThis.crypto?.randomUUID !== 'function') {
  globalThis.crypto = {
    ...(globalThis.crypto || {}),
    randomUUID: () => nodeCrypto.randomUUID()
  }
}
