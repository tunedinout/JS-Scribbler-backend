import Redis from 'ioredis'

import {
  createAppFolderInDrive,
  getDriveInstance,
  saveFileToGoogleDrive,
  UpdateScribblerFolder,
  validateUserSession,
} from '../lib/google.js'
import {
  compressToBase64,
  decompressFromBase64,
  getLogger,
  getScribbleKey,
  getScribblesKey,
  hashBuf,
} from '../utils/index.js'
import { ulid } from 'ulid'
import { loggingContext } from '../constants/index.js'

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
})
const logger = getLogger(loggingContext.workers.self)
async function getAccessToken(userId) {
  const { accessToken } = await validateUserSession(userId)
  if (!accessToken) throw new Error(`no access token found for user ${userId}`)
  return accessToken
}

async function ensureScribbleFolder({ userId, name }) {
  const log = logger(loggingContext.workers.ensureScribbleFolder)
  const accessToken = await getAccessToken(userId)
  const appFolderId = await createAppFolderInDrive(accessToken)
  const folderId = await UpdateScribblerFolder(accessToken, name, appFolderId)
  log(
    `accesToken=${accessToken},appFolderId=${appFolderId},folderId=${folderId}`,
  )
  return { accessToken, appFolderId, folderId }
}

async function flushScribbleToDrive(userId, sid) {
  const log = logger(loggingContext.workers.flushScribbleToDrive)
  const meta = await redis.hgetall(getScribbleKey({ userId, sid, p: 'meta' }))
  log(`meta:${getScribbleKey({ userId, sid, p: 'meta' })}`, meta)
  if (!meta?.name)
    throw Error(`scribble sid=${sid},userId=${userId} has no name`)

  const { accessToken, folderId } = ensureScribbleFolder({
    userId,
    name: meta.name,
    version: meta.version,
  })
  log(`accessToken=${accessToken},folderId=${folderId}`)

  const [js, css, html] = await Promise.all([
    redis.hgetall(getScribbleKey({ userId, sid, p: 'js' })),
    redis.hgetall(getScribbleKey({ userId, sid, p: 'css' })),
    redis.hgetall(getScribbleKey({ userId, sid, p: 'html' })),
  ])

  log(`scribble content:`, { js, css, html })

  const upload = async ({ filename, obj }) => {
    if (!obj?.content) return null
    const codeStr = decompressFromBase64(obj)
    const res = await saveFileToGoogleDrive(
      { filename, data: codeStr },
      accessToken,
      folderId,
    )
    log(`drive upload response`, res)
    return res?.id || res?.data?.id || null
  }

  await Promise.all([
    upload('index.js', js),
    upload('index.css', css),
    upload('index.html', html),
  ])

  //   const update = {
  //     driveId: folderId,
  //     persistedVersion: meta.version,
  //     ...(jsId && { jsFileId: jsId, dirty_js: 0 }),
  //     ...(cssId && { cssFileId: cssId, dirty_css: 0 }),
  //     ...(htmlId && { htmlFileId: htmlId, dirty_html: 0 }),
  //   }
  //   await redis.hset(getScribbleKey({ userId, sid, p: 'sync' }), update)
}

async function backFillIfEmpty(userId) {
  const log = logger(loggingContext.workers.backFillIfEmpty)
  const count = await redis.scard(getScribblesKey(userId))
  if (count > 0) {
    return
  }
  const accessToken = await getAccessToken(userId)
  const appFolderId = await createAppFolderInDrive(accessToken)
  const drive = await getDriveInstance(accessToken)
  log(`accesToken=${accessToken},appFolderId=${appFolderId}`)

  const { data } = await drive.files.list({
    q: `'${appFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
  })
  log(`data from scribbler folder:`, data.files)

  for (const f of data.files || []) {
    const { data: children } = await drive.files.list({
      q: `'${f.id}' in parents and trashed=false and (name='index.js' or name='index.css' or name='index.html')`,
      fields: 'files(id,name)',
    })
    log(`children`, children)

    const byName = Object.fromEntries(children.files.map((x) => [x.name, x.id]))
    log(`byName`, byName)

    const sid = ulid()
    const name = f.name
    log(`scribble sid=${sid}, name=${name}`)
    const pipe = redis
      .multi()
      .sadd(getScribblesKey(userId), sid)
      .hset(getScribbleKey({ userId, sid, p: 'meta' }), {
        sid,
        name,
        created: Date.now(),
        version: 1,
      })
    //   .hset(getScribbleKey({ userId, sid, p: 'sync' }), {
    //     driveId: f.id,
    //     persistedVersion: 1,
    //     lastFlushTs: Date.now(),
    //   })

    for (const [fname, part] of [
      ['index.js', 'js'],
      ['index.css', 'css'],
      ['index.html', 'html'],
    ]) {
      const fileId = byName[fname]
      // get the content
      const fileDataResponse = await drive.files.get({
        fileId,
        alt: 'media',
      })
      log(`${fname} data = `, fileDataResponse.data)
      const { data: codeString } = fileDataResponse
      // compress and save
      const setPart = (part, code) =>
        pipe.hset(getScribbleKey({ userId, sid, p: part }), {
          hash: hashBuf(compressToBase64(code)),
          gzip: 1,
          content: compressToBase64(code),
        })
      setPart(part, codeString)
    }

    await pipe.exec()
  }
}

export async function runWriter(userId) {
  const log = logger(loggingContext.workers.runWriter)
  log(`writer is running`)
  const group = 'drive-writer'
  const consumer = `worker-${process.pid}-${userId}`
  try {
    await redis.xgroup(
      'CREATE',
      'scribble:changes',
      'drive-writer',
      '$',
      'MKSTREAM',
    )
  } catch (err) {
    // BUSYGROUP means the group already exists → ignore
    if (!err.message.startsWith('BUSYGROUP')) throw err
  }

  while (true) {
    const resp = await redis.xreadgroup(
      'GROUP',
      group,
      consumer,
      'BLOCK',
      5000,
      'COUNT',
      25,
      'STREAMS',
      'scribble:changes',
      '>',
    )
    if (!resp) continue
    log(`response from redis`, resp)
    // for (const [, entries] of resp) {
    //     for(const [entryId, fields] of entries) {
    //         const obj =
    //     }
    // }
  }
}
