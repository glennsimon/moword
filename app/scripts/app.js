(function (document) {
  'use strict';

  var storyId, storyText;
  //var entries = 0;
  var firebase = new Firebase('https://moword.firebaseio.com');
  var storyTextElement = document.getElementById('storyText');
  var storyInputElement = document.getElementById('storyInput');
  var turnInProgress = false;
  var timer = document.getElementById("timer");
  var timeOffset;
  var winningEntry = undefined;

  firebase.child(".info").child("serverTimeOffset").on("value", function(snap) {
    timeOffset = snap.val();
    //var estimatedServerTimeMs = new Date().getTime() + offset;
  });

  firebase.child("stories").limitToLast(10).once("value", function(snapshot) {
    var story = snapshot.val();
    var storyKeys;
    //console.log(story);
    if (story === null) {
      storyId = firebase.child("stories").push({
        "currentTitle": "",
        "storyScore": 0,
        "type": "public",
        "dateCreated": Firebase.ServerValue.TIMESTAMP,
        "activityMeasure": 0
      }).key();
    } else {
      storyKeys = Object.keys(story);
      storyId = storyKeys[storyKeys.length - 1];
      //console.log(storyId);
    }
    storyTextElement.textContent = '';
    setUpConnection();
  });

  storyInputElement.addEventListener('keydown', function(e) {
    var entry;
    var entryElement;
    //console.log(e);
    if (e.keyCode === 13) {
      entry = storyInputElement.value;
      firebase.child("storyContent").child(storyId).child("currentTurn").push({
        "entry": entry,
        "entryScore": 1,
        "member": "glenn@moword"
      });
      storyInputElement.value = '';
    }
  });

  function setUpConnection() {
    firebase.child("storyContent").child(storyId).child("currentTurn").on("value", function(snapshot) {
      var entryKey, entries = 0;
      var turnEntries = snapshot.val();
      //console.log(turnEntries);
      var entryElement, startTime;
      if (turnEntries && !turnInProgress) {
        turnInProgress = true;
        firebase.child("storyContent").child(storyId).child("turnStartTime").once("value", function(timeSnap) {
          if (timeSnap.val()) {
            document.getElementById("timer").textContent = 
              30 - Math.floor((new Date().getTime() + timeOffset - timeSnap.val())/1000);
          } else {
            document.getElementById("timer").textContent = '30';
            firebase.child("storyContent").child(storyId).child("turnStartTime").set(Firebase.ServerValue.TIMESTAMP);
          }
        });
        setTimeout(decrementTimer, 1000);
      }
      for (entryKey in turnEntries) {
        entries++;
        entryElement = document.getElementById("entry" + entries);
        entryElement.textContent = turnEntries[entryKey].entry;
        entryElement.classList.remove("invisible");
        //console.log("entry added");
        if (!winningEntry || turnEntries[entryKey].entryScore > winningEntry.entryScore) {
          winningEntry = turnEntries[entryKey];
        }
        if (entries === 5) {
          storyInputElement.disabled = true;
          storyInputElement.textContent = '';
          break;
        }
      }
    });

    firebase.child("storyContent").child(storyId).child("entries").on("child_added", function(snapshot, prevChildKey) {
      var entryText = snapshot.val();
      storyTextElement.textContent += entryText.entry + " ";
      console.log("text added to story");
    });
  }

  function decrementTimer() {
    var timerNumber = Number(timer.textContent);
    if (timerNumber > 1) {
      timer.textContent = Number(timer.textContent) - 1;
      setTimeout(decrementTimer, 1000);          
    } else {
      timer.textContent = "";
      selectWinner();
    }
  }

  function selectWinner() {
    var i, entryElement;
    firebase.child("storyContent").child(storyId).child("entries").push(winningEntry);
    firebase.child("storyContent").child(storyId).child("turnStartTime").remove();
    firebase.child("storyContent").child(storyId).child("currentTurn").remove();
    for (i = 1; i <= 5; i++) {
      entryElement = document.getElementById("entry" + i);
      entryElement.textContent = '';
      entryElement.classList.add("invisible");
    }
    turnInProgress = false;
    winningEntry = undefined;
    //entries = 0;
    storyInputElement.disabled = false;
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
    document.getElementById('mainContainer').scrollTop = 0;
  };

})(document);*/
