const { getAppCredentials, getAuthClient } = require('./googleApi.util');
const { mongoPost, mongoGet } = require('./mongo.util');

// NOTE: This function is unused
async function storeSession(
    sessionId,
    userDevice,
    email,
    access_token,
    refresh_token,
    id_token,
    expires_in,
    token_type
) {
    await mongoPost('users', [
        { email, access_token, id_token, expires_in, token_type, refresh_token },
    ])
}

// NOTE: this function is unused
async function getSession(email) {
    return await mongoGet('users', { email })
}

/**
 *
 * @param {String} idToken
 * @returns {Object} userinfo.profile and userinfo.email
 */
async function verifyIdToken(idToken) {
    const { client_id: audience } = await getAppCredentials()
    const client = await getAuthClient();
    const ticket = await client.verifyIdToken({
        idToken,
        audience,
    })

    const payload = ticket.getPayload()
    return payload
}

module.exports = {
    storeSession,
    getSession,
    verifyIdToken,
}
