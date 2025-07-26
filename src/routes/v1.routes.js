const { Router } = require('express');
const { authGet, authCallbackGet, authMeGet } = require('./v1/auth');
const { postDrive } = require('./v1/drive');
const {
  getScribbles,
  getScribblesOne,
  putScribble,
  postScribble,
} = require('./v1/scribbles');

const router = Router();

router.get('/auth', authGet);
router.get('/callback', authCallbackGet);
router.get('/me', authMeGet);

router.post('/drive', postDrive);

router.get('/scribbles', getScribbles);
router.post('/scribbles', postScribble);

router.get('/scribbles/:id', getScribblesOne);
router.put('/scribbles/:id', putScribble);

module.exports = {
  router,
};
