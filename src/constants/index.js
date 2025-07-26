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
    UpdateScribblerFolder: 'UpdateScribblerFolder',
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
    authGet: '/api/v1/auth - GET',
    authCallbackGet: '/api/v1/callback - GET',
    authMeGet: '/api/v1/me - GET',
    postDrive: '/api/v1/drive - POST',
    postScribble: '/api/v1/scribbles - POST',
    putScribble: '/api/v1/scribbles/:scribblerSessionId - Put',
    getScribbles: '/api/v1/scribbles - GET',
    getScribblesOne: '/api/v1/scribbles/:id - GET',
  },
};

const enabledLoggingContexts = [
  ...Object.values(loggingContext.googleApisUtils),
  ...Object.values(loggingContext.mongoUtils),
  ...Object.values(loggingContext.apis),
];

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

module.exports = {
  loggingContext,
  enabledLoggingContexts,
  googleApisScopes: SCOPES,
};
