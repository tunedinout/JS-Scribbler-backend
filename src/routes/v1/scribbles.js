const { loggingContext } = require('../../constants');
const {
  validateUserSession,
  UpdateScribblerFolder,
  saveFileToGoogleDrive,
  getDriveInstance,
} = require('../../lib/google');
const { getLogger } = require('../../utils');

const logger = getLogger(loggingContext.apis.self);
async function postScribble(req, res) {
  try {
    const log = logger(loggingContext.apis.postScribble);
    const userId = req.session.userId;
    if (!userId) res.status(401).send({ message: 'unauthorized' });
    else {
      const { accessToken } = await validateUserSession(userId);
      log('accessToken', accessToken);
      const { name, driveFolderId, js = '', css = '', html = '' } = req.body;

      log('name', name);
      log('driveFolderId', driveFolderId);
      log('js content -> ', js);
      log('css content -> ', css);
      log('html content -> ', html);

      if (!name || !driveFolderId) {
        log('return 401 in response - bad request received.');
        return res.status(400).json({
          message: 'Missing requiredFields name/driveFolderId',
        });
      }

      // if name folder is not there it will create
      const scribbleId = await UpdateScribblerFolder(
        accessToken,
        name,
        driveFolderId,
      );

      // create default js file
      await saveFileToGoogleDrive(
        { filename: 'index.js', data: js },
        accessToken,
        scribbleId,
      );

      // create the default html file
      await saveFileToGoogleDrive(
        { filename: 'index.html', data: html },
        accessToken,
        scribbleId,
      );

      // create the default css file
      await saveFileToGoogleDrive(
        { filename: 'index.css', data: css },
        accessToken,
        scribbleId,
      );
      res.location(`/api/v1/scribbles/${scribbleId}`);
      // in update as well maintain consistency
      res.status(201).send({
        id: scribbleId,
        name: name,
        js,
        css,
        html,
      });
    }
  } catch (error) {
    console.error('failed while getting drive files', error);
    res.status(500).send({ message: error });
  }
}

async function putScribble(req, res) {
  try {
    const log = logger(loggingContext.apis.putScribble);
    const userId = req.session.userId;
    if (!userId) res.status(401).send({ message: 'unauthorized' });
    else {
      const { accessToken } = await validateUserSession(userId);

      const { scribbleId } = req.params;
      const { js = '', css = '', html = '' } = req.body;

      log('request.body', req.body);

      log('scribbleId', scribbleId);

      if (js)
        // create the initial js file
        await saveFileToGoogleDrive(
          { filename: 'index.js', data: js },
          accessToken,
          scribbleId,
        );
      if (html)
        // create the default html file
        await saveFileToGoogleDrive(
          { filename: 'index.html', data: html },
          accessToken,
          scribbleId,
        );

      if (css)
        // create the default css file
        await saveFileToGoogleDrive(
          { filename: 'index.css', data: css },
          accessToken,
          scribbleId,
        );

      // assume successs if not error thrown
      res.status(204).send();
    }
  } catch (error) {
    console.error('failed while getting drive files', error);
    res.status(500).send({ message: error });
  }
}

async function getScribblesOne(req, res) {
  const log = logger(loggingContext.apis.getScribblesOne);
  try {
    // each scribbler session is folder in the google drive
    const { id: scribblerSesionId } = req.params;
    log('params received', req.params);

    const userId = req.session.userId;
    if (!userId) res.status(401).send({ message: 'unauthorized' });
    else {
      const { accessToken } = await validateUserSession(userId);
      // get the content of index.js, index.html and index.css
      const drive = await getDriveInstance(accessToken);

      // get all the files id, mimeType etc
      // make parallel calls to get contents of each file

      const response = await drive.files.list({
        fields: 'files(id,mimeType)',
        q: `'${scribblerSesionId}' in parents`,
      });

      const files = response.data.files;

      const allFilesWithData = await Promise.all(
        files.map(async (file) => {
          const { id: fileId } = file;
          const filesResponse = await drive.files.get({
            fileId,
            alt: 'media',
          });
          return { ...file, data: filesResponse.data };
        }),
      );
      res.status(200).send(allFilesWithData);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
}

async function getScribbles(req, res) {
  const log = logger(loggingContext.apis.getScribbles);
  try {
    const userId = req.session.userId;
    if (!userId) res.status(401).send({ message: 'unauthorized' });
    else {
      const { accessToken } = await validateUserSession(userId);

      const { driveFolderId } = req.query;

      log('/api/v1/scribbles -> accessToken', accessToken);
      log('/api/v1/scribbles -> driveFolderId', driveFolderId);

      const drive = await getDriveInstance(accessToken);

      const response = await drive.files.list({
        q: `'${driveFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id,name)',
      });

      log('session folders', response.data);
      res.status(200).send(response.data.files);
    }
  } catch (error) {
    console.error('error occurred while backing up files : ', error);
    res.status(500).send({ message: error.message });
  }
}

module.exports = {
  getScribbles,
  getScribblesOne,
  putScribble,
  postScribble,
};
