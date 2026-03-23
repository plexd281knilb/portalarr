"use server";

// A random UUID to identify your app to Plex. 
const CLIENT_ID = "portalarr-custom-dashboard-app"; 
const CLIENT_NAME = "Portalarr";

/**
 * Step 1: Request a new PIN from Plex
 */
export async function getPlexPin() {
  const response = await fetch("https://plex.tv/api/v2/pins?strong=true", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "X-Plex-Product": CLIENT_NAME,
      "X-Plex-Client-Identifier": CLIENT_ID,
    },
  });

  if (!response.ok) throw new Error("Failed to get Plex PIN");
  return response.json(); // Returns { id, code }
}

/**
 * Step 2: Check if the user has completed login
 */
export async function checkPlexPin(pinId: number) {
  const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "X-Plex-Client-Identifier": CLIENT_ID,
    },
  });

  if (!response.ok) return null;
  const data = await response.json();
  
  // If the user hasn't logged in yet, authToken will be null
  return data.authToken ? data.authToken : null; 
}

/**
 * Step 3: Validate the token and get the User's Plex Profile
 */
export async function getPlexUser(authToken: string) {
  const response = await fetch("https://plex.tv/api/v2/user", {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "X-Plex-Product": CLIENT_NAME,
      "X-Plex-Client-Identifier": CLIENT_ID,
      "X-Plex-Token": authToken,
    },
  });

  if (!response.ok) throw new Error("Invalid Plex Token");
  return response.json();
}