const {MongoClient} = require('mongodb');

/**
 * Migrate vulcan meteor accounts to vulcan-next
 *
 * 
 * Run `node start.js` to start the migration
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

const objectIdMigration = require('./migrations/objectid-migration')
// these are examples of custom migrations I needed for my app:
// const legacyIdCheck = require('./migrations/legacyid-check')
// const isVerifiedMigration = require('./migrations/isverified-migration')


const config = require('./config')
const dbName = config.db
const connectionString = config.connectionString

async function main(){
    console.log('Starting migration...')
    /**
     * Connection URI. Update <username>, <password>, and <your-cluster-url> to reflect your cluster.
     * See https://docs.mongodb.com/ecosystem/drivers/node/ for more details
     */ 
    const client = new MongoClient(connectionString);
 
    try {
        // Connect to the MongoDB cluster
        await client.connect();

        console.log(`Connected to ${dbName}`)
        //get all collection names
        const collectionNames = await getCollectionNames(client)

        console.log(`Migrating the following collections: ${collectionNames}`)

        //the main migration for converting meteor Ids to object Id
        await objectIdMigration(client, collectionNames)
        
        /**
         * You can add your own custom migrations here 
         * Below are examples of migrations specific to my app
         * find them in /migrations
         */
        // await legacyIdCheck(client)
        // await isVerifiedMigration(client)
 
    } catch (e) {
        console.error(e);
    } finally {
        console.log('💫 migration complete')
        await client.close();
    }
}

/**
*getCollectionNames
*Get all the mongodb collection names
*/
async function getCollectionNames(client){
     const collections = await client.db(dbName).listCollections().toArray();
        const colNames = []
        const collectionsToIgnore=[
            'cronHistory',
            'meteor_accounts_loginServiceConfiguration',
            'samples',
            'restaurants',
            'vulcanusers',
            'vulcanstorabletokens'
        ]

        console.log(`The following collections are being ignored: ${collectionsToIgnore}`)

        for(var x= 0;x<collections.length;x++){
            //add the user created collections, not those meteor ones or sample ones
            if(collectionsToIgnore.indexOf(collections[x].name)==-1){
                colNames.push(collections[x].name)
            }
        }
    return colNames
}

main().catch(console.error);
