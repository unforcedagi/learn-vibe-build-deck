// Accounts API for the class site — a Cloudflare Worker on the same
// registrable domain (learnvibe.build), so the session cookie it sets
// (Domain=.learnvibe.build, SameSite=Lax) rides along on credentialed
// fetches from cu.learnvibe.build. Worker source lives in worker/.
export const API_BASE = 'https://api.learnvibe.build';
