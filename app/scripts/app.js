(function (document) {
  'use strict';

  var querySelector = document.querySelector.bind(document);

  var TURN_TIME = '30';
  var storyId, fbEntries, connection, uid, connected, timeOffset, turnObject, turnRef;
  var fb = new Firebase('https://moword.firebaseio.com');
  var fbConnected = fb.child('.info/connected');
  var storyTextElement = querySelector('#storyText');
  var storyInputElement = querySelector('#storyInput');
  var loginWindow = querySelector('#login');
  var googleLogin = querySelector('#googleLogin');
  var authButton = querySelector('#authButton');
  var loggedIn = false;
  var timer = querySelector('#timer');
  //var candidates = [];
  
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
    onContentAddedInit();
    onContentChangedInit();
    setUserLocation();
  });

  function onContentAddedInit() {
    fbEntries.on('child_added', function(snapshot) {
      var turnEntry = snapshot.val();
      var turnEntryKey;

      if (turnEntry.entry) {
        storyTextElement.textContent += turnEntry.entry + ' ';
        querySelector('main').style.marginBottom = 0;
        scrollToBottom();
      } else {
        turnEntryKey = snapshot.key();
        turnObject = {};
        turnObject.key = turnEntryKey;
        turnObject.turnEntries = [];
        turnObject.turnStartTime = turnEntry.turnStartTime;
        onEntryAddedInit(turnEntryKey);
        //initiateTurn();
      }
    });
  }

  function onContentChangedInit() {
    fbEntries.on('child_changed', function(snapshot) {
      var i, entryElement;
      var turnEntry = snapshot.val();

      if (turnEntry.entry) {
        storyTextElement.textContent += turnEntry.entry + ' ';
        querySelector('main').style.marginBottom = 0;
        for (i = 1; i <= 5; i++) {
          entryElement = querySelector('#entry' + i);
          entryElement.textContent = '';
          entryElement.style.display = 'none'; //classList.add('invisible');
        }
        storyInputElement.disabled = false;
        fbEntries.child(snapshot.key()).child('candidates').off('child_added', turnRef);
        turnObject = undefined;
      }
    });
  }

  function onEntryAddedInit(turnObjectKey) {
    turnRef = fbEntries.child(turnObjectKey).child('candidates').on('child_added', function(snapshot) {
      var entryCount, entryElement;
      var turnEntry = snapshot.val();
      var candidate = {};

      candidate.key = snapshot.key();
      candidate.entry = turnEntry.entry;
      candidate.entryVotes = turnEntry.entryVotes;
      candidate.user = turnEntry.user;
      //candidate.key = snapshot.key();
      //candidate.turnEntry = turnEntry;
      entryCount = turnObject.turnEntries.push(candidate);
      entryElement = querySelector('#entry' + entryCount);
      entryElement.textContent = turnEntry.entry;
      entryElement.style.display = 'block'; //classList.remove('invisible');
      querySelector('main').style.marginBottom = querySelector('#footer').clientHeight + 'px';
      if (entryCount === 1) {
        initiateTurn();
      }
      if (entryCount === 5) {
        storyInputElement.disabled = true;
        storyInputElement.textContent = '';
      }
      scrollToBottom();
    });
  }

  function scrollToBottom() {
    window.scrollTo(0, querySelector('main').clientHeight);
  }

  function setUserLocation() {
    if (storyId && uid) {
      fb.child('people').child(uid).child('currentStory').set(storyId);
    }
  }

  storyInputElement.addEventListener('keydown', function(e) {
    var entry, firstProVote;
    var turnObjectKey;

    if (e.keyCode === 13) {
      entry = storyInputElement.value;
      firstProVote = {};
      firstProVote.pro = {};
      firstProVote.pro[uid] = true;
      if (!turnObject) {
        turnObjectKey = fbEntries.push({'turnStartTime': Firebase.ServerValue.TIMESTAMP}).key();
      } 
      fbEntries.child(turnObjectKey || turnObject.key).child('candidates').push({
        'entry': entry,
        'entryVotes': firstProVote,
        'user': uid
      },
      function(error) {
        if (error) {
          console.log('Error during new word push: ' + error.toString());
        }
      });
      storyInputElement.value = '';
      //storyInputElement.disabled = true;  //uncomment before deploy
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
    timer.textContent = Number(TURN_TIME) - Math.floor((new Date().getTime() + timeOffset - turnObject.turnStartTime)/1000);
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
    var candidateScore = 0, winningScore = -1;
    var winner = { 'key': '-1', 'entry': { 'entryScore': -1 }};

    turnObject.turnEntries.forEach(function(candidate) {
      var prop;
      var proObject = candidate.entryVotes.pro;
      var conObject = candidate.entryVotes.con;

      for (prop in proObject) {
          candidateScore += 1;
      }
      for (prop in conObject) {
          candidateScore -= 1;
      }
      if (candidateScore > winningScore) {
        winningScore = candidateScore;
        winner = candidate;
      } 
      candidateScore = 0;
    });
    if (winner.key !== '-1') {
      fbEntries.child(turnObject.key).transaction(function(currentData) {
        if (currentData.turnStartTime) {
          currentData.entry = currentData.candidates[winner.key].entry;
          currentData.entryScore = winningScore;
          currentData.user = currentData.candidates[winner.key].user;
          delete currentData.turnStartTime;
          delete currentData.candidates;
          return currentData;
        } else {
          return;
        }
      });
    }
    /*for (i = 1; i <= 5; i++) {
      entryElement = querySelector('#entry' + i);
      entryElement.textContent = '';
      entryElement.style.display = 'none'; //classList.add('invisible');
    }
    storyInputElement.disabled = false;*/
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
