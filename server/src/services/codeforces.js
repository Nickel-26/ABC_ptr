const axios = require('axios');

const cfClient = axios.create({
  baseURL: 'https://codeforces.com/api',
  timeout: 15000,
  headers: {
    'User-Agent': 'cp-dashboard/1.0'
  }
});

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function fetchWithRetry(method, params = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await cfClient.get(method, { params });
      if (response.data.status === 'OK') {
        return response.data.result;
      }
      throw new Error(`Codeforces API error: ${response.data.comment}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(1000 * (i + 1));
    }
  }
}

async function getUserInfo(handle) {
  const users = await fetchWithRetry('user.info', { handles: handle });
  return users[0];
}

async function getUserRatingHistory(handle) {
  try {
    return await fetchWithRetry('user.rating', { handle });
  } catch (error) {
    if (error.response && error.response.status === 400) {
      return []; // Unrated user
    }
    throw error;
  }
}

async function getUserSubmissions(handle) {
  return await fetchWithRetry('user.status', { handle });
}

async function getProblemset() {
  const result = await fetchWithRetry('problemset.problems');
  return result;
}

module.exports = {
  getUserInfo,
  getUserRatingHistory,
  getUserSubmissions,
  getProblemset,
};
