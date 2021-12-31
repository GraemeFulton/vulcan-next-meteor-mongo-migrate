const {MongoClient} = require('mongodb');

/**
 * Migrate vulcan meteor accounts to vulcan-next
 *
 * 
 * Run `node objectid-migration.js` to start the migration
 *
 * How it works:
 * - Loops through all user created mongo collections, and migrate meteor Id to mongo id
 * - Works by inserting a new document for every object to create the object id
 * - Loops through and updates matches of all meteor ids in relational fields using text search (https://docs.mongodb.com/manual/text-search/)
 * - Also stores the old meteor id in document.legacyId field 
 * 
 * User migration:
 * - A user.salt and user.hash will be made from meteor bcrypt password, which 
 *  allows you to log in with existing password with a meteor fallback patch on vulcan-next
 * 
 */

const config = require('../config')
const dbName = config.db
//global collection names, easier to access
let _collectionNames = []

module.exports =  async function migrateObjectIds(client, collectionNames){
    console.log('Migrating object Ids')
    _collectionNames = collectionNames
    try {
        //update objectids for all collections
        for(var x = 0;x<collectionNames.length;x++){
            await updateCollectionDocuments(client,collectionNames[x])
            //finally rename user collection to vulcanusers
            if(collectionNames[x]=='users'){
                await client.db(dbName).renameCollection("users","vulcanusers")
            }   
        }
      
 
    } catch (e) {
        console.error(e);
    } finally {
        console.log('✅ completed objectId migration')
    }
}

/**
 * updateCollectionDocuments
 * 
 * Loops through every document in a given collection, and updates the document _id from meteor String to a new ObjectId
 * 
 * if the colleciton is a user, it will add the salt and hash for the newly created user document too
 * 
 * @param {MongoClient} client A MongoClient that is connected to a cluster with the sample_airbnb database
 * @param {collectionName} = the collection name being migrated
 */
async function updateCollectionDocuments(client, collectionName) {
    // See https://mongodb.github.io/node-mongodb-native/3.6/api/Collection.html#updateMany for the updateMany() docs
    //find all users, and convert to array so we can use for loop (foreach cannot use await)
    const documents = await client.db(dbName).collection(collectionName).find().toArray()

    console.log(`found ${documents.length} in collection: ${collectionName}`)

    let resultCount = 0
    //find meteor ids
    for(var x= 0;x<documents.length;x++){
        const meteorId = documents[x]._id

        //if it's a user document, update the password before creating object with a new ObjectId
        if(collectionName=='users'){
            await updateUserPassword(client, meteorId)
        }

        //store the old meteor id in a .legacyId field first
        await updateListingByField(client,collectionName,{'_id':meteorId}, {"legacyId":meteorId}) 
        //now update the objectId
        await updateObjectId(client,collectionName, meteorId)

        resultCount+=1
    }
    console.log(`${resultCount} document(s) was/were updated.`);
    console.log(`still working...`);
}


/**
 * Update meteor user so it'll work with vulcan-next
 * @Params client, meteorId (the user's meteor id)
 * 
 * 1. Fetches the bcypt password, and inserts user.salt user.hash
 * 2. Adds user.legacyId so we can keep a reference to meteor ids
 */
async function updateUserPassword(client, meteorId){
     //get their password
    const bcryptPassword = await retrievePassword(client, meteorId)
    //create salt and hash
    const salt = bcryptPassword.substring(7,29)
    const hash = bcryptPassword.substring(29)
    console.log(`Password created – salt: ${salt}, hash: ${hash}`)
    //do the  mongo update
    await updateListingByField(client,'users', {'_id': meteorId}, {"salt":salt,"hash":hash}) 
}

/**
 * updateObjectId
 * It's not possible to update the objectID
 * https://stackoverflow.com/questions/4012855/how-to-update-the-id-of-one-mongodb-document
 *
 * duplicate the document, and update all other collections where the id is referenced
 * insert a legacyId for fallback (e.g. stripe may still use original userId to check payments)
 */
