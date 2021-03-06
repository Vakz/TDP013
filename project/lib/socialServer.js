"use strict";

let express = require('express');
let errors = require('./errors');
let config = require('./config');
let RequestHandler = require('./requestHandler');
let clientSessions = require('client-sessions');
let UserSecurity = require('./userSecurity');
let bodyParser = require('body-parser');
let DatabaseHandler = require('./databaseHandler');
var upload = require('multer')( { dest: 'static/images/', limits: { fileSize: 5 * 1000 * 1000 } } );


let SocialServer = function(){

  let app = express();
  let server = null;
  let chat = null;
  let dbHandler = new DatabaseHandler();
  let requestHandler = new RequestHandler(dbHandler);
  let sessionsSettings = UserSecurity.getSessionOptions();

  setupMiddleware();
  setupRoutes();

  function setupMiddleware() {
    app.use(express.static('static'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(clientSessions(sessionsSettings));
    app.use(function(req, res, next) {
      if (req.session.loggedIn) {
        // Verify that users token is still valid
        dbHandler.checkToken(req.session.token, req.session._id)
        .then(function(res) {
          if (!res) req.session.reset();
        })
        .then(next);
      }
      else {
        next();
      }
    });
  }

  function setupRoutes() {
    app.get('/getUsersById', requestHandler.getUsersById);

    app.post('/register', requestHandler.register);

    app.post('/login', requestHandler.login);

    app.post('/logout', requestHandler.logout);

    app.put('/resetSessions', requestHandler.resetSessions);

    app.put('/updatePassword', requestHandler.updatePassword);

    app.get('/getProfile', requestHandler.getProfile);

    app.get('/search', requestHandler.search);

    app.post('/sendMessage', requestHandler.sendMessage);

    app.delete('/deleteMessage', requestHandler.deleteMessage);

    app.post('/addFriend', requestHandler.addFriend);

    app.delete('/unfriend', requestHandler.unfriend);

    app.get('/checkIfFriends', requestHandler.checkIfFriends);

    app.get('/getFriends', requestHandler.getFriends);

    app.get('/getMessages', requestHandler.getMessages);

    app.get('/getImages', requestHandler.getImages);

    app.post('/addImage', upload.single('file'), requestHandler.addImage);

    app.use(function(req, res) {
      res.sendStatus(404);
    });

  }

  this.start = function() {
    dbHandler.connect()
    .then(function() {
      server = app.listen(config.get('server:port'));
      chat = new (require('./chat'))(dbHandler);
    })
    .done();
  };

  this.stop = function() {
    server.close();
    chat.stop();
    requestHandler.close();
  };
};

module.exports = SocialServer;
