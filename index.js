const express = require('express')
const cors = require('cors')
const {
    getAppCredentials,
    getUserAuthUrl,
    getAuthClient,
    createAppFolderInDrive,
    saveFileToGoogleDrive,
    updateScribblerSessionFolder,
    validateAccessToken,
    getDriveInstance,
} = require('./googleApi.util')
const { verifyIdToken, storeSession, getSession } = require('./session.util')
const {
    encryptToken,
    decryptToken,
    getLogger,
    cleanFolderId,
    sanitizeHTML,
    getAccessTokenFromBearerToken,
    getAccessTokenFromRequestHeader,
} = require('./util')
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    // test upload files wihtout the scopes below
    // i posit we dont need this
    // this was one of the sol;ution to solve the problem
    // of files not getting saved in the folder
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata',
    //
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
]
const fs = require('fs')
const { default: helmet } = require('helmet')

const app = express()
app.use(express.json())
app.use(cors())
// add CSP headers
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
let logger = getLogger('index.js', 'root file')

// send auth url to ui for user login and
// consent screen
app.get('/auth/google', async (_, res) => {
    // delete any existing session data
    const log = logger('/auth/google - GET')
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

// possibly to see if the authCode is expired
app.post('/auth/google', async (req, res) => {
    const log = logger(`auth/google - POST`)
    try {
        const credsJSON = await getAppCredentials()
        const { client_secret } = credsJSON
        // create oauth2 client
        const { authCode } = req.body
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
        const existingSessionResponse = await getSession(userInfo.email)

        log(`existing session`, existingSessionResponse)

        // encrypt access Token, refresh token and idToken

        const encryptedObj = {
            // sessionId,
            // deviceId,
            name: userInfo.name,
            email: userInfo.email,
            accessToken: encryptToken(accessToken, client_secret),
            expiryDate,
            refreshToken: encryptToken(refreshToken, client_secret),
        }
        res.status(201).send(encryptedObj)
    } catch (error) {
        console.error(`error occured in post /auth/google`, error)
        res.status(500).send({ message: error })
    }
})

app.post('/auth/google/refresh', async (req, res) => {
    const log = logger('/auth/google/refresh - POST')
    try {
        const { refreshToken } = req.body
        const client = await getAuthClient()
        const { client_secret } = await getAppCredentials()
        const decodedRefreshToken = decryptToken(refreshToken, client_secret)

        log('decodedRefreshToken', decodedRefreshToken)
        log('refreshToken', refreshToken)

        client.setCredentials({
            refresh_token: decodedRefreshToken || refreshToken,
        })
        const credentialResponse = await client.getAccessToken()

        log(`credentialResponse`, credentialResponse)

        const { access_token, id_token, expiry_date } =
            credentialResponse.res.data

        const userInfo = await verifyIdToken(id_token)
        const { name, email } = userInfo
        res.status(201).send({
            accessToken: encryptToken(access_token, client_secret),
            refreshToken: encryptToken(refreshToken, client_secret),
            email,
            name,
            expiryDate: expiry_date,
        })
    } catch (error) {
        console.error(`failed while refreshing token`, error)
        res.status(500).send({message: `Something went wrong while refreshing the token. Please try again later.`})
    }
})

// app.post('/auth/google/userinfo')

app.post('/drive/create/folder', async (req, res) => {
    try {
        const log = logger(`/drive/create/folder`)
        const accessToken = getAccessTokenFromRequestHeader(req)
        const isTokenValid = await validateAccessToken(accessToken)
        if (!isTokenValid) {
            return res.status(401).json({ message: `acccess token expired!` })
        }

        const folderId = await createAppFolderInDrive(accessToken)
        // const drive = google.drive({version: 'v3', oauth_token: `Bearer ${decryptedAccessToken}`})
        // log(`create app folder response`,   folderId);
        // send only folder id
        res.status(201).send({ id: folderId })
    } catch (error) {
        console.error(`failed while getting drive files`, error)

        if (!res.headersSent) {
            res.status(500).send({ message: error })
        }
    }
})

// create a folder for a new scribbler

// user can get the files inside
app.post('/drive/folder/session', async (req, res) => {
    try {
        const log = logger(`/drive/folder/session - POST`)
        const accessToken = getAccessTokenFromRequestHeader(req)
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

        const isTokenValid = await validateAccessToken(accessToken)
        if (!isTokenValid) {
            return res
                .status(401)
                .json({ message: `acccess token expired/invalid!` })
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
    } catch (error) {
        console.error(`failed while getting drive files`, error)
        res.status(500).send({ message: error })
    }
})

app.put('/drive/folder/session/:scribblerSessionId', async (req, res) => {
    try {
        const log = logger(`/drive/create/folder/session`)
        const accessToken = getAccessTokenFromRequestHeader(req)
        const { scribblerSessionId } = req.params
        const { js = '', css = '', html = '' } = req.body

        log(`request.body`, req.body)

        if (!accessToken || !scribblerSessionId)
            res.status(400).json({
                message: `Missing requiredFields accessToken/scribblerSessionId`,
            })
        const isTokenValid = await validateAccessToken(accessToken)
        if (!isTokenValid) {
            log(`API token as expired`)
            return res.status(401).json({ message: `acccess token expired!` })
        }

        log(`token is valid`)

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
    } catch (error) {
        console.error(`failed while getting drive files`, error)
        res.status(500).send({ message: error })
    }
})

// send all the existing session names ids and timestamp
app.get('/drive/folder/sessions', async (req, res) => {
    const log = logger('/drive/folder/sessions')
    try {
        const accessToken = getAccessTokenFromRequestHeader(req)
        const { scribblerFolderId } = req.query

        log('/drive/folder/sessions -> accessToken', accessToken)
        log('/drive/folder/sessions -> scribblerFolderId', scribblerFolderId)

        if (!accessToken || !scribblerFolderId)
            res.status(400).json({
                message: `Missing requiredFields accessToken/scribblerFolderId`,
            })
        const isTokenValid = await validateAccessToken(accessToken)
        if (!isTokenValid) {
            log(`API token as expired`)
            return res.status(401).json({ message: `acccess token expired!` })
        }

        const drive = await getDriveInstance(accessToken)

        const response = await drive.files.list({
            q: `'${scribblerFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id,name)',
        })

        log(`session folders`, response.data)
        res.status(200).send(response.data.files)
    } catch (error) {
        console.error(`error occurred while backing up files : `, error)
        res.status(500).send({ message: error.message })
    }
})

// get js, html, css from a particular scribbler session
app.get(`/drive/folder/sessions/:id`, async (req, res) => {
    const log = logger(`/drive/folder/session/:id`)
    try {
        // each scribbler session is folder in the google drive
        const { id: scribblerSesionId } = req.params
        log(`params received`, req.params)
        const accessToken = getAccessTokenFromRequestHeader(req)

        if (!accessToken || !scribblerSesionId)
            res.status(400).json({
                message: `Missing requiredFields accessToken/scribblerSesionId`,
            })
        const isTokenValid = await validateAccessToken(accessToken)
        if (!isTokenValid) {
            log(`API token as expired`)
            return res.status(401).json({ message: `acccess token expired!` })
        }
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
    } catch (error) {
        console.error(error)
        res.status(500).send(error)
    }
})

// create a silent backup of the file
// user will have indexeedb as first level of backup
// DECOMISSION - Only for learning without using multer
// also way to send access token is probably not right
app.post(`/drive/file/upload`, async (req, res) => {
    try {
        const log = logger(`/drive/file/upload`)
        let data = Buffer.from([])
        req.on('data', (chunk) => {
            data = Buffer.concat([data, chunk])
        })

        req.on('end', async () => {
            // Parse multipart/form-data
            log(`data string`, data.toString())
            // 0th element contains the rest of string till boundary=
            // boudnary string -> ------WebKitFormBoundary<hex-string>
            const boundary = req.headers['content-type'].split('boundary=')[1]
            // remove the parts before first boundary
            // and after last boundary string
            const parts = data.toString().split(`--${boundary}`).slice(1, -1)
            let file, folderId, encryptedAccessToken
            parts.forEach((part) => {
                const name = part.match(/name="(.+?)"/)[1]
                switch (name) {
                    case 'file':
                        const match = part.match(/filename="(.+?)"/)
                        if (match) {
                            const filename = match[1]
                            const fileData = part.split('\r\n\r\n')[1]
                            file = { filename, data: fileData }
                        }
                        break
                    case 'folderId':
                        // TODO: there is suspected addition \r\n to the
                        // folder remove this
                        folderId = part.split('\r\n\r\n')[1]
                        break
                    case 'accessToken':
                        encryptedAccessToken = part.split('\r\n\r\n')[1]
                        break
                    default:
                        break
                }

                log(`all data`, file, folderId, encryptedAccessToken)
            })

            const isTokenValid = await validateAccessToken(encryptedAccessToken)
            if (!isTokenValid) {
                return res
                    .status(401)
                    .json({ message: `acccess token expired!` })
            }
            await saveFileToGoogleDrive(
                file,
                encryptedAccessToken,
                cleanFolderId(folderId)
            )

            res.status(201).send()
        })
    } catch (error) {
        console.error(`error occurred while backing up files : `, error)
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
