/** A content script to execute on PLAYLIST page.
 * It adds a button to start building a playlist with all saved albums.
 * It is loaded by a background script on URL change.
 */

// Grab an anchor element from DOM to add our button next to.
newReleasesButton = document.querySelector(anchorElementSelector);

// the anchor may not be there yet
if (!newReleasesButton) {
  // watch the entire document until we spot the anchor
  bodyObserver.observe(document.body, mutationObserverOptions);
}
else {
  // the anchor is there - add our button
  addActionButton();
}



