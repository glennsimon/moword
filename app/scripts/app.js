(function (document) {
  'use strict';

  var querySelector = document.querySelector.bind(document);

  var TURN_TIME = '30';
  var storyId, fbEntries, connection, uid, connected, timeOffset;
  var fb = new Firebase('https://moword.firebaseio.com');
  var fbConnected = fb.child('.info/connected');
  var storyTextElement = querySelector('#storyText');
  var storyInputElement = querySelector('#storyInput');
  var loginWindow = querySelector('#login');
  var googleLogin = querySelector('#googleLogin');
  var authButton = querySelector('#authButton');
  var loggedIn = false;
  var timer = querySelector('#timer');
  var candidates = [];
  
  fb.child('.info').child('serverTimeOffset').once('value', function(snap) {
    timeOffset = snap.val();
  });

  fbConnected.on('value', function(snap) {
    connected = snap.val();
    setOnlineStatus();
  });

  function setOnlineStatus() {
    if (connected && uid) {
      // We're connected and the user is authorized
      // add this device to the users connections list
      connection = fb.child('people').child(uid).child('online').push(true);
      connection.onDisconnect().remove();
    } else if (connection) {
      connection.remove();
    }
  }

  fb.child('stories').limitToLast(10).once('value', function(snapshot) {
    var stories = snapshot.val();
    var storyKeys;

    if (stories === null) {
      storyId = fb.child('stories').push({
        'currentTitle': '',
        'storyScore': 0,
        'type': 'public',
        'dateCreated': Firebase.ServerValue.TIMESTAMP,
        'activityMeasure': 0
      }).key();
    } else {
      storyKeys = Object.keys(stories);
      storyId = storyKeys[storyKeys.length - 1];
    }
    fbEntries = fb.child('storyContent').child(storyId).child('entries');
    storyTextElement.textContent = '';
    setUpConnection();
    setUserLocation();
  });

  function setUpConnection() {
    fbEntries.on('child_added', function(snapshot) {
      var entryCount, entryElement;
      var turnEntry = snapshot.val();
      var candidate = {};

      if (!turnEntry.candidate) {
        storyTextElement.textContent += turnEntry.entry + ' ';
      } else {
        candidate.key = snapshot.key();
        candidate.turnEntry = turnEntry;
        entryCount = candidates.push(candidate);
        entryElement = querySelector('#entry' + entryCount);
        entryElement.textContent = turnEntry.entry;
        entryElement.style.display = 'block'; //classList.remove('invisible');
        querySelector('main').style.marginBottom = querySelector('#footer').clientHeight + 'px';
      }
      if (entryCount === 1) {
        initiateTurn();
      }
      if (entryCount === 5) {
        storyInputElement.disabled = true;
        storyInputElement.textContent = '';
      }
      scrollToBottom();
    });

    function scrollToBottom() {
      window.scrollTo(0, querySelector('main').clientHeight);
    }

    fbEntries.on('child_changed', function(snapshot) {
      var key = snapshot.key();
      var turnEntry = snapshot.val();

      if (turnEntry.candidate) {
        candidates.forEach(function(candidate) {
          if (candidate.key === key) {
            candidates[candidates.indexOf(candidate)].turnEntry = turnEntry;
          }
        });
      } else {
        storyTextElement.textContent += turnEntry.entry + ' ';
        querySelector('main').style.marginBottom = 0;
      }
    });
  }

  function setUserLocation() {
    if (storyId && uid) {
      fb.child('people').child(uid).child('currentStory').set(storyId);
    }
  }

  storyInputElement.addEventListener('keydown', function(e) {
    var entry;
    if (e.keyCode === 13) {
      entry = storyInputElement.value;
      fbEntries.push({
        'candidate': true,
        'entry': entry,
        'entryScore': 1,
        'user': uid
      });
      storyInputElement.value = '';
    }
  });

  storyInputElement.addEventListener('focus', function() {
    if (!loggedIn) {
      loginWindow.style.display = 'flex'; //classList.remove('invisible');
    }
  });

  authButton.addEventListener('click', function() {
    if (!loggedIn) {
      loginWindow.style.display = 'flex'; //classList.remove('invisible');
    } else {
      fb.unauth();
    }
  });

  googleLogin.addEventListener('click', function() {
    loginWindow.style.display = 'none'; //classList.add('invisible');
    // prefer pop-ups, so we don't navigate away from the page
    fb.authWithOAuthPopup('google', function(error, authData) {
      if (error) {
        if (error.code === 'TRANSPORT_UNAVAILABLE') {
          // fall-back to browser redirects, and pick up the session
          // automatically when we come back to the origin page
          fb.authWithOAuthRedirect('google', function(error) {
            console.log('Auth failure with error: ' + error);
          });
        }
      } else if (authData) {
        console.log(authData);
      }
    });
  });

  fb.onAuth(function(authData) {
    if (authData) {
      loggedIn = true;
      authButton.textContent = 'Logout';
      uid = authData.uid;
      showProfile(true, authData);
      recordAuth(authData);
    } else {
      authButton.textContent = 'Login';
      if (loggedIn) {
        showProfile(false);
      }
      loggedIn = false;
      uid = undefined;
    }
    setOnlineStatus();
    setUserLocation();
  });

  function showProfile(makeVisible, authData) {
    var profilePic = querySelector('#profilePic');
    var profileName = querySelector('#profileName');
    var profileGreeting = querySelector('#profileGreeting');

    if (makeVisible) {
      profileName.textContent = authData.google.displayName.split(' ')[0];
      profileGreeting.style.display = 'block'; //classList.remove('invisible');
      profilePic.setAttribute('src', authData.google.profileImageURL);
      profilePic.style.display = 'block'; //classList.remove('invisible');
    } else {
      profileGreeting.style.display = 'none'; //classList.add('invisible');
      profilePic.style.display = 'none'; //classList.add('invisible');
    }
  }

  function recordAuth(authData) {
    var fbUser = fb.child('people').child(uid);

    fbUser.once('value', function(snapshot) {
      if (!snapshot.val()) {
        // Use update instead of set in case there is a race condition with
        // currentStory: storyId
        fbUser.update({
          'userName': authData.google.displayName,
          'provider': 'google',
          'gameScore': 0
        });
      }
    });
  }

  function initiateTurn() {
    fb.child('storyContent').child(storyId).child('turnStartTime').once('value', function(timeSnap) {
      if (timeSnap.val()) {
        querySelector('#timer').textContent = 
          30 - Math.floor((new Date().getTime() + timeOffset - timeSnap.val())/1000);
      } else {
        querySelector('#timer').textContent = TURN_TIME;
        fb.child('storyContent').child(storyId).child('turnStartTime').set(Firebase.ServerValue.TIMESTAMP);
      }
    });
    setTimeout(decrementTimer, 1000);
  }

  function decrementTimer() {
    var timerNumber = Number(timer.textContent);
    if (timerNumber > 1) {
      timer.textContent = Number(timer.textContent) - 1;
      setTimeout(decrementTimer, 1000);          
    } else {
      timer.textContent = '';
      selectWinner();
    }
  }

  function selectWinner() {
    var i, entryElement, keysToRemove = [];
    var winner = { 'key': '-1', 'turnEntry': { 'entryScore': -1 }};

    candidates.forEach(function(candidate) {
      if (candidate.turnEntry.entryScore > winner.turnEntry.entryScore) {
        keysToRemove.push(winner.key);
        winner = candidate;
      } else {
        keysToRemove.push(candidate.key);
      }
    });
    keysToRemove.forEach(function(key) {
      fbEntries.child(key).remove();
    });
    if (winner.key !== '-1') {
      fbEntries.child(winner.key).transaction(function(currentData) {
        if (currentData.candidate) {
          delete currentData.candidate;
          return currentData;
        } else {
          return;
        }
      });
      fb.child('storyContent').child(storyId).child('turnStartTime').remove();
    }
    for (i = 1; i <= 5; i++) {
      entryElement = querySelector('#entry' + i);
      entryElement.textContent = '';
      entryElement.style.display = 'none'; //classList.add('invisible');
    }
    storyInputElement.disabled = false;
    candidates = [];
  }
})(document);

