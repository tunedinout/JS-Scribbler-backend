const { googleApisScopes } = require('../../constants');
const {
  getUserAuthUrl,
  getAuthClient,
  verifyIdToken,
  validateUserSession,
} = require('../../lib/google');
const { mongoUpsert } = require('../../lib/mongo');
const { getLogger } = require('../../utils');
require('dotenv').config();

const logger = getLogger(loggingContext.apis.self);
async function authGet(_, res) {
  // delete any existing session data
  const log = logger(loggingContext.apis.authGet);
  try {
    const authURL = await getUserAuthUrl(googleApisScopes, {
      prompt: 'consent',
    });
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN);
    log('the auth url : ', authURL);
    res.status(200).send({ authURL });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: error });
  }
}

async function authCallbackGet(req, res) {
  const log = logger(loggingContext.apis.authCallbackGet);

  try {
    // create oauth2 client
    const { code: authCode, return: returnPath } = req.query;
    const oauth2Client = await getAuthClient();
    const oauth2ClientAccessTokenRespose =
      await oauth2Client.getToken(authCode);
    log('oauth2ClientAccessTokenRespose', oauth2ClientAccessTokenRespose);
    const {
      access_token: accessToken,
      expiry_date: expiryDate,
      refresh_token: refreshToken,
      id_token: idToken,
    } = oauth2ClientAccessTokenRespose.tokens;
    // get email from access token

    // Verify access token
    const userInfo = await verifyIdToken(idToken);
    log('userinfo', userInfo);
    const { sub: googleId, email, name } = userInfo;
    const user = await mongoUpsert(
      'users',
      { id: googleId },
      {
        email,
        name,
      },
    );
    log('mongoUpsert user', user);
    await mongoUpsert(
      'googleTokens',
      { userId: user.id },
      {
        accessToken,
        expiryDate,
        refreshToken,
      },
    );
    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) {
        log('session save error', err);
        return res.status(500).send('Session error');
      }
      log('req.session', req.session);
      log('returnPath', returnPath);
      res.redirect(process.env.GCP_CALLBACK_REDIRECT_URI);
    });
  } catch (error) {
    console.error('error occured in post /api/v1/auth', error);
    res.status(500).send({ message: error });
  }
}

async function authMeGet(req, res) {
  const log = logger(loggingContext.apis.authMeGet);
  const userId = req.session.userId;
  log('userId', req.session.userId);
  const { accessToken } = await validateUserSession(req.session.userId);
  log('accessToken', accessToken);
  if (!userId || !accessToken) {
    req.session.destroy((err) => {
      if (err) {
        log('Session destroy error....', err);
        return res.status(500).send({ message: 'Session Cleanup error' });
      }

      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      return res.status(401).send({ message: 'Unauthorized' });
    });
  } else {
    const user = await mongoGet('users', { id: req.session.userId });
    res.status(200).send({
      email: user.email,
      name: user.name,
    });
  }
}

module.exports = {
  authGet,
  authMeGet,
  authCallbackGet,
};
