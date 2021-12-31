## Migrate vulcan meteor accounts to vulcan-next

A script that loops through all user created mongo collections, and migrates Meteor _id to a Mongo ObjectId

1. Change the `config.js` to your database name and mongo connection string
2. Run `node start.js` to start the migration
---

 
### How it works:
* Inserts a new document for every record in order to create the Object ID, then delets the old one.
* Updates all foreign key Meteor IDs of all collections using [text search](https://docs.mongodb.com/manual/text-search/)
* Stores the old Meteor ID in document.legacyId field for reference 
* The Mongo String ID is used for foreign keys instead of the ObjectID because graphQL queries with filters `_and`, `_or` operators only work with the String Id in vulcan-next (unless it's the primary _id)

#### User migration:
* A `user.salt` and `user.hash` will be made from meteor bcrypt password

You can also add your own migrations specific to your app to `/migrations` folder, and import them to the `start.js` script - there are a couple examples in there to copy.



