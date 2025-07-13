const loggingContext = {
    googleApisUtils: {
        self: 'googleApisUtils',
        listFiles: 'listFiles',
        folderExistsInDrive: 'folderExistsInDrive',
        getAppCredentials: 'getAppCredentials',
        getAuthClient: 'getAuthClient',
        getUserAuthUrl: 'getUserAuthUrl',
        getDriveInstance: 'getDriveInstance',
        getFolderIdByName: 'getFolderIdByName',
        createAppFolderInDrive: 'createAppFolderInDrive',
        updateScribblerSessionFolder: 'updateScribblerSessionFolder',
        saveFileToGoogleDrive: 'saveFileToGoogleDrive',
        getMimeType: 'getMimeType',
        validateUserSession: 'validateUserSession',
    },
    mongoUtils: {
         self: 'mongoUtils',
        mongoGet: 'mongoGet',
        mongoPost: 'mongoPost',
        mongoDelete: 'mongoDelete',
        mongoUpdateOne: 'mongoUpdateOne',
        mongoUpsert: 'mongoUpsert',
    },
    apis: {
        self: 'apis',
        authGet: '/auth/google - GET',
        authCallbackGet: '/oauth2callback - GET',
        authMeGet: '/api/v1/me - GET',
        driveCreateFolderPost: '/drive/create/folder - POST',
        driveFolderSessionPost: '/drive/folder/session - POST',
        driveFolderSessionPutOne:
            '/drive/folder/session/:scribblerSessionId - Put',
        driveFolderSessionsGet: '/drive/folder/sessions - GET',
        driveFolderSessionsGetOne: '/drive/folder/sessions/:id - GET',
    },
}

const enabledLoggingContexts = [
    ...Object.values(loggingContext.googleApisUtils),
    ...Object.values(loggingContext.mongoUtils),
    ...Object.values(loggingContext.apis),
]

module.exports = {
    loggingContext,
    enabledLoggingContexts,
}
