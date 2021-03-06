"use strict";

let ArgumentError = require('./errors').ArgumentError;
let DatabaseError = require('./errors').DatabaseError;
let SemanticsError = require('./errors').SemanticsError;
let config = require('./config');
let UserSecurity = require('./userSecurity');
let Q = require('q');
let mongodb = require('mongodb');
let strings = require('./strings');

/*
 * Deletes empty parameters.
 */
let prepareParams = function(params) {
  Object.keys(params).forEach(function(key) {
    if (!params[key] || !params[key].trim())
    {
      delete params[key];
    }
  });
};

let DatabaseHandler = function() {
  let db = null;
  let connected = false;
  let collections = {};
  let scope = this; // For usage in callbacks

  let getCollection = function(collection) {
    if (!collections.hasOwnProperty(collection)) {
      collections[collection] = db.collection(collection);
    }
    return collections[collection];
  };

  let generateId = () => (new mongodb.ObjectId()).toString();

  let genericUpdateUser = function(id, params) {
    return Q.promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(id)) reject(new ArgumentError(strings.invalidId));
      else {
        getCollection(config.get('database:collections:auth')).updateOne({_id: id}, {$set: params})
        .then((doc) => { if (!doc.result.n) throw new SemanticsError(strings.noUpdated); })
        .then(() => scope.getUser({_id: id}))
        .then((doc) => resolve(doc))
        .catch(reject);
      }
    });
  };

  this.connect = function(){
    return Q.Promise(function(resolve, reject, notify)
    {
      if (connected) resolve(true);
      else {
        let address = config.get('database:address') + config.get('database:db');
        let dbConnect = mongodb.MongoClient.connect(address);

        let successful = function(_db) {
          db = _db;
          connected = true;
          resolve(true);
        };

        dbConnect.then(successful, reject);
      }
    });
  };

  this.close = function() {
    if (db) db.close();
    connected = false;
    db = null;
  };

  this.checkToken = function(token, id) {
    return Q.Promise(function(resolve, reject, notify) {
      scope.getUser({_id: id})
      .then((user) => resolve(user.token === token, reject))
      .catch(reject);
    });
  };

  this.getManyById = function(ids) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError("Not connected to database"));
      else if (!Array.isArray(ids)) reject(new ArgumentError(strings.idArrayInvalid));
      else if (ids.some((id) => !mongodb.ObjectId.isValid(id))) reject(new ArgumentError(strings.invalidIds));
      else {
        getCollection(config.get('database:collections:auth')).find({_id: {$in: ids} }).toArray()
        .then((res) => resolve(res))
        .catch(reject);
      }
    });
  };

  this.registerUser = function(params) {
    let scope = this;
    let requiredParams = ['username', 'password'];
    return Q.Promise(function(resolve, reject, notify) {
      // Make sure all are set
      if (!Object.keys(params).every(s => requiredParams.indexOf(s) >= 0)) {
        reject(new ArgumentError(strings.registerInvalidParams));
      }
      else if ([params.username, params.password].some(s => !s || typeof s !== 'string' || !s.trim())) {
        reject(new ArgumentError(strings.registerMissingParams));
      }
      /* istanbul ignore if */
      else if (!connected) {
        reject(new DatabaseError(strings.dbNotConnected));
      }
      else {
        // https://gist.github.com/Vakz/77b59958973ad49785b9
        scope.getUser({username: params.username})
        .then(function(doc) {
          if (doc) throw new SemanticsError(strings.usernameTaken);
        })
        .then(() => params._id = generateId())
        .then(() => UserSecurity.generateToken(config.get('security:sessions:tokenLength')))
        .then((val) => params.token = val)
        .then(() => getCollection(config.get('database:collections:auth')).insertOne(params))
        .then((doc) => resolve(doc.ops[0]))
        .catch(reject);
      }
    });
  };

  this.getUser = function(params) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if (!connected) reject(new DatabaseError(strings.dbNotConnected));
      Q.Promise(function(resolve) {
        prepareParams(params);
        resolve();
      })
      .then(function() {
        if (Object.keys(params).length === 0)
          throw new ArgumentError(strings.noParams);
      })
      .then(() => getCollection(config.get('database:collections:auth')).findOne(params))
      .then(resolve)
      .catch(reject);
    });
  };

  this.updateToken = function(id) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else {
        UserSecurity.generateToken(config.get('security:sessions:tokenLength'))
        .then((res) => genericUpdateUser(id, {token: res}))
        .then((res) => resolve(res.token))
        .catch(function(err) {
          if (err instanceof ArgumentError || err instanceof SemanticsError) reject(err);
          // If error is not an ArgumentError, it's likely something thrown from mongodb. Pass it on.
          else throw (err);
        })
        .catch(reject);
      }
    });
  };

  this.updatePassword = function(id, password, resetToken) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else {
        Q.Promise(function(resolve, reject) {
          if (resetToken) scope.updateToken(id).then(resolve);
          else resolve();
        }).then( () => genericUpdateUser(id, {'password': password}))
        .then((res) => resolve(res))
        .catch(reject);
      }
    });
  };

  this.searchUsers = function(searchword) {
    return Q.Promise(function(resolve, reject, notify)
    {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!searchword || typeof searchword !== 'string' || !searchword.trim()) {
        reject(new ArgumentError(strings.emptySearchword));
      }
      else {
        getCollection(config.get('database:collections:auth'))
        .find({"username": new RegExp(searchword)}).toArray()
        .then(resolve, reject);
      }
    });
  };

  this.newMessage = function(from, to, message) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else {
        scope.getManyById([from, to])
        .then(function(res) {
          if ((res.length !== 2 && from != to) || res.some((doc) => !doc)) throw new SemanticsError(strings.noUser);
        })
        .then(function() { if(!message || typeof message !== 'string' || !message.trim()) throw new ArgumentError(strings.emptyMessage); })
        .then(function() {return {'from': from, 'to': to, 'message': message, _id: generateId(), time: Date.now()}; })
        .then((params) => getCollection(config.get('database:collections:messages')).insertOne(params))
        .then((res) => resolve(res.ops[0]))
        .catch(reject);
      }
    });
  };

  this.getMessage = function(id) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if (!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(id)) {
        reject(new ArgumentError(strings.invalidId));
      }
      else {
        getCollection(config.get('database:collections:messages')).findOne({_id: id})
        .then(resolve)
        .catch(reject);
      }
    });
  };

  this.getMessages = function(id, after) {
    after = after || 0;
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(id)) {
        reject(new ArgumentError(strings.invalidId));
      }
      else {
        getCollection(config.get('database:collections:messages')).find({to: id, time: {$gt: after}}).sort({time: 1}).toArray()
        .then(resolve)
        .catch(reject);
      }
    });
  };

  this.getFriendships = function(id) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(id)) {
        reject(new ArgumentError(strings.invalidId));
      }
      else {
        getCollection(config.get('database:collections:friendships'))
        .find({$or: [{first: id}, {second: id}]}).toArray()
        .then(resolve)
        .catch(reject);
      }
    });
  };

  this.checkIfFriends = function(first, second) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(first) || !mongodb.ObjectId.isValid(second)) {
        reject(new ArgumentError(strings.invalidId));
      }
      else {
        if (first > second) first = [second, second = first][0];
        scope.getManyById([first, second])
        .then((users) => { if (users.length !== 2) throw new ArgumentError(strings.noUser);})
        .then(() => getCollection(config.get('database:collections:friendships')).findOne({'first':first, 'second': second}))
        .then((res) => resolve(res ? true : false))
        .catch(reject);
      }
    });
  };

  this.newFriendship = function(first, second) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(first) || !mongodb.ObjectId.isValid(second)) {
        reject(new ArgumentError(strings.invalId));
      }
      else if (first === second) {
        reject(new ArgumentError(strings.duplicateIds));
      }
      else {
        // Sort for easier storage
        if (first > second) first = [second, second = first][0];
        scope.checkIfFriends(first, second)
        .then((res) => { if (res) throw new ArgumentError(strings.alreadyFriends); })
        .then(() => ({'first': first, 'second': second, _id: generateId()}))
        .then((params) => getCollection(config.get('database:collections:friendships')).insert(params))
        .then((res) => resolve(res.ops[0]))
        .catch(reject);
      }
    });
  };

  this.deleteMessage = function(id) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(id)) reject(new ArgumentError(strings.invalidId));
      else {
        getCollection(config.get('database:collections:messages'))
        .remove({_id: id})
        .then(function(res) {
          resolve(res.result.n ? true : false);
        })
        .catch(reject);
      }
    });
  };

  this.unfriend = function(first, second) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(first) || !mongodb.ObjectId.isValid(second)) {
        reject(new ArgumentError(strings.invalidId));
      }
      else  {
        if (first > second) first = [second, second = first][0];
        getCollection(config.get('database:collections:friendships'))
        .remove({'first': first, 'second': second})
        .then(function(res) {
          resolve(res.result.n ? true : false);
        })
        .catch(reject);
      }
    });
  };

  this.addImage = function(owner, imageName) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(owner)) reject(new ArgumentError(strings.invalidId));
      else if (!imageName || typeof imageName !== 'string' || !imageName.trim()) reject(new ArgumentError(strings.invalidImageName));
      else {
        scope.getUser({_id: owner})
        .then(() => getCollection(config.get('database:collections:images'))
          .insert({_id: generateId(), owner: owner, name: imageName, time: Date.now()}))
        .then((res) => resolve(res.ops[0]))
        .catch(reject);
      }
    });
  };

  this.getImages = function(owner) {
    return Q.Promise(function(resolve, reject, notify) {
      /* istanbul ignore if */
      if(!connected) reject(new DatabaseError(strings.dbNotConnected));
      else if (!mongodb.ObjectId.isValid(owner)) reject(new ArgumentError(strings.invalidId));
      else {
        getCollection(config.get('database:collections:images')).find({owner: owner}).toArray()
        .then(resolve)
        .catch(reject);
      }
    });
  };
};

module.exports = DatabaseHandler;
/* istanbul ignore else */
if (process.env.NODE_ENV === 'test') {
  module.exports._private = { prepareParams: prepareParams };
}
