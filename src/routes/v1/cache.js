import { loggingContext } from '../../constants/index.js'
import { validateUserSession } from '../../lib/google.js'
import {
  exists,
  getAllScribbles,
  getScribble,
  postScribble,
  putScribble,
} from '../../lib/redis.js'
import { getLogger } from '../../utils/index.js'

const logger = getLogger(loggingContext.apis.self)
export async function cachePostScribble(req, res) {
  const log = logger(loggingContext.apis.cachePostScribble)
  try {
    const userId = req.session.userId
    if (!userId) res.status(401).send({ message: 'unauthorized' })
    else {
      const { accessToken } = await validateUserSession(userId)
      log(`req.body`, req.body, accessToken)
      const { scribble } = req.body
      const createdScribble = await postScribble(scribble, userId)
      //   const folderId = await createAppFolderInDrive(accessToken)
      res.status(201).send({ scribble: createdScribble })
    }
  } catch (error) {
    log(`error occured in ${loggingContext.apis.cachePostScribble} `, error)
    res.status(500).send({ message: error })
  }
}

export async function cacheGetScribbles(req, res) {
  const log = logger(loggingContext.apis.cacheGetScribbles)
  try {
    const userId = req.session.userId
    if (!userId) res.status(401).send({ message: 'unauthorized' })
    else {
      const { accessToken } = await validateUserSession(userId)
      log(`req.session`, req.session, accessToken)
      const scribbles = await getAllScribbles(userId)
      log(`redis cache scribbles`, scribbles)
      //   const folderId = await createAppFolderInDrive(accessToken)
      res.status(200).send({ scribbles })
    }
  } catch (error) {
    log(`error occured in ${loggingContext.apis.cacheGetScribbles} `, error)
    res.status(500).send({ message: error })
  }
}

export async function cacheGetScribble(req, res) {
  const log = logger(loggingContext.apis.cacheGetScribble)
  try {
    const userId = req.session.userId
    if (!userId) res.status(401).send({ message: 'unauthorized' })
    else {
      const { accessToken } = await validateUserSession(userId)
      log(`req.session`, req.session, accessToken)
      log(`req.params`, req.params)
      const { id: sid } = req.params
      const scribble = await getScribble(userId, sid)
      log(`redis cache scribble`, scribble)
      //   const folderId = await createAppFolderInDrive(accessToken)
      res.status(200).send({ scribble })
    }
  } catch (error) {
    log(`error occured in ${loggingContext.apis.cacheGetScribble} `, error)
    res.status(500).send({ message: error })
  }
}
export async function cachePutScribble(req, res) {
  const log = logger(loggingContext.apis.cachePutScribble)
  try {
    const userId = req.session.userId
    if (!userId) res.status(401).send({ message: 'unauthorized' })
    else {
      const { accessToken } = await validateUserSession(userId)
      log(`req.session`, req.session, accessToken)
      log(`req.body`, req.body)
      if (!req.body) throw Error(`request body can not empty for PUT`)
      const { scribble, force = false } = req.body
      const changedScribble = await putScribble(userId, scribble, force)
      log(`redis cache scribble`, scribble)
      //   const folderId = await createAppFolderInDrive(accessToken)
      res.status(200).send({ scribble: changedScribble })
    }
  } catch (error) {
    log(`error occured in ${loggingContext.apis.cachePutScribble} `, error)
    res.status(500).send({ message: error })
  }
}

export async function cachePostScribbles(req, res) {
  const log = logger(loggingContext.apis.cachePostScribbles)
  try {
    const userId = req.session.userId
    if (!userId) res.status(401).send({ message: 'unauthorized' })
    else {
      const { accessToken } = await validateUserSession(userId)
      // log(`req.body`, req.body, accessToken)
      const { scribbles } = req.body
      const syncedScribbles = []
      for (const scribble of scribbles) {
        let syncedScribble = { ...scribble }
        log(`looking at`, scribble?.name)
        const ifExists = await exists(userId, scribble)
        log(`exists`, ifExists)
        if (ifExists) syncedScribble = await putScribble(userId, scribble)
        else syncedScribble = await postScribble(scribble, userId)
        syncedScribbles.push(syncedScribble)
      }

      const allUserScribbles = await getAllScribbles(userId)
      for (const userScribble of allUserScribbles) {
        if (
          !syncedScribbles.find(
            (scribble) => scribble?.sid === userScribble?.sid,
          )
        )
          syncedScribbles.push(userScribble)
      }

      // log('syncedScribbles', syncedScribbles)

      //   const folderId = await createAppFolderInDrive(accessToken)
      res.status(200).send({ scribbles: syncedScribbles })
    }
  } catch (error) {
    log(`error occured in ${loggingContext.apis.cachePostScribbles} `, error)
    res.status(500).send({ message: error })
  }
}
