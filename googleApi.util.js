const fs = require('fs').promises
const path = require('path')
const process = require('process')
const { google } = require('googleapis')
const fetch = require('node-fetch')
const googleAuthLib = require('google-auth-library')
const { getLogger, getCallerFunctionName } = require('./util')
const { Readable } = require('stream')
const { mongoGet, mongoUpsert } = require('./mongo.util')
const { loggingContext } = require('./constants')
require('dotenv').config()
const logger = getLogger(loggingContext.googleApisUtils.self)

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
    const log = logger(loggingContext.googleApisUtils.listFiles)
    const drive = google.drive({ version: 'v3', auth: authClient })
    const res = await drive.files.list({
        pageSize: 10,
        fields: 'nextPageToken, files(id, name)',
    })
    const files = res.data.files
    if (files.length === 0) {
        log('No files found.')
        return null
    }

    return files
}

/**
 *
 * @returns {Object} {client_id, client_secret, redirect_uri}
 */
async function getAppCredentials() {
    return {
        client_id: process.env.GCP_CLIENT_ID,
        client_secret:  process.env.GCP_CLIENT_SECRET,
        redirect_uri:  process.env.GCP_REDIRECT_URI,
    }
}

/**
 *
 * Generate URL for Auth flow
 * @param {Array} SCOPES
 * @param {Object} config - ex {prompt: 'consent'}
 * @returns {string} - auth url the user should be redirect to
 */
async function getUserAuthUrl(SCOPES = [], config) {
    const { redirect_uri } = await getAppCredentials()
    const client = await getAuthClient()
    return client.generateAuthUrl({
        access_type: 'offline',
        redirect_uri,
        scope: SCOPES,
        ...config,
    })
}
/**
 * Createa an auth client with client_id, client_secret, redirect_uri
 * @returns {googleAuthLib.OAuth2Client}
 */
async function getAuthClient() {
    const {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
    } = await getAppCredentials()
    // create oauth2 client
    return new googleAuthLib.OAuth2Client({
        clientId,
        clientSecret,
        redirectUri,
    })
}
/**
 *
 * @param {String} accessToken
 * @returns {String|null} folder id if it exists otherwise null
 */
async function folderExistsInDrive(accessToken) {
    const log = logger(loggingContext.googleApisUtils.folderExistsInDrive)
    const queryString = `q=mimeType='application/vnd.google-apps.folder' and name='scribbler' and trashed=false`
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryString}`,
        {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    )

    const jsonResponse = await response.json()
    log(`jsonResponse`, jsonResponse)
    if (jsonResponse?.files?.length) {
        // consumer should save this id
        return jsonResponse?.files[0]?.id
    } else return null
}

async function getFolderIdByName(accessToken, name, scribblerFolderId) {
    const log = logger(loggingContext.googleApisUtils.get)
    const queryString = `q=mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false and '${scribblerFolderId}' in parents`
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryString}`,
        {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    )

    const jsonResponse = await response.json()
    log(`jsonResponse`, jsonResponse)
    if (jsonResponse?.files?.length) {
        // consumer should save this id
        return jsonResponse?.files[0]?.id
    } else return null
}
/**
 * Creates a folder called scribbler in drive if its not there
 * This should ideally never fail
 * @param {string} accessToken - encrypted access token
 */
async function createAppFolderInDrive(accessToken) {
    const log = logger(loggingContext.googleApisUtils.createAppFolderInDrive)
    try {

        const existingFolderId = await folderExistsInDrive(accessToken)
        log(`existingFolderId`, existingFolderId)
        let newFileId
        if (!existingFolderId) {
            const folderMetadata = {
                name: 'scribbler',
                mimeType: 'application/vnd.google-apps.folder',
            }
            /// create his folder in drive
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify(folderMetadata),
                }
            )
            const jsonResponse = await response.json()
            log(`jsonResponse`, jsonResponse)
            const { id } = jsonResponse
            newFileId = id
        }
        if (existingFolderId) return existingFolderId
        else return newFileId
    } catch (error) {
        throw error
    }
}

async function UpdateScribblerFolder(
    accessToken,
    scribblerName,
    scribblerFolderId
) {
    const log = logger(loggingContext.googleApisUtils.UpdateScribblerFolder);
    log(`received -> scribblerName`, scribblerName);
    log(`received -> scribblerFolderId`, scribblerFolderId);
    try {

        const existingFolderId = await getFolderIdByName(
            accessToken,
            scribblerName,
            scribblerFolderId
        )
        log(`existingFolderId`, existingFolderId)
        let newFileId
        if (!existingFolderId) {
            const folderMetadata = {
                name: scribblerName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [scribblerFolderId],
            }
            /// create his folder in drive
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify(folderMetadata),
                }
            )
            const jsonResponse = await response.json()
            log(`jsonResponse`, jsonResponse)
            const { id } = jsonResponse
            newFileId = id
        }
        if (existingFolderId) return existingFolderId
        else return newFileId
    } catch (error) {
        throw error
    }
}
// TODO: update this to do the work
// saving file delete newly created onece

