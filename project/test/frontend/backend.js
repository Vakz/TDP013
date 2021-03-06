module.exports = function() {
  angular.module('httpBackendMock', ['socialApplication', 'ngMockE2E'])
  .run(['$httpBackend', '$rootScope', function($httpBackend, $rootScope) {
    $httpBackend.when('POST', /register/).respond(function(method, url, data) {
      data = JSON.parse(data);
      if (data.username === 'uname' && data.password === 'hellothere') {
        return [200, {_id: 'aaa', username: data.username}];
      }
      return [422];
    });
    $httpBackend.when('POST', /login/).respond(function(method, url,data) {
      data = JSON.parse(data);
      if (data.username === 'uname' && data.password === 'hellothere') {
        return [200, {_id: 'aaa', username: data.username}];
      }
      return [422];
    });
    $httpBackend.when('POST', /logout/).respond(function() {
      return [204];
    });
    $httpBackend.when('GET', /getProfile/).respond(function(method, url, data) {
      if (/=nonfriend/.test(url)) return [400];
      else if (/bbb/.test(url)) return [200, {_id: 'bbb', 'username': 'friend', messages: []}];
      return [200, {_id: 'aaa', username: 'uname',
      messages: [{from: 'bbb', to: 'aaa', _id:'messageid', message:'hellofriend',
                  time: Date.now()
                }]
      }];
    });
    $httpBackend.when('GET', /search/).respond(function() {
      return [200, [{_id: 'somelongid', username: 'uname' }]];
    });
    $httpBackend.when('GET', /getUsersById/).respond(function() {
      return [200, [{_id: 'nonfriend', username: "notyourfriend"}, {_id: 'bbb', username: 'otheruser'}]];
    });
    $httpBackend.when('DELETE', /deleteMessage/).respond(function() {
      return [204];
    });
    $httpBackend.when('POST', /sendMessage/).respond(function(method, url, data) {
      data = JSON.parse(data);
      $rootScope.$broadcast('NewProfileMessage', {_id: 'nicemessageid', from: 'aaa', to: 'aaa', message: data.message, time: Date.now(), username: 'someguy'});
      return [200, {_id: 'nicemessageid', from: 'aaa', to: 'aaa', message: data.message, time: Date.now()}];
    });
    $httpBackend.when('PUT', /updatePassword/).respond(function() {
      return [204];
    });
    $httpBackend.when('PUT', /resetSessions/).respond(function() {
      return [204];
    });
    $httpBackend.when('GET', /getFriends/).respond(function() {
      return [200, [{_id: 'idofuserone', username: 'userone'}, {_id: 'idofusertwo', username: 'usertwo'}]];
    });
    $httpBackend.when('GET', /partials|js|css/).passThrough();
  }]);
};
