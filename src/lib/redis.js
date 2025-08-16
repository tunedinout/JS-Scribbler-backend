import 'dotenv/config'
import Redis from 'ioredis'
import { ulid } from 'ulid'
import {
  compressToBase64,
  decompressFromBase64,
  getConflictReturn,
  getLogger,
  getScribbleBase,
  getScribbleKey,
  getScribblesKey,
  hashBuf,
  ifCacheToBeUpdated,
} from '../utils/index.js'
import { loggingContext } from '../constants/index.js'
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
})
const logger = getLogger(loggingContext.redisUtils.self)
redis.on('connect', () => {
  console.log(`connected to redis.....`)
})

export async function postScribble(scribble, userId) {
  const log = logger('postScribble')
  log(`args:`, [scribble, userId])
  if (!scribble || !scribble?.name)
    throw Error(`A scribble must have name and must not be undefined`)
  const sid = scribble?.sid || ulid()
  const { name, js, css, html } = scribble
  let version = scribble?.version || 1

  log(`sid`, sid)
  log(`scribble`)

  const pipe = redis.multi()

  const setPart = (part, code) =>
    pipe.hset(getScribbleKey({ userId, sid, p: part }), {
      hash: hashBuf(compressToBase64(code)),
      gzip: 1,
      content: compressToBase64(code),
    })

  setPart('js', js)
  setPart('css', css)
  setPart('html', html)

  pipe
    // add to user dict
    .sadd(getScribblesKey(userId), sid)
    .hset(getScribbleKey({ userId, sid, p: 'meta' }), {
      sid,
      name,
      created: Date.now(),
      version,
    })
    .xadd(
      'scribble:changes',
      '*',
      'u',
      userId,
      'sid',
      sid,
      'op',
      'create',
      'v',
      Number(version),
    )

  await pipe.exec()
  return { sid, name, js, css, html, version }
}

export async function putScribble(userId, scribble, force = false) {
  if (!exists(userId, scribble))
    throw new Error('Can not update scribble since it does not exist ')
  if (!userId) throw Error(`User id can not be undefined`)
  if (!scribble?.name || !scribble?.sid || !scribble?.version)
    throw Error(`A scribble must have a name,sid and a base version `)

  const log = logger(loggingContext.redisUtils.putScribble)
  log(`args:`, [scribble, userId])

  const { sid, name, js, css, html } = scribble

  // fetch from cache
  const base = getScribbleBase({ userId, sid })
  let pipe = redis.multi()
  pipe
    .hgetall(`${base}:meta`)
    .hgetall(`${base}:js`)
    .hgetall(`${base}:css`)
    .hgetall(`${base}:html`)

  const [[, cacheMeta], [, cacheJS], [, cacheCSS], [, cacheHTML]] =
    await pipe.exec()
  let cacheVersion = Number(cacheMeta.version)
  {
    // handle conflict
    if (!force) {
      log(`base key`, base)
      log(`cacheVersion`, cacheVersion)

      const conflictedReturn = getConflictReturn(
        scribble,
        cacheMeta,
        cacheJS,
        cacheCSS,
        cacheHTML,
      )
      if (conflictedReturn) return conflictedReturn
    }
  }
  let finalVersion = 1
  {
    // decide version if to be updated or early return
    const isScribbleDirty = ifCacheToBeUpdated(
      scribble,
      cacheMeta,
      cacheJS,
      cacheCSS,
      cacheHTML,
    )

    log(`isScribbleDirty`, isScribbleDirty)

    const clientVersion = Number(scribble.version)
    log('clientVersion', clientVersion)
    if (isScribbleDirty) {
      if (clientVersion > cacheVersion)
        // client version prevails
        throw new Error('Client can not  have a higher version than the cache')
      else if (clientVersion === cacheVersion) {
        finalVersion = clientVersion + 1
      } else {
        throw new Error('CONFLICT should have been handled')
      }
    } else {
      // return as it is
      return scribble
    }
  }

  pipe = redis.multi()
  const setPart = (part, code) =>
    pipe.hset(getScribbleKey({ userId, sid, p: part }), {
      hash: hashBuf(compressToBase64(code)),
      gzip: 1,
      content: compressToBase64(code),
    })

  setPart('js', js)
  setPart('css', css)
  setPart('html', html)

  let metadataKey = getScribbleKey({ userId, sid, p: 'meta' })
  pipe
    // version increment
    .hset(metadataKey, 'version', finalVersion)
    .hset(metadataKey, { ...(name & { name }), updated: Date.now() })
    .xadd(
      'scribble:changes',
      '*',
      'u',
      userId,
      'sid',
      sid,
      'op',
      'update',
      'v',
      // cache version prevails if its forced
      finalVersion,
    )

  await pipe.exec()
  return { sid, name, js, css, html, version: finalVersion }
}

export async function exists(userId, scribble) {
  const log = logger(loggingContext.redisUtils.exists)
  if (!userId || !scribble?.sid) return false
  const { sid } = scribble
  const base = getScribbleKey({ userId, sid, p: 'meta' })
  log('base', base)
  const ifExists = await redis.exists(base)
  return ifExists
}

export async function getScribble(userId, sid) {
  const log = logger(loggingContext.redisUtils.getScribble)
  log(`args:`, [userId, sid])
  const base = getScribbleBase({ userId, sid })
  log(`base key:`, base)
  const pipe = redis.multi()

  pipe
    .hgetall(`${base}:meta`)
    .hgetall(`${base}:js`)
    .hgetall(`${base}:css`)
    .hgetall(`${base}:html`)

  const [[, meta], [, js], [, css], [, html]] = await pipe.exec()

  const scribble = {
    sid,
    name: meta.name,
    version: Number(meta.version),
    js: decompressFromBase64(js),
    css: decompressFromBase64(css),
    html: decompressFromBase64(html),
  }
  log(`returned scribble`, scribble)
  return scribble
}

export async function getAllScribbles(userId) {
  const log = logger(loggingContext.redisUtils.getAllScribbles)
  log(`args`, [userId])
  if (!userId) throw Error(`user id is undefined`)

  const sids = await redis.smembers(getScribblesKey(userId))
  log(`sids`, sids)
  if (!sids.length) return []
  const pipe = redis.multi()
  sids.forEach((sid) => {
    const base = getScribbleBase({ userId, sid })
    pipe
      .hgetall(`${base}:meta`)
      .hgetall(`${base}:js`)
      .hgetall(`${base}:css`)
      .hgetall(`${base}:html`)
  })

  const rows = (await pipe.exec()).map(([, data]) => data)
  log(`rows`, rows)
  const out = []
  for (let i = 0; i < rows.length; i += 4) {
    const [meta, js, css, html] = rows.slice(i, i + 4)
    log(`destructured scribble from source`, { meta, js, css, html })
    log(`sid scribble`, sids[i / 4])
    out.push({
      sid: sids[i / 4],
      name: meta.name,
      version: Number(meta.version),
      js: decompressFromBase64(js),
      css: decompressFromBase64(css),
      html: decompressFromBase64(html),
    })
  }
  log(`returned array`, out)
  return out
}
