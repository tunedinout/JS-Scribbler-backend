import {
  createAppFolderInDrive,
  validateUserSession,
} from '../../lib/google.js'

// const logger = getLogger(loggingContext.apis.self)
async function postDrive(req, res) {
  try {
    // const log = logger(loggingContext.apis.postDrive)
    const userId = req.session.userId
    if (!userId) res.status(401).send({ message: 'unauthorized' })
    else {
      const { accessToken } = await validateUserSession(userId)
      const folderId = await createAppFolderInDrive(accessToken)
      res.status(201).send({ id: folderId })
    }
  } catch (error) {
    console.error('failed while getting drive files', error)

    if (!res.headersSent) {
      res.status(500).send({ message: error })
    }
  }
}

export { postDrive }
