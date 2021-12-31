
/**
 * updateListingBySearch only updates one field of a collection,
 * so if you have creatorId:meteorId, and userId:meteorId, only 1 will get updated
 * this is a quick hack to check again for userId in a given collection where for some
 * 
 */

 const config = require('../config')
 const dbName = config.db
//global collection names, easier to access

module.exports = async function migrateLegacyIds(client){

    console.log('Migrating any left over legacy ids')
 
    try {
        /**
         * If you have run the migration, and need to run it again
         * set add a --legacy flag 
         */
         await checkLegacyUserIds(client)

    } catch (e) {
        console.error(e);
    } finally {
        console.log('✅ completed legacyId migration check')
    }
}

/**
 * updateListingBySearch only updates one field of a collection,
 * so if you have creatorId:meteorId, and userId:meteorId, only 1 will get updated
 * this is a quick hack to check again for userId in a given collection where for some
 * reason there is 2 same meteor ids
 * @param {*} client 
 * @param {*} meteorId 
 */
async function checkLegacyUserIds(client){
    const users = await client.db(dbName).collection('vulcanusers').find().toArray()

    for(var x = 0;x<users.length;x++){
        const user = users[x]
        if(user.legacyId){
            const meteorId = user.legacyId
            const newObjectId = user._id
            //I only need this for Letters
            console.log('checking letters')
            await updateListingBySearch(client,'letters', meteorId, newObjectId) 
            console.log('checking publications')
            await updateListingBySearch(client,'publications', meteorId, newObjectId) 
        }
    }
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
    const docs = await client.db(dbName).collection(collectionName).find( { $text: { $search: meteorId } }).toArray();
    if(docs.length){
        console.log(`Found ${docs.length} foreign key references inside collection: ${collectionName}...`)
    }
    //find field with the old meteor id to replace
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