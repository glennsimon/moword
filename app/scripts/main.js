(function (document) {
  'use strict';

  var querySelector = document.querySelector.bind(document);

  var TURN_TIME = 30;
  var storyId, fbEntries, fbTurn, connection, userId, connected, 
      timeOffset, turnStartTime; //turnObject;
  var fb = new Firebase('https://moword.firebaseio.com');
  var fbConnected = fb.child('.info/connected');
  var storyTextElement = querySelector('#mw-story-text');
  var storyInputElement = querySelector('#mw-input');
  var loginWindow = querySelector('#mw-login');
  var googleLogin = querySelector('#googleLogin');
  var authButton = querySelector('#authButton');
  var loggedIn = false;
  var timer = querySelector('#mw-timer');
  var turnKeys = [];
  var turnInProgress = false;

  fb.child('.info').child('serverTimeOffset').once('value', function(snap) {
    timeOffset = snap.val();
  });

  fbConnected.on('value', function(snap) {
    connected = snap.val();
    setOnlineStatus();
  });

  function setOnlineStatus() {
    if (connected && userId) {
      // We're connected and the user is authorized
      // add this device to the users connections list
      connection = fb.child('people').child(userId).child('online').push(true);
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
    fbTurn = fb.child('turnEntries').child(storyId);
    storyTextElement.textContent = '';
    initialize();
    setUserLocation();
  });

  function initialize() {
    var i, children;

    for (i = 1; i <= 5; i++) {
      children = querySelector('#mw-entry' + i).children;
      children[1].addEventListener('click', entryVote);
      children[2].addEventListener('click', entryVote);
    }
    console.log('initializing firebase callbacks');
    fbTurn.child('turnStartTime').on('value', function(snapshot) {
      startTurn(snapshot);
    });
    fbTurn.child('entries').on('child_added', function(snapshot) {
      addTurnEntry(snapshot);
    });
    fbEntries.on('child_added', function(snapshot) {
      addToStory(snapshot);
    });
    fb.child('turnEntries').on('child_removed', function() {
      resetUi();
    });
  }

  // Initialize time at start of turn *
  function startTurn(snapshot) {
    turnStartTime = snapshot.val();
    if (turnStartTime && !turnInProgress) {
      console.log('starting turn');
      timer.textContent = TURN_TIME -
          Math.floor((new Date().getTime() + timeOffset - turnStartTime)/1000);
      setTimeout(decrementTimer, 1000);
      turnInProgress = true;
    }
  }

  // Set up adding entry to choices during turn *
  function addTurnEntry(snapshot) {
    console.log('adding entry to choices');
    var turnEntry = snapshot.val();
    var turnEntryKey = snapshot.key();
    var entryCount;
    var entryElement;

    entryCount = turnKeys.push(turnEntryKey);
    entryElement = querySelector('#mw-entry' + entryCount);
    entryElement.classList.remove('hidden');
    entryElement.classList.add('mw-entry');
    entryElement.children[0].textContent = turnEntry.entry;
    if (userId === turnEntry.user) {
      entryElement.children[1].children[0].classList.remove('mdl-color-text--grey-400');
      entryElement.children[1].children[0].classList.add('mdl-color-text--accent');
    }
    //querySelector('main').style.marginBottom = querySelector('#mw-footer').clientHeight + 'px';
    if (entryCount >= 5) {
      storyInputElement.disabled = true;
      storyInputElement.textContent = '';
    }
    scrollToBottom();
  }

  // reset user interface after turn ends *
  function resetUi() { //snapshot) {
    var i, entryElement;
    
    for (i = 1; i <= 5; i++) {
      entryElement = querySelector('#mw-entry' + i);
      entryElement.children[0].textContent = '';
      entryElement.classList.add('hidden');
      //entryElement.classList.remove('mw-entry');
      entryElement.children[1].children[0].classList.remove('mdl-color-text--accent');
      entryElement.children[1].children[0].classList.add('mdl-color-text--grey-400');
      entryElement.children[2].children[0].classList.remove('mdl-color-text--accent');
      entryElement.children[2].children[0].classList.add('mdl-color-text--grey-400');
    }
    storyInputElement.disabled = false;
    turnInProgress = false;
    turnKeys = [];
    scrollToBottom();
    querySelector('main').style.marginBottom = 0;
  }

  // enter vote for one of the choices *
  function entryVote(e) {
    var i, source, entryIndex, element, vote, antiVote;

    source = e.srcElement;
    entryIndex = Number(source.parentNode.parentNode.id.slice(-1)) - 1;
    vote = source.textContent === 'favorite' ? 'pro' : 'con';
    antiVote = vote === 'pro' ? 'con' : 'pro';
    for (i = 1; i <= 5; i++) {
      if (vote === 'pro') {
        element = querySelector('#mw-entry' + i).children[1].children[0];
        element.classList.remove('mdl-color-text--grey-400');
        element.classList.add('mdl-color-text--accent');
      } else {
        element = querySelector('#mw-entry' + i).children[2].children[0];
        element.classList.remove('mdl-color-text--grey-400');
        element.classList.add('mdl-color-text--accent');
      }
    }
    source.classList.remove('mdl-color-text--grey-400');
    source.classList.add('mdl-color-text--accent');
    element = source.parentNode.parentNode.children[vote === 'pro' ? 2 : 1].children[0];
    element.classList.remove('mdl-color-text--accent');
    element.classList.add('mdl-color-text--grey-400');
    fbTurn.child('entries').once('value', function(snapshot) {
      var key, entry;
      var entries = snapshot.val();

      // cancel transaction if turn is already over
      if (!turnInProgress) {return;}
      for (entry in entries) {
        entries[entry].entryVotes = entries[entry].entryVotes || {};
        entries[entry].entryVotes.pro = entries[entry].entryVotes.pro || {};
        entries[entry].entryVotes.con = entries[entry].entryVotes.con || {};
        // delete any previous 'pro' or 'con' vote, depending on present vote
        if (entries[entry].entryVotes[vote][userId]) {
          fbTurn.child('entries').child(entry).child('entryVotes').child(vote).child(userId).remove();
        }
      }
      // add new 'pro' or 'con' vote and delete opposite
      key = turnKeys[entryIndex];
      fbTurn.child('entries').child(key).child('entryVotes').child(vote).child(userId).set(true);
      //if (entries[key].entryVotes.con[userId]) {
        fbTurn.child('entries').child(key).child('entryVotes').child(antiVote).child(userId).remove();
      //}
    });
  }

  // Set up adding entry to story at end of turn *
  function addToStory(snapshot) {
    console.log('adding entry to display');
    storyTextElement.textContent += snapshot.val().entry + ' ';
    scrollToBottom();
  }

  function scrollToBottom() {
    var main = querySelector('main');
    main.scrollTop = main.scrollHeight;
  }

  // record what story the user is currently in
  function setUserLocation() {
    if (storyId && userId) {
      fb.child('people').child(userId).child('currentStory').set(storyId);
    }
  }

  // Enter an entry to start turn or add to current turn *
  storyInputElement.addEventListener('keyup', function(e) {
    var entry, firstProVote;

    if (e.keyCode === 13) {
      entry = storyInputElement.value;
      firstProVote = {};
      firstProVote.pro = {};
      firstProVote.pro[userId] = true;
      if (!turnStartTime) {
        fbTurn.child('turnStartTime').set(Firebase.ServerValue.TIMESTAMP);
      } 
      fbTurn.child('entries').push({
        'entry': entry,
        'entryVotes': firstProVote,
        'user': userId
      },
      function(error) {
        if (error) {
          console.log('Error during new word push: ' + error.toString());
        }
      });
      storyInputElement.value = '';
      storyInputElement.parentElement.classList.remove('is-dirty');
      storyInputElement.disabled = true;  //uncomment before deploy
    }
  });

  storyInputElement.addEventListener('focus', function() {
    if (!loggedIn) {
      loginWindow.style.display = 'flex';
    }
  });

  authButton.addEventListener('click', function() {
    if (!loggedIn) {
      loginWindow.style.display = 'flex';
    } else {
      fb.unauth();
    }
  });

  googleLogin.addEventListener('click', function() {
    loginWindow.classList.add('hidden');
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
      userId = authData.uid;
      showProfile(true, authData);
      recordAuth(authData);
    } else {
      authButton.textContent = 'Login';
      if (loggedIn) {
        showProfile(false);
      }
      loggedIn = false;
      userId = undefined;
    }
    setOnlineStatus();
    setUserLocation();
  });

  function showProfile(makeVisible, authData) {
    var profilePic = querySelector('#mw-profile__pic');
    var profileName = querySelector('#mw-profile__name');

    if (makeVisible) {
      profileName.textContent = authData.google.displayName.split(' ')[0];
      profilePic.setAttribute('src', authData.google.profileImageURL);
      profilePic.style.display = 'block';
    } else {
      profilePic.classList.add('hidden');
    }
  }

  function recordAuth(authData) {
    var fbUser = fb.child('people').child(userId);

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
    console.log('adding winner to storyCurrentTurn');
    fbTurn.once('value', function(snapshot) {
      var turnData, prop, proObject, conObject, winner, key, winningKey;
      var candidateScore, winningScore = -1; 

      turnData = snapshot.val();

      // cancel if turn is already over
      if (!turnInProgress || !turnData) {return;}
      for (key in turnData.entries) {
        if (!turnData.entries.hasOwnProperty(key)) {continue;}
        candidateScore = 0;
        if (turnData.entries[key].entryVotes) {
          proObject = turnData.entries[key].entryVotes.pro;
          conObject = turnData.entries[key].entryVotes.con;
          for (prop in proObject) {
            candidateScore += 1;
          }
          for (prop in conObject) {
            candidateScore -= 1;
          }
        }
        if (candidateScore > winningScore) {
          winningScore = candidateScore;
          winningKey = key;
        }
      }
      if (winningScore > -1) {
        winner = {};
        winner[winningKey] = {};
        winner[winningKey].entry = turnData.entries[winningKey].entry;
        winner[winningKey].user = turnData.entries[winningKey].user;
        winner[winningKey].entryScore = winningScore;
        fbEntries.update(winner);
      }
      fbTurn.remove();
    });
  }

  querySelector('body').onresize = scrollToBottom;
})(document);