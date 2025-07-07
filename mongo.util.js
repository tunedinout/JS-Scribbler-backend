const { MongoClient } = require('mongodb')
require('dotenv').config()
const MONGODB_URI = process.env.MONGODB_URI;
//  &appName=ServerlessInstance0
const MONGODB = 'JS-Scribbler'
module.exports = (function () {
    /**
     *  Based on the query can retreive items
     * from the collections in the db
     * Executed callback argument
     *
     * @param {Function} collectionName
     * @param {Object} query
     * @param {Function} callback
     * @returns void
     */
    const queryCollection = async (collectionName, query) => {
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        let result, session
        try {
            console.log('queryCollection 1')
            await client.connect()
            session = client.startSession()
            console.log('queryCollection 2')
            !session.hasEnded && session.startTransaction()
            console.log('queryCollection 3')
            const db = client.db(MONGODB)
            const collection = db.collection(collectionName)
            result = await collection.findOne(query)
            console.log('queryCollection 4', result)
            !session.hasEnded && session.commitTransaction()
            console.log('queryCollection 6')
        } catch (error) {
            console.log('queryCollection 5')
            console.log(`querying connection failed....`, error)
            if(!session.hasEnded){
                await session.abortTransaction()
            }
          
            result = error
        } finally {
            await client.close()
            return result
        }
    }

    /**
     * Adds a list of mongo documents to collection
     *
     * @param {String} collectionName - name of the collection
     * @param {Array} mongoDocuments  -  array of objects to be added
     * @param {Function} callback - to be executed after erorr/result is obtained
     *
     * @returns {Promise} A promise that resolves to mondodb result obj of the operation
     */
    const addToCollection = async (collectionName, mongoDocuments = []) => {
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        let result, session
        try {
            await client.connect()
            session = client.startSession()
            session.startTransaction()

            const db = client.db(MONGODB)
            const collection = db.collection(collectionName)
            result = await collection.insertMany(mongoDocuments)
            await session.commitTransaction()
        } catch (error) {
            console.error(`querying connection failed....`, error)
            if(!session.hasEnded)
            await session.abortTransaction()
            result = error
        } finally {
            await client.close()
            return result
        }
    }
    /**
     * Delete documents from collection using filter callback
     * @param {*} collectionName
     * @param {*} filter
     * @param {*} callback
     */

    const deleteDocuments = async (collectionName, filter) => {
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        let result, session
        try {
            await client.connect()
            session = client.startSession()
            session.startTransaction()

            const db = client.db(MONGODB)

            const collection = db.collection(collectionName)
            result = await collection.deleteMany(filter)

            await session.commitTransaction()
        } catch (error) {
            console.error(`querying connection failed....`, error)
            await session.abortTransaction()
            result = error
        } finally {
            await client.close()
            if(!session.hasEnded)
            session.endSession()
            return result
        }
    }
    /**
     * update an document in mongodb
     * @param {*} collectionName
     * @param {*} query
     * @param {*} options
     */
    const updateDocument = async (
        collectionName,
        query,
        updatedFieldsObject
    ) => {
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        let result, session
        try {
            await client.connect()
            session = client.startSession()
            session.startTransaction()

            const db = client.db(MONGODB)

            const collection = db.collection(collectionName)

            result = await collection.updateOne(query, {
                $set: updatedFieldsObject,
            })
            await session.commitTransaction()
        } catch (error) {
            if(session && !session.hasEnded)
            await session.abortTransaction()
            result = error
        } finally {
            await client.close()
            // session.endSession()
            return result
        }
    }

    return {
        mongoGet: queryCollection,
        mongoPost: addToCollection,
        mongoDelete: deleteDocuments,
        mongoUpdateOne: updateDocument,
    }
})()
