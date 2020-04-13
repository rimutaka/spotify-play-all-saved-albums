/** A background script that runs in the context of the extension
 * to intercept XHR auth responses and retrieve the security token
 * needed to send requests to Spotify. The token is then passed to
 * the injected content script.
 */
var bearerToken = null; // has the latest token

/** Extract and store auth token details */
function xhrAuthResponseListener(details) {
  let filter = browser.webRequest.filterResponseData(details.requestId);
  let decoder = new TextDecoder("utf-8");
  let encoder = new TextEncoder();

  let data = []; // assemble the response in this array

  // combine multiple response chunks
  filter.ondata = event => {
    data.push(event.data);
  };

  // all response data has arrived
  filter.onstop = event => {
    let str = "";
    if (data.length == 1) {
      str = decoder.decode(data[0]);
    }
    else {
      for (let i = 0; i < data.length; i++) {
        let stream = (i == data.length - 1) ? false : true;
        str += decoder.decode(data[i], { stream });
      }
    }

    // save the token in a global var
    bearerToken = JSON.parse(str);
    // find the tab id with spotify and a message with the token
    let tabsQuery = browser.tabs.query({ url: "https://open.spotify.com/*" });
    tabsQuery.then(sendMessageToTabs, onError);

    // release the server response back to the requester
    filter.write(encoder.encode(str));
    filter.close();
  };
}

// watch for token requests
browser.webRequest.onBeforeRequest.addListener(
  xhrAuthResponseListener,
  { urls: ["https://open.spotify.com/get_access_token*"], types: ["xmlhttprequest"] },
  ["blocking"]
);

/** Log error to console. */
function onError(error) {
  console.error(`Error: ${error}`);
}

/** Send auth token to all matching tabs */
function sendMessageToTabs(tabs) {
  for (let tab of tabs) {
    browser.tabs.sendMessage(tab.id, bearerToken).catch(onError);
  }
}

/** Activate content script on the target page */
function handleUpdated(tabId, changeInfo, tabInfo) {
  if (changeInfo.url) {
    const executing = browser.tabs.executeScript({
      file: "/albums.js",
      allFrames: true
    });
    executing.then(null, onError);
  }
}

// watch for tab url changes to load our content script
browser.tabs.onUpdated.addListener(handleUpdated, { "urls": ["https://open.spotify.com/playlist/*"] });