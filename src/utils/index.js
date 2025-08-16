import { enabledLoggingContexts } from '../constants/index.js'
import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

export function getCallerFunctionName() {
  const err = new Error()
  const stackLines = err.stack?.split('\n') ?? []
  const callerLine = stackLines[3] || ''
  const match = callerLine.match(/at\s+(.*)\s+\(/)
  return match ? match[1] : 'anonymous'
}

export function getLogger(...globalPrefix) {
  return function (...localPrefix) {
    return function (...params) {
      localPrefix.some((prefix) => enabledLoggingContexts.includes(prefix)) &&
        console.log(
          '\x1b[36m',
          `${[...globalPrefix, ...localPrefix].map((pref) => `[ ${pref} ]`).join(' ')}`,
          '\x1b[0m',
          ...params,
        )
    }
  }
}

export function hashBuf(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

export function gz(buf) {
  return gzipSync(buf)
}

export function gunz(buf) {
  return gunzipSync(buf)
}

/**
 * Generates a Redis key for user's list of scribbles.
 * @param {String} userId - The unique ID of the user.
 * @returns {String} Redis key in the format `user:<userId>:scribbles`
 */
export const getScribblesKey = (userId) => `user:${userId}:scribbles`

/**
 * Generates a base key for a specific scribble.
 * @param {Object} params - Parameters for key construction.
 * @param {String} params.userId - The user ID.
 * @param {String} params.sid - Scribble ID.
 * @returns {String} Redis key in the format `user:<userId>:scribble:<sid>`
 */
export const getScribbleBase = ({ userId, sid }) =>
  `user:${userId}:scribble:${sid}`

/**
 * Generates a full key for a specific part of a scribble.
 * @param {Object} params - Parameters for key construction.
 * @param {String} params.userId - The user ID.
 * @param {String} params.sid - Scribble ID.
 * @param {String} params.p - Part identifier (e.g., section or page).
 * @returns {String} Full Redis key in format `user:<userId>:scribble:<sid>:<p>`
 */
export const getScribbleKey = ({ userId, sid, p }) =>
  `${getScribbleBase({ userId, sid })}:${p}`

/**
 * Compresses a UTF-8 string and encodes it as a base64 string.
 * @param {String} codeStr - The input string to compress.
 * @returns {String} Compressed string in base64 format.
 */
export const compressToBase64 = (codeStr) =>
  gz(Buffer.from(codeStr, 'utf-8')).toString('base64')

/**
 * Decompresses a base64-encoded string if gzip flag is set.
 * @param {Object} obj - Object containing compression metadata.
 * @param {Number} obj.gzip - Indicates if content is gzipped (1 = true).
 * @param {String} obj.content - Base64 string to decompress.
 * @returns {String|undefined} Original string if compressed, otherwise undefined.
 */
export const decompressFromBase64 = (obj) =>
  Number(obj.gzip) === 1
    ? gunz(Buffer.from(obj.content, 'base64')).toString('utf8')
    : undefined
export const ifCacheToBeUpdated = (
  scribble,
  cacheMeta,
  cacheJS,
  cacheCSS,
  cacheHTML,
) => {
  const { version, js, css, html } = scribble
  const clientVersion = Number(version)
  const serverVersion = Number(cacheMeta.version)
  const isCSSDirty = cacheCSS.hash != hashBuf(compressToBase64(css))
  const isJSDirty = cacheJS.hash != hashBuf(compressToBase64(js))
  const isHTMLDirty = cacheHTML.hash != hashBuf(compressToBase64(html))
  const isDirty = isCSSDirty || isHTMLDirty || isJSDirty
  return clientVersion == serverVersion && isDirty
}

export const getConflictReturn = (
  scribble,
  cacheMeta,
  cacheJS,
  cacheCSS,
  cacheHTML,
) => {
  const { version, js, css, html } = scribble
  const clientVersion = Number(version)
  const serverVersion = Number(cacheMeta.version)
  const isCSSDirty = cacheCSS.hash != hashBuf(compressToBase64(css))
  const isJSDirty = cacheJS.hash != hashBuf(compressToBase64(js))
  const isHTMLDirty = cacheHTML.hash != hashBuf(compressToBase64(html))
  const hasConflict =
    clientVersion < serverVersion && (isCSSDirty || isHTMLDirty || isJSDirty)
  if (!hasConflict) return null
  else {
    return {
      ...scribble,
      conflict: {
        ...(isJSDirty && { js: decompressFromBase64(cacheJS) }),
        ...(isHTMLDirty && {
          html: decompressFromBase64(cacheHTML),
        }),
        ...(isCSSDirty && { css: decompressFromBase64(cacheCSS) }),
      },
    }
  }
}