/**
 * Converts filedata to readable stream and send to google drive api to save/update
 * @param {Object} param0  - {filename: <string>, data: <string>}
 * @param {String} accessToken  - encrypted access token
 * @param {String} folderId - id of the parent folder
 * @returns
 */
async function saveFileToGoogleDrive(
    { filename = '', data: fileData },
    accessToken,
    folderId
) {
    /**
     * Implementation logic :
     * 1. Create redable stream from filedata<string>
     * 2. Set the media arg required for both
     *    updating the same file or creating a new file.
     * 3. Get the list of files in the folder
     * 4. If file with name matches we update the
     * content.
     * 5. else create a new file in gdrive in the folder <FolderId>
     */
    try {
        const log = logger(loggingContext.googleApisUtils.saveFileToGoogleDrive)
        log(`params`, { filename, fileData }, accessToken, folderId)

        const auth = new google.auth.OAuth2()
        auth.setCredentials({ access_token: accessToken })

        const drive = google.drive({ version: 'v3', auth })
        // send this to either update or create file utility
        const media = {
            mimeType: getMimeType(filename),
            body: Readable.from(fileData.toString()),
        }

        log(`media obj`, media)

        // checks the files in the folder

        const filesListResponse = await drive.files.list({
            q: `'${folderId}' in parents`,
            fields: 'files(id, name, mimeType)',
        })

        log(`filesListResponse.data `, filesListResponse.data)

        const filesArray = filesListResponse.data.files
        // files is just a representional entity
        // not to be confused with JS file entity
        const currentFileObj = filesArray.find(({ name }) => name === filename)

        log(`currentFileObj - received from the folder`, currentFileObj)

        // update the file if it already exists
        if (currentFileObj) {
            const { id: fileId } = currentFileObj

            const response = await drive.files.update({
                fileId,
                media,

                fields: 'id, name, mimeType',
            })
            log('files.update.response.data', response.data)
            return response.data
        } else {
            // create the file and save the content
            const response = await drive.files.create({
                requestBody: {
                    name: filename,
                    mimeType: getMimeType(filename),
                    parents: [folderId],
                },
                media,
                fields: 'id',
                supportsAllDrives: true,
            })

            log(`files.create.response.data`, response.data)
            return response
        }
    } catch (error) {
        console.error(error)
        throw error
    }
}

/**
 *
 * @param {string} accessToken  - encrypted access token
 */
async function getDriveInstance(accessToken) {

    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })

    const drive = google.drive({ version: 'v3', auth })
    return drive
}

async function validateUserSession(userId) {
    const log = logger(...[loggingContext.googleApisUtils.validateUserSession, getCallerFunctionName()])
    try {
        
        const existingTokenRecord = await mongoGet('googleTokens', { userId })
        log(`existingTokenRecord`, existingTokenRecord)
        const { expiryDate: expiry_date, refreshToken: refresh_token } =
            existingTokenRecord
        if (expiry_date < Date.now()) {
            log(`token expired`)
            // token expiration
            const client = await getAuthClient()
            client.setCredentials({
                refresh_token,
            })
            const credentialResponse = await client.getAccessToken()
            const { accessToken, refreshToken, expiryDate } = credentialResponse

            await mongoUpsert(
                `googleTokens`,
                { userId },
                { accessToken, refreshToken, expiryDate }
            )
            return credentialResponse
        } else return existingTokenRecord
    } catch (res) {
        log(`errror`, res)
        return {accessToken: null, refreshToken: null, expiryDate: null}
    } 
}

/**
 * since the filename are fixed
 *
 */
 function getMimeType(filename) {
    const log = logger(loggingContext.googleApisUtils.getMimeType)
    log(`received filename `, filename)
    const regex = /^[a-zA-Z][^/]*\.([^./]+)$/
    const match = filename.match(regex)
    const extension = match[1]

    log(`extracted extension of file ${filename} -> ${extension}`)
    let mimeType
    switch (extension) {
        case 'js':
            mimeType = 'text/javascript'
            break

        case 'css':
            mimeType = 'text/css'
            break

        case 'html':
            mimeType = 'text/html'
            break

        default:
            mimeType = 'text/plain'
    }

    log(` mimeType of file ${filename}`, mimeType)

    return mimeType
}

module.exports = {
    listFiles,
    getAppCredentials,
    getAuthClient,
    getUserAuthUrl,
    getDriveInstance,
    createAppFolderInDrive,
    UpdateScribblerFolder,
    saveFileToGoogleDrive,
    getMimeType,
    validateUserSession
}
