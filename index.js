const express = require('express')
// const multer = require('multer');
const cors = require('cors')
const {
    authorize,
    listFiles,
    getAppCredentials,
    verifyUserAccessToken,
    getUserAuthUrl,
    getAuthClient,
    createAppFolderInDrive,
    saveFileToGoogleDrive,
    syncFileDataFromDrive,
} = require('./googleApi.util')
const googleAuthLib = require('google-auth-library')
const jwt = require('jsonwebtoken')
const { verifyIdToken, storeSession, getSession } = require('./session.util')
const { mongoUpdateOne, mongoDelete, mongoPost } = require('./mongo.util')
const { encryptToken, decryptToken, getLogger, cleanFolderId } = require('./util')
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
const { google } = require('googleapis')
const fs = require('fs')

const app = express()
app.use(express.json())
app.use(cors())
let logger = getLogger('index.js', 'root file')

// send auth url to ui for user login and
// consent screen
app.get('/auth/google', async (_, res) => {
    // delete any existing session data
    const log = logger('/auth/google - GET')
    const result = await mongoDelete('users', {})
    log(` delete result `, result)
    try {
        const authURL = await getUserAuthUrl(SCOPES, {prompt: 'consent'})

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
            scope,
            token_type = 'Bearer',
            id_token: idToken,
        } = oauth2ClientAccessTokenRespose.tokens
        // get email from access token

        // Verify access token
        const userInfo = await verifyIdToken(idToken)
        log(`userinfo`, userInfo)
        const existingSessionResponse = await getSession(userInfo.email)

        log(`existing session`, existingSessionResponse)

        if (!existingSessionResponse) {
            await storeSession(
                // sessionId,
                // deviceId,
                userInfo.email,
                encryptToken(accessToken, client_secret),
                encryptToken(refreshToken, client_secret),
                encryptToken(idToken, client_secret),
                expiryDate,
                token_type
            )
        } else {
            log(
                `lets do something with existing session response`,
                existingSessionResponse
            )
            // const {}
        }

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

// token expiry is reliable let ui figure it out

// TODO since user has the encrypted object
// take refreshToken and accessToken from req body
// use a function called decryptToken(token, client_secret)
// after decoding we proceeding to do the token refresh
// and send back to the user as in above /auth/google post api
app.post('/auth/google/refresh', async (req, res) => {
    const log = logger('/auth/google/refresh - POST')
    try {
        const { refreshToken, email } = req.body
        const client = await getAuthClient()
        const { client_secret } = await getAppCredentials()
        const decodedRefreshToken = decryptToken(refreshToken, client_secret)
        log('[ decodedRefreshToken ]', decodedRefreshToken)
        log('refreshToken', refreshToken)

        client.setCredentials({
            refresh_token: decodedRefreshToken || refreshToken,
        })
        const credentialResponse = await client.getAccessToken()

        log(credentialResponse)
        const { access_token, id_token, expiry_date } =
            credentialResponse.res.data
        const userInfo = await verifyIdToken(id_token)
        await mongoUpdateOne('users', { email }, { access_token, id_token })
        res.status(201).send({
            accessToken: encryptToken(access_token, client_secret),
            refreshToken: encryptToken(refreshToken, client_secret),
            email,
            name: userInfo.name,
            expiryDate: expiry_date,
            idToken: id_token
        })
    } catch (error) {
        console.error(`failed while refreshing token`, error)
        res.status(500).send({ message: error })
    }
})

// app.post('/auth/google/userinfo')

app.post('/drive/create/folder', async (req, res) => {
    try {
        const log = logger(`/drive/create/folder`)
        const { accessToken } = req.body

        const folderId = await createAppFolderInDrive(accessToken)
        // const drive = google.drive({version: 'v3', oauth_token: `Bearer ${decryptedAccessToken}`})
        // log(`create app folder response`,   folderId);
        // send only folder id
        res.status(201).send({id: folderId})
    } catch (error) {
        console.error(`failed while getting drive files`, error)
        res.status(500).send({ message: error })
    }
});

app.post(`/drive/load-files`, async (req, res) => {
    // get all the files with string data
    // return this to consumer
    const log = logger(`/drive/load-files`);
    log(`req.body`, req.body);
    try {
        
        const { accessToken, folderId  } = req.body;
        const filesWithData = await syncFileDataFromDrive(folderId, accessToken);
        res.status(200).send({files: filesWithData});
    } catch (error) {
        console.error(error);
        res.status(500).send(error);

    }
})

// create a silent backup of the file
// user will have indexeedb as first level of backup
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
            let file, folderId, encryptedAccessToken;
            parts.forEach((part) => {
                const name = part.match(/name="(.+?)"/)[1];
                switch (name) {
                    case 'file':
                        const match = part.match(/filename="(.+?)"/)
                        if (match) {
                            const filename = match[1];
                            const fileData = part.split('\r\n\r\n')[1]
                            file = { filename, data: fileData }
                        }
                        break;
                    case 'folderId': 
                    // TODO: there is suspected addition \r\n to the 
                    // folder remove this
                    folderId = part.split('\r\n\r\n')[1];
                    break;
                    case 'accessToken': 
                    encryptedAccessToken =  part.split('\r\n\r\n')[1];
                    break;
                    default:
                        break;
                }

                log(`all data`, file, folderId, encryptedAccessToken)
               
            })
            // secondary backup 
            // await mongoPost('files', [file])
            // primary backup is gdrive
            await saveFileToGoogleDrive(file, encryptedAccessToken, cleanFolderId(folderId))

            res.status(201).send()
        })
    } catch (error) {
        console.error(`error occurred while backing up files : `, error)
        res.status(500).send(error)
    }
})

app.listen(3000, async () => {
    console.log(`server running.... at ${3000}`)
})
