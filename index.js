const express = require('express')
const cors = require('cors')
const session = require('express-session')
const MongoStore = require('connect-mongo')
require('dotenv').config()
const {
    getUserAuthUrl,
    getAuthClient,
    createAppFolderInDrive,
    saveFileToGoogleDrive,
    updateScribblerSessionFolder,
    getDriveInstance,
    validateUserSession,
} = require('./googleApi.util')
const { verifyIdToken } = require('./session.util')
const {
    getLogger,
} = require('./util')
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
]
const fs = require('fs')
const { default: helmet } = require('helmet')
const { mongoUpsert, mongoGet } = require('./mongo.util')
const { loggingContext } = require('./constants')

const app = express()
app.use(express.json())
app.use(
    cors({
        origin: 'http://localhost:3001',
        credentials: true,
    })
)
// add CSP headers
app.use(
    session({
        store: MongoStore.create({
            mongoUrl: process.env.MONGODB_URI,
            dbName: 'JS-Scribbler',
            collectionName: 'sessions',
        }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 2 * 60 * 60 * 1000,
        },
    })
)
app.use(
    helmet({
        // NOTE: Disabled for local development
        // enable this at the time of deployment

        // hosting server might overwrite these check
        // at the time of deployment
        contentSecurityPolicy: false,
        // TODO: Enable this at the time of deployment
        // contentSecurityPolicy: {
        //     directives: {
        //         defaultSrc: ["'self'"],
        //         styleSrc: ["'self'", 'https:', "'unsafe-inline'"], // Allow styles from same origin and from jsscribbler.net
        //         scriptSrc: ["'self'"], // Allowing scripts only from self and trusted CDNs
        //         objectSrc: ["'none'"],
        //         imgSrc: ["'self'", 'data:'],
        //         fontSrc: ["'self'"],
        //         frameSrc: ["'none'"],
        //         workerSrc: ["'none'"],
        //         frameAncestors: ["'none'"],
        //         baseUri: ["'self'"],
        //         formAction: ["'self'"],
        //         upgradeInsecureRequests: [],
        //     },
        // },
        frameguard: {
            action: 'sameorigin',
        },
        hsts: {
            maxAge: 63072000, // 2 years, for Strict-Transport-Security
            includeSubDomains: true,
        },
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin',
        },
    })
)
let logger = getLogger(loggingContext.apis.self)

// send auth url to ui for user login and
// consent screen
app.get('/auth/google', async function authGet(_, res) {
    // delete any existing session data
    const log = logger(loggingContext.apis.authGet)
    try {
        const authURL = await getUserAuthUrl(SCOPES, { prompt: 'consent' })
        res.setHeader('Access-Control-Allow-Origin', '*')
        log(`the auth url : `, authURL)
        res.status(200).send({ authURL })
    } catch (error) {
        console.error(error)
        res.status(500).send({ message: error })
    }
})
app.get(`/oauth2callback`, async function authCallbackGet(req, res) {
    const log = logger(loggingContext.apis.authCallbackGet)

    try {
        // create oauth2 client
        const { code: authCode, return: returnPath } = req.query
        const oauth2Client = await getAuthClient()
        const oauth2ClientAccessTokenRespose = await oauth2Client.getToken(
            authCode
        )
        log('oauth2ClientAccessTokenRespose', oauth2ClientAccessTokenRespose)
        const {
            access_token: accessToken,
            expiry_date: expiryDate,
            refresh_token: refreshToken,
            id_token: idToken,
        } = oauth2ClientAccessTokenRespose.tokens
        // get email from access token

        // Verify access token
        const userInfo = await verifyIdToken(idToken)
        log(`userinfo`, userInfo)
        const { sub: googleId, email, name } = userInfo
        const user = await mongoUpsert(
            'users',
            { id: googleId },
            {
                email,
                name,
            }
        )
        log(`mongoUpsert user`, user)
        await mongoUpsert(
            'googleTokens',
            { userId: user.id },
            {
                accessToken,
                expiryDate,
                refreshToken,
            }
        )
        req.session.userId = user.id
        req.session.save((err) => {
            if (err) {
                log(`session save error`, err)
                return res.status(500).send('Session error')
            }
            log(`returnPath`, returnPath)
            res.redirect('http://localhost:3001')
        })
    } catch (error) {
        console.error(`error occured in post /auth/google`, error)
        res.status(500).send({ message: error })
    }
})

app.get('/api/v1/me', async function authMeGet(req, res) {
    const log = logger(loggingContext.apis.authMeGet)
    const userId = req.session.userId
    log(`userId`, req.session.userId)
    const { accessToken } = await validateUserSession(req.session.userId)
    log(`accessToken`, accessToken)
    if (!userId || !accessToken) {
        req.session.destroy((err) => {
            if (err) {
                log(`Session destroy error....`, err)
                return res
                    .status(500)
                    .send({ message: 'Session Cleanup error' })
            }

            res.clearCookie('connect.sid', {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                secure: false,
            })
            return res.status(401).send({ message: 'Unauthorized' })
        })
    } else {
        const user = await mongoGet('users', { id: req.session.userId })
        res.status(200).send({
            email: user.email,
            name: user.name,
        })
    }
})

app.post('/drive/create/folder', async function driveCreateFolderPost(req, res){
    try {
        const log = logger(loggingContext.apis.driveCreateFolderPost)
        const userId = req.session.userId
        if (!userId) res.status(401).send({ message: 'unauthorized' })
        else {
            const { accessToken } = await validateUserSession(userId)
            const folderId = await createAppFolderInDrive(accessToken)
            res.status(201).send({ id: folderId })
        }
    } catch (error) {
        console.error(`failed while getting drive files`, error)

        if (!res.headersSent) {
            res.status(500).send({ message: error })
        }
    }
})

