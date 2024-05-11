const fs = require('fs').promises
const path = require('path')
const process = require('process')
const { google } = require('googleapis')
const fetch = require('node-fetch')
const googleAuthLib = require('google-auth-library')
const { decryptToken, getLogger } = require('./util')
const { Readable } = require('stream')

const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')
const logger = getLogger()

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
    const log = logger(`listFiles`)
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
    const content = await fs.readFile(CREDENTIALS_PATH)
    const keys = JSON.parse(content)
    const key = keys.installed || keys.web
    return {
        client_id: key.client_id,
        client_secret: key.client_secret,
        redirect_uri: key.redirect_uris[0],
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
    const log = logger(`folderExistsInDrive`)
    const { client_secret: privateKey } = await getAppCredentials()
    const decryptedAccessToken = decryptToken(accessToken, privateKey)
    const queryString = `q=mimeType='application/vnd.google-apps.folder' and name='esfiddle' and trashed=false`
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryString}`,
        {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${decryptedAccessToken}`,
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

async function getFolderIdByName(accessToken, name, esfiddleFolderId) {
    const log = logger(`getFolderIdByName`)
    const { client_secret: privateKey } = await getAppCredentials()
    const decryptedAccessToken = decryptToken(accessToken, privateKey)
    const queryString = `q=mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false and '${esfiddleFolderId}' in parents`
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryString}`,
        {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${decryptedAccessToken}`,
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
 * Creates a folder called esfiddle in drive if its not there
 * This should ideally never fail
 * @param {string} accessToken - encrypted access token
 */
async function createAppFolderInDrive(accessToken) {
    const log = logger(`createAppFolderInDrive`)
    try {
        const { client_secret: privateKey } = await getAppCredentials()
        const decryptedAccessToken = decryptToken(accessToken, privateKey)

        const existingFolderId = await folderExistsInDrive(accessToken)
        log(`existingFolderId`, existingFolderId)
        let newFileId
        if (!existingFolderId) {
            const folderMetadata = {
                name: 'esfiddle',
                mimeType: 'application/vnd.google-apps.folder',
            }
            /// create his folder in drive
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${decryptedAccessToken}`,
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

async function updateFiddleSessionFolder(
    accessToken,
    fiddleName,
    esfiddleFolderId
) {
    const log = logger(`createAppFolderInDrive`)
    try {
        const { client_secret: privateKey } = await getAppCredentials()
        const decryptedAccessToken = decryptToken(accessToken, privateKey)

        const existingFolderId = await getFolderIdByName(
            accessToken,
            fiddleName,
            esfiddleFolderId
        )
        log(`existingFolderId`, existingFolderId)
        let newFileId
        if (!existingFolderId) {
            const folderMetadata = {
                name: fiddleName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [esfiddleFolderId],
            }
            /// create his folder in drive
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${decryptedAccessToken}`,
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

async function createInitialFiles(accessToken, fiddleSessionId) {
    const log = logger(`createInitialFiles`)
    const { client_secret: privateKey } = await getAppCredentials()
    const decryptedAccessToken = decryptToken(accessToken, privateKey)
    const files = {
        'index.js': 'text/javascript',
        'index.html': 'text/html',
        'index.css': 'text/css',
    }

    for (const [name, mimeType] of Object.entries(files)) {
        const fileMetadata = {
            name,
            mimeType,
            // fiddle session folder id
            parents: [fiddleSessionId],
        }
        let response

        try {
            response = await fetch(
                'https://www.googleapis.com/drive/v3/files',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${decryptedAccessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(fileMetadata),
                }
            ).then((res) => res.json())

            if (!response.ok) {
                throw new Error(
                    `HTTP error! status: ${response.status}, ${
                        response?.message || response?.error?.message
                    }`
                )
            }

            return response
        } catch (error) {
            log(`Error creating file`, error)
            throw error
        }
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
        const log = logger(`saveFileToGoogleDrive`)
        log(`params`, { filename, fileData }, accessToken, folderId)

        const { client_secret: privateKey } = await getAppCredentials()
        const decryptedAccessToken = decryptToken(accessToken, privateKey)

        const auth = new google.auth.OAuth2()
        auth.setCredentials({ access_token: decryptedAccessToken })

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
 * @param {string} folderId - app backup folder id in users gdrive
 * @param {*} accessToken - encrypted access token
 * @returns {Array} - {id, name, data}
 */
async function syncFileDataFromDrive(folderId, accessToken) {
    try {
        const log = logger('syncFileDataFromDrive - params')
        log(`params`, `|${folderId}|`, `|${accessToken}|`)
        const drive = await getDriveInstance(accessToken)
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(name, mimeType, id, modifiedTime)',
        })

        log(`response`, response.data)

        const files = response.data.files

        // retrive data for all files
        const filesWithData = await Promise.all(
            files.map(async (file) => {
                const { id: fileId } = file
                const filesResponse = await drive.files.get({
                    fileId,
                    alt: 'media',
                })
                return { ...file, data: filesResponse.data }
            })
        )
        return filesWithData
    } catch (error) {
        throw error
    }
}

/**
 *
 * @param {string} accessToken  - encrypted access token
 */
async function getDriveInstance(accessToken) {
    const { client_secret: privateKey } = await getAppCredentials()
    const decryptedAccessToken = decryptToken(accessToken, privateKey)

    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: decryptedAccessToken })

    const drive = google.drive({ version: 'v3', auth })
    return drive
}

/**
 * Takes an encrypted accessToken decrypts and validates it
 * via oauth2
 * @param {String} accessToken
 * @returns
 */
async function validateAccessToken(accessToken) {
    const log = logger(`validateAccessToken`)
    try {
        const { client_secret: privateKey } = await getAppCredentials()
        const oauth2Client = await getAuthClient()
        const decryptedAccessToken = decryptToken(accessToken, privateKey)
        oauth2Client.setCredentials({ access_token: decryptedAccessToken })
        const tokenInfo = await oauth2Client.getTokenInfo(decryptedAccessToken)

        log(`Token valid for client`, tokenInfo.aud)
        return true
    } catch (error) {
        log(`error validating access token`, error)
        return false
    }
}

/**
 * since the filename are fixed
 *
 */
 function getMimeType(filename) {
    const log = logger(`getMimeType`)
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
// authorize().then(listFiles).catch(console.error);

module.exports = {
    listFiles,
    getAppCredentials,
    getAuthClient,
    getUserAuthUrl,
    getDriveInstance,
    createAppFolderInDrive,
    updateFiddleSessionFolder,
    createInitialFiles,
    saveFileToGoogleDrive,
    syncFileDataFromDrive,
    validateAccessToken,
    getMimeType,
}
