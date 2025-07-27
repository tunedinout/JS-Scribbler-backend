import { Router } from 'express'
import { authCallbackGet, authGet, authMeGet } from './v1/auth.js'
import { postDrive } from './v1/drive.js'
import {
  getScribbles,
  getScribblesOne,
  postScribble,
  putScribble,
} from './v1/scribbles.js'

const router = Router()

router.get('/auth', authGet)
router.get('/callback', authCallbackGet)
router.get('/me', authMeGet)

router.post('/drive', postDrive)

router.get('/scribbles', getScribbles)
router.post('/scribbles', postScribble)

router.get('/scribbles/:id', getScribblesOne)
router.put('/scribbles/:id', putScribble)

export default router