// create a folder for a new scribbler

// user can get the files inside
app.post('/drive/folder/session', async function driveFolderSessionPost(req, res) {
    try {
        const log = logger(loggingContext.apis.driveFolderSessionPost)
        const userId = req.session.userId
        if (!userId) res.status(401).send({ message: 'unauthorized' })
        else {
            const { accessToken } = await validateUserSession(userId)
            log(`accessToken`, accessToken)
            const {
                scribblerSessionName,
                scribblerFolderId,
                js = '',
                css = '',
                html = '',
            } = req.body

            log(`scribblerSessionName`, scribblerSessionName)
            log(`scribblerFolderId`, scribblerFolderId)
            log(`js content -> `, js)
            log(`css content -> `, css)
            log(`html content -> `, html)

            if (!scribblerSessionName || !scribblerFolderId) {
                log(`return 401 in response - bad request received.`)
                return res.status(400).json({
                    message: `Missing requiredFields scribblerSessionName/scribblerFolderId`,
                })
            }

            // if scribblerSessionName folder is not there it will create
            const scribblerSessionId = await updateScribblerSessionFolder(
                accessToken,
                scribblerSessionName,
                scribblerFolderId
            )

            // create default js file
            await saveFileToGoogleDrive(
                { filename: 'index.js', data: js },
                accessToken,
                scribblerSessionId
            )

            // create the default html file
            await saveFileToGoogleDrive(
                { filename: 'index.html', data: html },
                accessToken,
                scribblerSessionId
            )

            // create the default css file
            await saveFileToGoogleDrive(
                { filename: 'index.css', data: css },
                accessToken,
                scribblerSessionId
            )
            res.location(`/drive/folder/session/${scribblerSessionId}`)
            // in update as well maintain consistency
            res.status(201).send({
                id: scribblerSessionId,
                name: scribblerSessionName,
                js,
                css,
                html,
            })
        }
    } catch (error) {
        console.error(`failed while getting drive files`, error)
        res.status(500).send({ message: error })
    }
})

app.put('/drive/folder/session/:scribblerSessionId', async function driveFolderSessionPutOne(req, res) {
    try {
        const log = logger(loggingContext.apis.driveFolderSessionPutOne)
        const userId = req.session.userId
        if (!userId) res.status(401).send({ message: 'unauthorized' })
        else {
            const { accessToken } = await validateUserSession(userId)

            const { scribblerSessionId } = req.params
            const { js = '', css = '', html = '' } = req.body

            log(`request.body`, req.body)

            log(`scribblerSessionId`, scribblerSessionId)

            if (js)
                // create the initial js file
                await saveFileToGoogleDrive(
                    { filename: 'index.js', data: js },
                    accessToken,
                    scribblerSessionId
                )
            if (html)
                // create the default html file
                await saveFileToGoogleDrive(
                    { filename: 'index.html', data: html },
                    accessToken,
                    scribblerSessionId
                )

            if (css)
                // create the default css file
                await saveFileToGoogleDrive(
                    { filename: 'index.css', data: css },
                    accessToken,
                    scribblerSessionId
                )

            // assume successs if not error thrown
            res.status(204).send()
        }
    } catch (error) {
        console.error(`failed while getting drive files`, error)
        res.status(500).send({ message: error })
    }
})

// send all the existing session names ids and timestamp
app.get('/drive/folder/sessions', async function driveFolderSessionsGet(req, res) {
    const log = logger(loggingContext.apis.driveFolderSessionsGet)
    try {
        const userId = req.session.userId
        if (!userId) res.status(401).send({ message: 'unauthorized' })
        else {
            const { accessToken } = await validateUserSession(userId)

            const { scribblerFolderId } = req.query

            log('/drive/folder/sessions -> accessToken', accessToken)
            log(
                '/drive/folder/sessions -> scribblerFolderId',
                scribblerFolderId
            )

            const drive = await getDriveInstance(accessToken)

            const response = await drive.files.list({
                q: `'${scribblerFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id,name)',
            })

            log(`session folders`, response.data)
            res.status(200).send(response.data.files)
        }
    } catch (error) {
        console.error(`error occurred while backing up files : `, error)
        res.status(500).send({ message: error.message })
    }
})

// get js, html, css from a particular scribbler session
app.get(`/drive/folder/sessions/:id`, async function driveFolderSessionsGetOne(req, res) {
    const log = logger(loggingContext.apis.driveFolderSessionsGetOne)
    try {
        // each scribbler session is folder in the google drive
        const { id: scribblerSesionId } = req.params
        log(`params received`, req.params)

        const userId = req.session.userId
        if (!userId) res.status(401).send({ message: 'unauthorized' })
        else {
            const { accessToken } = await validateUserSession(userId)
            // get the content of index.js, index.html and index.css
            const drive = await getDriveInstance(accessToken)

            // get all the files id, mimeType etc
            // make parallel calls to get contents of each file

            const response = await drive.files.list({
                fields: 'files(id,mimeType)',
                q: `'${scribblerSesionId}' in parents`,
            })

            const files = response.data.files

            const allFilesWithData = await Promise.all(
                files.map(async (file) => {
                    const { id: fileId } = file
                    const filesResponse = await drive.files.get({
                        fileId,
                        alt: 'media',
                    })
                    return { ...file, data: filesResponse.data }
                })
            )
            res.status(200).send(allFilesWithData)
        }
    } catch (error) {
        console.error(error)
        res.status(500).send(error)
    }
})
// root endpoint
app.get('/', (_, res) => {
    res.end()
})

app.listen(3000, async () => {
    console.log(`server running.... at ${3000}`)
})
