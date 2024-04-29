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
            mimeType: 'text/javascript',
            body: Readable.from(fileData),
        }

        // checks the files in the folder

        const filesListResponse = await drive.files.list({
            q: `'${folderId}' in parents`,
            fields: 'files(id, name, mimeType)',
        })

        log(`filesListResponse.data `, filesListResponse.data)

        const filesArray = filesListResponse.data.files;
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
                    mimeType: 'text/javascript',
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
        // throw error
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
        const drive = await getDriveInstance(accessToken);
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(name, mimeType, id, modifiedTime)'
        });

        log(`response`, response.data);

        const files = response.data.files;

        // retrive data for all files 
        const filesWithData = await Promise.all(files.map(async (file) => {
            const {id: fileId} = file;
            const filesResponse = await drive.files.get({
                fileId,
                alt: 'media'
            });
            return {...file, data: filesResponse.data}
        }));
        return filesWithData;
    } catch (error) {
        throw error;
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
// authorize().then(listFiles).catch(console.error);

module.exports = {
    listFiles,
    getAppCredentials,
    getAuthClient,
    getUserAuthUrl,
    createAppFolderInDrive,
    saveFileToGoogleDrive,
    syncFileDataFromDrive,
}