/*
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt


(function(document) {
  'use strict';

  // Grab a reference to our auto-binding template
  // and give it some initial binding values
  // Learn more about auto-binding templates at http://goo.gl/Dx1u2g
  var app = document.querySelector('#app');

  app.displayInstalledToast = function() {
    // Check to make sure caching is actually enabled—it won't be in the dev environment.
    if (!document.querySelector('platinum-sw-cache').disabled) {
      document.querySelector('#caching-complete').show();
    }
  };

  // Listen for template bound event to know when bindings
  // have resolved and content has been stamped to the page
  app.addEventListener('dom-change', function() {
    console.log('Our app is ready to rock!');
  });

  // See https://github.com/Polymer/polymer/issues/1381
  window.addEventListener('WebComponentsReady', function() {
    // imports are loaded and elements have been registered
  });

  // Main area's paper-scroll-header-panel custom condensing transformation of
  // the appName in the middle-container and the bottom title in the bottom-container.
  // The appName is moved to top and shrunk on condensing. The bottom sub title
  // is shrunk to nothing on condensing.
  addEventListener('paper-header-transform', function(e) {
    var appName = document.querySelector('#mainToolbar .app-name');
    var middleContainer = document.querySelector('#mainToolbar .middle-container');
    var bottomContainer = document.querySelector('#mainToolbar .bottom-container');
    var detail = e.detail;
    var heightDiff = detail.height - detail.condensedHeight;
    var yRatio = Math.min(1, detail.y / heightDiff);
    var maxMiddleScale = 0.50;  // appName max size when condensed. The smaller the number the smaller the condensed size.
    var scaleMiddle = Math.max(maxMiddleScale, (heightDiff - detail.y) / (heightDiff / (1-maxMiddleScale))  + maxMiddleScale);
    var scaleBottom = 1 - yRatio;

    // Move/translate middleContainer
    Polymer.Base.transform('translate3d(0,' + yRatio * 100 + '%,0)', middleContainer);

    // Scale bottomContainer and bottom sub title to nothing and back
    Polymer.Base.transform('scale(' + scaleBottom + ') translateZ(0)', bottomContainer);

    // Scale middleContainer appName
    Polymer.Base.transform('scale(' + scaleMiddle + ') translateZ(0)', appName);
  });

  // Close drawer after menu item is selected if drawerPanel is narrow
  app.onDataRouteClick = function() {
    var drawerPanel = document.querySelector('#paperDrawerPanel');
    if (drawerPanel.narrow) {
      drawerPanel.closeDrawer();
    }
  };

  // Scroll page to top and expand header
  app.scrollPageToTop = function() {
    querySelector('mainContainer').scrollTop = 0;
  };

})(document);*/
