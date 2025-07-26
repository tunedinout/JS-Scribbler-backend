// NOTE: MONGODB NOT BEING USED AT ALL in this
// At some point mongodb was replaced to be using google drive
// and indexdb for offline data storage.
const { MongoClient } = require('mongodb');
const { getLogger } = require('./util');
const { loggingContext } = require('./constants');
require('dotenv').config();
const logger = getLogger(loggingContext.mongoUtils.self);
const MONGODB_URI = process.env.MONGODB_URI;
//  &appName=ServerlessInstance0
const MONGODB = process.env.DB_NAME;
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
  const mongoGet = async (collectionName, query) => {
    const log = logger(loggingContext.mongoUtils.mongoGet);
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    let result, session;
    try {
      log('1');
      await client.connect();
      session = client.startSession();
      log('2');
      !session.hasEnded && session.startTransaction();
      log('3');
      const db = client.db(MONGODB);
      const collection = db.collection(collectionName);
      result = await collection.findOne(query);
      log('4', result);
      !session.hasEnded && session.commitTransaction();
      log('6');
    } catch (error) {
      log('5');
      log('querying connection failed....', error);
      if (!session.hasEnded) {
        await session.abortTransaction();
      }

      result = error;
    } finally {
      await client.close();
      return result;
    }
  };

  /**
   * Adds a list of mongo documents to collection
   *
   * @param {String} collectionName - name of the collection
   * @param {Array} mongoDocuments  -  array of objects to be added
   * @param {Function} callback - to be executed after erorr/result is obtained
   *
   * @returns {Promise} A promise that resolves to mondodb result obj of the operation
   */
  const mongoPost = async (collectionName, mongoDocuments = []) => {
    const log = logger(loggingContext.mongoUtils.mongoPost);
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    let result, session;
    try {
      await client.connect();
      session = client.startSession();
      session.startTransaction();

      const db = client.db(MONGODB);
      const collection = db.collection(collectionName);
      result = await collection.insertMany(mongoDocuments);
      await session.commitTransaction();
    } catch (error) {
      log('querying connection failed....', error);
      if (!session.hasEnded) await session.abortTransaction();
      result = error;
    } finally {
      await client.close();
      return result;
    }
  };
  /**
   * Delete documents from collection using filter callback
   * @param {*} collectionName
   * @param {*} filter
   * @param {*} callback
   */

  const mongoDelete = async (collectionName, filter) => {
    const log = logger(loggingContext.mongoUtils.mongoDelete);
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    let result, session;
    try {
      await client.connect();
      session = client.startSession();
      session.startTransaction();

      const db = client.db(MONGODB);

      const collection = db.collection(collectionName);
      result = await collection.deleteMany(filter);

      await session.commitTransaction();
    } catch (error) {
      log('querying connection failed....', error);
      await session.abortTransaction();
      result = error;
    } finally {
      await client.close();
      if (!session.hasEnded) session.endSession();
      return result;
    }
  };
  /**
   * update an document in mongodb
   * @param {*} collectionName
   * @param {*} query
   * @param {*} options
   */
  const mongoUpdateOne = async (collectionName, query, updatedFieldsObject) => {
    // const log = logger(loggingContext.mongoUtils.mongoUpdateOne)
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    let result, session;
    try {
      await client.connect();
      session = client.startSession();
      session.startTransaction();

      const db = client.db(MONGODB);

      const collection = db.collection(collectionName);

      result = await collection.updateOne(query, {
        $set: updatedFieldsObject,
      });
      await session.commitTransaction();
    } catch (error) {
      if (session && !session.hasEnded) await session.abortTransaction();
      result = error;
    } finally {
      await client.close();
      // session.endSession()
      return result;
    }
  };

  const mongoUpsert = async (collectionName, query, upsertObject) => {
    const log = logger(loggingContext.mongoUtils.mongoUpsert);
    let findResult = await mongoGet(collectionName, query);
    log('findResult', findResult);
    if (findResult) {
      const res = await mongoUpdateOne(collectionName, query, upsertObject);
      if (res?.acknowledged)
        return { ...findResult, ...query, ...upsertObject };
      else return null;
    } else {
      const addedResult = await mongoPost(collectionName, [
        { ...query, ...upsertObject },
      ]);
      if (addedResult?.insertedCount) {
        return { ...query, ...upsertObject };
      } else {
        return null;
      }
    }
  };

  return {
    mongoGet: mongoGet,
    mongoPost: mongoPost,
    mongoDelete: mongoDelete,
    mongoUpdateOne: mongoUpdateOne,
    mongoUpsert: mongoUpsert,
  };
})();
