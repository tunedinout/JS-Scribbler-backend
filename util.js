const crypto = require('crypto')
const { enabledLoggingContexts } = require('./constants')

let logger = getLogger('index.js', 'root file')

function log(...intialArguments) {
    const prefixedInitialArgs = intialArguments.map((arg) => `[${arg}]`)
    return function (...remainingArguments) {
        console.log(`${prefixedInitialArgs.join('')}`, ...remainingArguments)
    }
}
function getCallerFunctionName() {
  const err = new Error();
  const stackLines = err.stack?.split('\n') ?? [];

  // Look for the 3rd line (0 is Error, 1 is this func, 2 is caller)
  const callerLine = stackLines[3] || '';
  const match = callerLine.match(/at\s+(.*)\s+\(/);
  return match ? match[1] : 'anonymous';
}

function getLogger(...globalPrefix) {
    return function (...localPrefix) {
        return function (...params) {
            localPrefix.some( prefix => enabledLoggingContexts.includes(prefix)) && console.log(
                '\x1b[36m',
                `${[...globalPrefix, ...localPrefix]
                    .map((pref) => `[ ${pref} ]`)
                    .join(' ')}`,
                '\x1b[0m',
                ...params
            )
        }
    }
}

function cleanFolderId(folderId) {
    // Remove any leading or trailing whitespace
    folderId = folderId.trim()

    // Replace any occurrences of '\r' or '\n' with an empty string
    folderId = folderId.replace(/\r/g, '').replace(/\n/g, '')

    return folderId
}

function sanitizeHTML(inputHTML = '') {
    const log = logger(`sanitizeHTML`)
    if (!inputHTML) return ''

    const sanitizedHTML = DOMPurify.sanitize(inputHTML)
    log(`Sanitized HTML`, sanitizeHTML)
    return sanitizedHTML
}
/**
 * Extract authorization token after bearer string
 * @param {Object} req  - request object
 * @returns 
 */
function getAccessTokenFromRequestHeader(req) {
    const log = logger(`getAccessTokenFromRequestHeader`)
    const authHeader = req.headers.authorization
    log(`authHeader`, authHeader);
    const accessToken = authHeader && authHeader.split(' ')[1];
    log(`accessToken`, accessToken);
    return accessToken;
}

module.exports = {
    getLogger,
    cleanFolderId,
    sanitizeHTML,
    getAccessTokenFromRequestHeader,
    getCallerFunctionName
}
