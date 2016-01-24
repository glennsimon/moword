(function (document) {
  'use strict';

  var querySelector = document.querySelector.bind(document);

  var TURN_TIME = '30';
  var storyId, fbEntries, fbTurn, connection, uid, connected, timeOffset, 
      turnStartTime, proVote, conVote; //turnObject;
  var fb = new Firebase('https://moword.firebaseio.com');
  var fbConnected = fb.child('.info/connected');
  var storyTextElement = querySelector('#storyText');
  var storyInputElement = querySelector('#storyInput');
  var loginWindow = querySelector('#login');
  var googleLogin = querySelector('#googleLogin');
  var authButton = querySelector('#authButton');
  var loggedIn = false;
  var timer = querySelector('#timer');
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
    fbTurn = fb.child('storyCurrentTurn').child(storyId);
    storyTextElement.textContent = '';
    initialize();
    setUserLocation();
  });

  function initialize() {
    var i, children;

    for (i = 1; i <= 5; i++) {
      children = querySelector('#entry' + i).children;
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
    fbTurn.on('value', function(snapshot) {
      updateTurn(snapshot);
    });
    fbEntries.on('child_added', function(snapshot) {
      addToStory(snapshot);
    });
  }

  // Initialize time at start of turn
  function startTurn(snapshot) {
    turnStartTime = snapshot.val();
    if (turnStartTime && !turnInProgress) {
      console.log('starting turn');
      timer.textContent = Number(TURN_TIME) - 
          Math.floor((new Date().getTime() + timeOffset - turnStartTime)/1000);
      setTimeout(decrementTimer, 1000);
      turnInProgress = true;
    }
  }

  // Set up adding entry to choices during turn
  function addTurnEntry(snapshot) {
    console.log('adding entry to choices');
    var turnEntry = snapshot.val();
    var turnEntryKey = snapshot.key();
    var entryCount, entryElement;

    entryCount = turnKeys.push(turnEntryKey);
    entryElement = querySelector('#entry' + entryCount);
    entryElement.classList.remove('none');
    entryElement.classList.add('entry');
    entryElement.children[0].textContent = turnEntry.entry;
    querySelector('main').style.marginBottom = querySelector('#footer').clientHeight + 'px';
    if (entryCount >= 5) {
      storyInputElement.disabled = true;
      storyInputElement.textContent = '';
    }
    scrollToBottom();
  }

  // Winning entry to storyContent on firebase
  function updateTurn(snapshot) {
    var currentTurn = snapshot.val();
    var i, entryElement, k, key, score, winningEntry;

    if (currentTurn && currentTurn.winner) {
      console.log('adding winning entry to storyContent');
      for (k in currentTurn.winner) {
        if (!currentTurn.winner.hasOwnProperty(k)) {continue;}
        key = k;
        score = currentTurn.winner[key];
      }
      winningEntry = {};
      winningEntry[key] = {};
      winningEntry[key].entry = currentTurn.entries[key].entry;
      winningEntry[key].user = currentTurn.entries[key].user;
      winningEntry[key].entryScore = score;    
      fbEntries.update(winningEntry);
      fbTurn.remove();
    }
    // this must be a separate if statement so that all players get cleanup
    // from previous turn after fbTurn.remove() from another player above.
    if (currentTurn === null) {
      for (i = 1; i <= 5; i++) {
        entryElement = querySelector('#entry' + i);
        entryElement.children[0].textContent = '';
        entryElement.classList.add('none');
        entryElement.classList.remove('entry');
        //entryElement.style.display = 'none'; //classList.add('invisible');
      }
      storyInputElement.disabled = false;
      turnInProgress = false;
      turnKeys = [];
      scrollToBottom();
      querySelector('main').style.marginBottom = 0;
    }
  }

  function entryVote(e) {
    var source, entryIndex, vote, notVote;

    source = e.srcElement;
    entryIndex = Number(source.parentNode.id.slice(-1)) - 1;
    vote = source.textContent === '+' ? 'pro' : 'con';
    notVote = vote === 'pro' ? 'con' : 'pro';
    fbTurn.child('entries').transaction(function(currentData) {
      var key, prevProVote, prevConVote;

      // cancel transaction if turn is already over
      if (!turnInProgress) {return;}
      if (currentData === null) {return currentData;}
      key = turnKeys[entryIndex];

      prevProVote = proVote;
      prevConVote = conVote;
      currentData[key].entryVotes = currentData[key].entryVotes || {};
      currentData[key].entryVotes[vote] = currentData[key].entryVotes[vote] || {};
      currentData[key].entryVotes[vote][uid] = true;
      currentData[key].entryVotes[notVote] = currentData[key].entryVotes[notVote] || {};
      delete currentData[key].entryVotes[notVote][uid];
      if (vote === 'pro' && prevProVote) {
        currentData[prevProVote].entryVotes = currentData[prevProVote].entryVotes || {};
        delete currentData[prevProVote].entryVotes.pro[uid];
        proVote = key;
      }
      if (vote === 'con' && prevConVote) {
        currentData[prevConVote].entryVotes = currentData[prevConVote].entryVotes || {};
        delete currentData[prevConVote].entryVotes.pro[uid];
        conVote = key;
      }
      return currentData;     
    }, function(error, wasCommitted, snapshot) {
      var result = snapshot ? snapshot.val() : 'Transaction completed by another user.';
      console.log('Error: ' + error);
      console.log('Committed?: ' + wasCommitted);
      console.log('Result:');
      console.log(result);
    }, false);
  }

  // Set up adding entry to story at end of turn
  function addToStory(snapshot) {
    console.log('adding entry to display');
    storyTextElement.textContent += snapshot.val().entry + ' ';
    scrollToBottom();
  }

  function scrollToBottom() {
    window.scrollTo(0, querySelector('main').clientHeight);
  }

  // record what story the user is currently in
  function setUserLocation() {
    if (storyId && uid) {
      fb.child('people').child(uid).child('currentStory').set(storyId);
    }
  }

  // Enter an entry to start turn or add to current turn
  storyInputElement.addEventListener('keyup', function(e) {
    var entry, firstProVote;

    if (e.keyCode === 13) {
      entry = storyInputElement.value;
      firstProVote = {};
      firstProVote.pro = {};
      firstProVote.pro[uid] = true;
      if (!turnStartTime) {
        fbTurn.child('turnStartTime').set(Firebase.ServerValue.TIMESTAMP);
      } 
      fbTurn.child('entries').push({
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
    loginWindow.style.display = 'none';
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
      profileGreeting.style.display = 'block';
      profilePic.setAttribute('src', authData.google.profileImageURL);
      profilePic.style.display = 'block';
    } else {
      profileGreeting.style.display = 'none';
      profilePic.style.display = 'none';
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
    fbTurn.transaction(function(currentData) {
      var prop, proObject, conObject, winner, key, winningKey;
      var candidateScore, winningScore = -1; 

      // cancel transaction if turn is already over
      if (!turnInProgress) {return;}
      for (key in currentData.entries) {
        if (!currentData.entries.hasOwnProperty(key)) {continue;}
        candidateScore = 0;
        if (currentData.entries[key].entryVotes) {
          proObject = currentData.entries[key].entryVotes.pro;
          conObject = currentData.entries[key].entryVotes.con;
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
      winner = {};
      winner[winningKey] = winningScore;
      if (winningScore > -1) {
        currentData.winner = winner;   
        return currentData;     
      } else {
        return;
      }
    }, function(error, wasCommitted, snapshot) {
      var result = snapshot ? snapshot.val() : 'Transaction completed by another user.';
      console.log('Error: ' + error);
      console.log('Committed?: ' + wasCommitted);
      console.log('Result:');
      console.log(result);
    }, false);
  }
})(document);