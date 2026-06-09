const axios = require('axios');

const LC_GRAPHQL_URL = 'https://leetcode.com/graphql';
const lcClient = axios.create({
  baseURL: 'https://leetcode.com',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'cp-dashboard/1.0',
    Referer: 'https://leetcode.com/problemset/'
  }
});

async function getUserStats(username) {
  const query = `
    query userSessionProgress($username: String!) {
      allQuestionsCount {
        difficulty
        count
      }
      matchedUser(username: $username) {
        submitStats {
          acSubmissionNum {
            difficulty
            count
            submissions
          }
        }
      }
    }
  `;

  try {
    const response = await lcClient.post('/graphql', {
      query,
      variables: { username }
    });

    if (response.data.errors) {
      throw new Error(`LeetCode API Error: ${response.data.errors[0].message}`);
    }

    const data = response.data.data;
    if (!data.matchedUser) {
        throw new Error('User not found on LeetCode');
    }

    const acStats = data.matchedUser.submitStats.acSubmissionNum;
    
    let stats = {
      total: 0,
      easy: 0,
      medium: 0,
      hard: 0
    };

    for (const stat of acStats) {
      if (stat.difficulty === 'All') stats.total = stat.count;
      if (stat.difficulty === 'Easy') stats.easy = stat.count;
      if (stat.difficulty === 'Medium') stats.medium = stat.count;
      if (stat.difficulty === 'Hard') stats.hard = stat.count;
    }

    return stats;
  } catch (error) {
    console.error('Error fetching LeetCode stats:', error.message);
    throw error;
  }
}

async function getRecentSubmissions(username) {
    const query = `
      query recentAcSubmissions($username: String!, $limit: Int!) {
        recentAcSubmissionList(username: $username, limit: $limit) {
          id
          title
          titleSlug
          timestamp
        }
      }
    `;

    try {
        const response = await lcClient.post('/graphql', {
            query,
            variables: { username, limit: 100 }
        });

        if (response.data.errors) {
            throw new Error(`LeetCode API Error: ${response.data.errors[0].message}`);
        }

        return response.data.data.recentAcSubmissionList || [];
    } catch (error) {
        console.error('Error fetching LeetCode submissions:', error.message);
        throw error;
    }
}

async function getAllAcceptedProblems(lcSession) {
    if (!lcSession) return [];

    try {
        const response = await lcClient.get('/api/problems/all/', {
            headers: {
                Cookie: `LEETCODE_SESSION=${lcSession}`
            }
        });

        return (response.data.stat_status_pairs || [])
            .filter(problem => problem.status === 'ac')
            .map(problem => ({
                id: String(problem.stat.question_id),
                title: problem.stat.question__title,
                titleSlug: problem.stat.question__title_slug,
                timestamp: '0'
            }));
    } catch (error) {
        console.error('Error fetching all accepted LeetCode problems:', error.message);
        throw error;
    }
}

async function getProblemsetQuestions({ limit = 100, skip = 0 } = {}) {
  const query = `
    query problemsetQuestionList($categorySlug: String!, $limit: Int!, $skip: Int!, $filters: QuestionFilterInput) {
      problemsetQuestionListV2(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
        totalLength
        questions {
          questionFrontendId
          title
          titleSlug
          difficulty
          acRate
          topicTags {
            name
            slug
          }
        }
      }
    }
  `;

  const response = await lcClient.post('/graphql', {
    query,
    variables: {
      categorySlug: 'all-code-essentials',
      limit,
      skip,
      filters: null
    }
  });

  if (response.data.errors) {
    throw new Error(`LeetCode API Error: ${response.data.errors[0].message}`);
  }

  return response.data.data.problemsetQuestionListV2;
}


module.exports = {
  getUserStats,
  getRecentSubmissions,
  getAllAcceptedProblems,
  getProblemsetQuestions
};
