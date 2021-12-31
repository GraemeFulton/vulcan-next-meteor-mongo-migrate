const {MongoClient} = require('mongodb');

/**
 * In vulcan-next, email verification is recoreded with a isValidated field on the user document
 * 
 * Previously, I'd stored these as a user group, so this adds the isValidated field 
 *
 */
const config = require('../config')
const dbName = config.db

module.exports = async function migrateVerifiedUserFlag(client){
    console.log('Migrating user email verification field')
 
    try {
        const users = await client.db(dbName).collection('vulcanusers').find().toArray()

        let verifiedUserCount = 0
        for(var x = 0;x<users.length;x++){
            const user = users[x]
            if(user.groups && user.groups.indexOf('verifiedEmail')>-1){
              verifiedUserCount+=1
              const result = await client.db(dbName).collection("vulcanusers").updateOne({ _id: user._id }, { $set: {isVerified:true} });
              console.log(`${result.matchedCount} document(s) matched the query criteria.`);
              console.log(`${result.modifiedCount} document(s) was/were updated.`);
            }
        }
        console.log(`Verified ${verifiedUserCount} users.`)

      
 
    } catch (e) {
        console.error(e);
    } finally {
        console.log('✅ completed email verification migration')
    }
}