async function updateObjectId(client,collectionName, meteorId){
    
    //duplicate and delete
    // https://stackoverflow.com/a/4012997/1466537
    // store the document in a variable
    let doc = await client.db(dbName).collection(collectionName).findOne({_id: meteorId})
    
    //reset id to null, mongo autocreates the new objectId on insert
    doc._id = null

    // remove the duplicated doc before inserting new one to avoid 'cannot duplicate unique fields' error
    await client.db(dbName).collection(collectionName).deleteOne({_id: meteorId})

    // insert a new document and get the new objectId
    const res = await client.db(dbName).collection(collectionName).insertOne(doc)
    const newObjectId = res.insertedId
    //update all references to this id
    if(newObjectId){
        //go through all collections and swap references to the old meteor id to this new one
        for(var x= 0;x<_collectionNames.length;x++){
            //exclude current collection name (don't update self)
            if(_collectionNames[x]!==collectionName){
                await updateListingBySearch(client,_collectionNames[x], meteorId, newObjectId) 
            }
        }
    }

   
}

/**************************************
************* MONGO HELPERS ********************
***************************************/
/**
 */
async function updateListingByField(client,collectionName,findQuery, updatedListing) {
    // See https://mongodb.github.io/node-mongodb-native/3.6/api/Collection.html#updateOne for the updateOne() docs
    const result = await client.db(dbName).collection(collectionName).updateOne(findQuery, { $set: updatedListing });
    //use unset to remove fields:
    // const resultb = await client.db(dbName).collection("users").updateOne({ _id: id }, { $unset: {legacy:1} });

    console.log(`${result.matchedCount} document(s) matched the query criteria.`);
    console.log(`${result.modifiedCount} document(s) was/were updated.`);
    console.log('please wait...')
}

/**
* updateListingBySearch
*
* go through a collection and replace any relational id field with the new objectId
* e.g. after updating a Letter user's id to an objectId, update their Letter document userId 
*/
async function updateListingBySearch(client,collectionName,meteorId, newId) {

    //create index of all fields - meteor id could be referenced by anythign..e.g. userId, template, tempalteID...
    // https://stackoverflow.com/a/58844779/1466537
    await client.db(dbName).collection(collectionName).createIndex( { "$**": "text" } )
    // See https://mongodb.github.io/node-mongodb-native/3.6/api/Collection.html#updateOne for the updateOne() docs
    const docs = await client.db(dbName).collection(collectionName).find( { $text: { $search: meteorId } }).toArray();
    console.log(`Searching ${collectionName} for meteor foreign key: ${meteorId}`)
    if(docs.length){
        console.log(`Found ${docs.length} foreign key references inside collection: ${collectionName}...`)
    }
    for(var x=0;x<docs.length;x++){
        var doc = docs[x]
        //insert foreign key id as mongo string, not objectId
        //graphQL queries on foreign keys as part of _and, _or operators do not work with non-object Id in vulcan-next
        newId = newId.toString()
        //find field with the old meteor id to replace
        const field = Object.keys(doc).find(key => doc[key] === meteorId);
        if(field){
            await client.db(dbName).collection(collectionName).updateOne({ _id: doc._id },{ $set: {[field]:newId} });
            console.log(`updated ${field} field from meteor Id: ${meteorId} to new id: ${doc._id}`)
        }
    }
}

/**
get user's bcypt password
 */
async function retrievePassword(client, id) {
    // See https://mongodb.github.io/node-mongodb-native/3.6/api/Collection.html#findOne for the findOne() docs
    const result = await client.db(dbName).collection("users").findOne({ _id: id });

    if (result) {
        console.log(`Found a listing in the db with the name '${result.username}':`);
        console.log(result);
    } else {
        console.log(`No listings found with the name '${result.username}'`);
    }
    return result.services.password.bcrypt
}