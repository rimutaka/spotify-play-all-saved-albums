/** This content script has all variable and function definitions
 * and is loaded on every spotify page.
 */

// constants and global vars
const anchorElementSelector = "a[href='/browse/newreleases']";
const actionButtonId = "playAllAlbums";
const mutationObserverOptions = { childList: true, subtree: true };

var bearerToken = null; // holds the latest authorization token

let tracksToSave = []; // list of all track IDs to add to the playlist
let tracksTotal = 0; // number of tracks loaded from all albums
let playlistId = ""; // if of the current playlist
const albumsPerRequest = 50; // limit param in album list request
const maxPlaylistSize = 10000; // max number of tracks in a playlist
const tracksPerRequest = 100; // number of tracks to add per request

let h1Container = null; // H1 message area
let h4Container = null; // H4 message area for progress updates
let newReleasesButton = null; // an anchor in the DOM to insert our button next to

/** Check for addition of new jobs to the page and start monitoring their visibility. */
function addActionButton() {

  // exit if the anchor cannot be found
  if (!newReleasesButton) newReleasesButton = document.querySelector(anchorElementSelector);
  if (!newReleasesButton) return;

  // exit if the button was already added
  const actionButton = document.getElementById(actionButtonId);
  if (actionButton) return;

  // get playlist ID
  const plIdMatch = window.location.href.match(/playlist\/[\d\w]+\b/g);
  if (plIdMatch.length == 0) return;
  playlistId = plIdMatch[0].substring(9);

  // add action button
  const newActionButton = newReleasesButton.cloneNode(true);
  newActionButton.href = "#play-all-albums";
  newActionButton.id = actionButtonId;
  newActionButton.textContent = "Add all saved albums";
  newActionButton.onclick = startLoadingAllAlbums;
  newReleasesButton.parentElement.appendChild(newActionButton);

  // prepare containers for progress update.
  h1Container = newReleasesButton.parentElement.querySelector("h1");
  h4Container = newReleasesButton.parentElement.querySelector("h4");
}

/** Watch for addition of page elements to grab an anchor element. */
const bodyObserver = new MutationObserver((mutations, observer) => {
  if (!newReleasesButton) newReleasesButton = document.querySelector(anchorElementSelector);
  if (newReleasesButton) {
    observer.disconnect(); // no need to watch for changes any more
    addActionButton();
  }
});

/** Initiates loading all albums and adding them to the current playlist. */
function startLoadingAllAlbums() {
  // update the user on progress
  h1Container.textContent = "Adding all saved albums ...";
  h4Container.textContent = "Loading tracks ...";

  // do not allow the processing to be started more than once
  const actionButton = document.getElementById(actionButtonId);
  if (!actionButton) return;
  actionButton.onclick = null;

  // start loading albums
  loadAlbums(0);

}

/** Load all albums from spotify server in chunks. */
function loadAlbums(from = 0) {

  var xhr = new XMLHttpRequest();

  // response handler
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {

      // empty response = error
      if (!xhr.response) {
        h4Container.textContent = "Something went wrong. Refresh the page and try again.";
        console.log("Empty response for list of albums.");
        console.log(`status: ${xhr.status}, status txt: ${xhr.statusText}`);
        return;
      };

      // extract all album track ids with a regex without loading the full json 
      let albumTracks = [...xhr.response.matchAll(/spotify:track:[\d\w]+/g)]

      // no more tracks - go to the next step
      if (albumTracks.length == 0) {
        trimPlaylist();
        return;
      }

      // add new tracks to playlist candidates
      albumTracks.forEach(trackId => {
        if (!tracksToSave.includes(trackId[0])) tracksToSave.push(trackId[0]);
      });

      // report on progress
      h4Container.textContent = `Loading tracks ... ${tracksToSave.length} found`

      // recursive call to continue loading
      loadAlbums(from + albumsPerRequest);

    }
  }

  xhr.open('GET', `https://api.spotify.com/v1/me/albums?offset=${from}&limit=${albumsPerRequest}&market=from_token`, true);
  xhr.setRequestHeader("app-platform", "WebPlayer");
  xhr.setRequestHeader("Referer", "https://open.spotify.com/collection/albums");
  xhr.setRequestHeader("Accept", "application/json");
  xhr.setRequestHeader("Accept-Language", "en");
  //xhr.setRequestHeader("spotify-app-version", "1586564789");
  xhr.setRequestHeader("authorization", `Bearer ${bearerToken.accessToken}`);
  xhr.send();
}

/** Reduce the size of the playlist if needed and initiate adding tracks. */
function trimPlaylist() {

  // save the total number of tracks in the collection
  tracksTotal = tracksToSave.length;

  // trim to max allowed size
  if (tracksToSave.length > maxPlaylistSize) {
    while (tracksToSave.length > maxPlaylistSize) {
      tracksToSave[Math.floor(Math.random() * tracksToSave.length)] = tracksToSave.pop();
    }
  }

  saveTracks(0);

}

/** Start adding tracks to the current playlist in batches */
function saveTracks(from = 0) {

  // prepare a batch
  let to = from + tracksPerRequest;
  if (to > tracksToSave.length) to = tracksToSave.length;
  let params = JSON.stringify({ "uris": tracksToSave.slice(from, to) });

  var xhr = new XMLHttpRequest();

  // response handler
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {

      // something went wrong
      if (xhr.status != 201) {
        h4Container.textContent = "Something went wrong. Delete the playlist and try again.";
        console.log(`status: ${xhr.status}, status txt: ${xhr.statusText}`);
        console.log(xhr.response);
        return;
      }

      // all saved
      if (to == tracksToSave.length) {
        h4Container.textContent = `Added ${to} tracks out of ${tracksTotal}. Refresh the page to see the playlist.`
        return;
      }

      // add more tracks
      h4Container.textContent = `Adding tracks: ${to}`
      saveTracks(to);

    }
  }

  xhr.open('POST', `https://api.spotify.com/v1/playlists/${playlistId}/tracks`, true);
  xhr.setRequestHeader("app-platform", "WebPlayer");
  xhr.setRequestHeader("Referer", `https://open.spotify.com/playlist/${playlistId}`);
  xhr.setRequestHeader("Accept", "application/json");
  xhr.setRequestHeader("Accept-Language", "en");
  //xhr.setRequestHeader("spotify-app-version", "1586564789");
  xhr.setRequestHeader("authorization", `Bearer ${bearerToken.accessToken}`);
  xhr.send(params);
}

// receive an auth token from a background script
browser.runtime.onMessage.addListener(request => {
  if (request && request.accessToken) bearerToken = request;
});

