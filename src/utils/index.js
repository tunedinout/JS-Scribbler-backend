const { enabledLoggingContexts } = require('./constants')

function getCallerFunctionName() {
  const err = new Error()
  const stackLines = err.stack?.split('\n') ?? []
  const callerLine = stackLines[3] || ''
  const match = callerLine.match(/at\s+(.*)\s+\(/)
  return match ? match[1] : 'anonymous'
}

function getLogger(...globalPrefix) {
  return function (...localPrefix) {
    return function (...params) {
      localPrefix.some(prefix => enabledLoggingContexts.includes(prefix)) &&
        console.log(
          '\x1b[36m',
          `${[...globalPrefix, ...localPrefix].map(pref => `[ ${pref} ]`).join(' ')}`,
          '\x1b[0m',
          ...params
        )
    }
  }
}

module.exports = {
  getLogger,
  getCallerFunctionName
}
