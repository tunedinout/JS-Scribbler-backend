const crypto = require('crypto')

const encryptAndConvertToBase64 = (token, privateKey) => {
    const cipher = crypto.createCipher('aes-256-cbc', privateKey)
    let base64Encrypted = cipher.update(token, 'utf8', 'base64')
    base64Encrypted += cipher.final('base64')

    return base64Encrypted
}

const decryptFromBase64 = (base64Token, privateKey) => {
    const decipher = crypto.createDecipher('aes-256-cbc', privateKey)
    let decrypted = decipher.update(base64Token, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}

function log(...intialArguments) {
    const prefixedInitialArgs = intialArguments.map((arg) => `[${arg}]`)
    return function (...remainingArguments) {
        console.log(`${prefixedInitialArgs.join('')}`, ...remainingArguments)
    }
}

function getLogger(...globalPrefix) {
    return function (...localPrefix) {
        return function (...params) {
            console.log(
                '\x1b[36m',
                `${[...globalPrefix, ...localPrefix]
                    .map((pref) => `[ ${pref} ]`)
                    .join(' ')}`,
                '\x1b[0m',
                ...params
            )
        }
    }
}

function cleanFolderId(folderId) {
    // Remove any leading or trailing whitespace
    folderId = folderId.trim();
  
    // Replace any occurrences of '\r' or '\n' with an empty string
    folderId = folderId.replace(/\r/g, '').replace(/\n/g, '');
  
    return folderId;
  }

module.exports = {
    encryptToken: encryptAndConvertToBase64,
    decryptToken: decryptFromBase64,
    getLogger,
    cleanFolderId
}
