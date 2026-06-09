const fs = require('fs');
const path = require('path');
const prisma = require('../src/db');

async function applyRatings() {
    console.log('Loading lc_to_cf_rating.json...');
    const jsonPath = path.resolve(__dirname, '../../ml/lc_to_cf_rating.json');
    let rawData;
    try {
        rawData = fs.readFileSync(jsonPath, 'utf-8');
    } catch (e) {
        console.error('Failed to read lc_to_cf_rating.json:', e);
        process.exit(1);
    }

    const mapping = JSON.parse(rawData);
    
    // Create a fast lookup map for TitleSlug -> Rounded Rating
    const ratingMap = new Map();
    for (const item of mapping) {
        if (item.TitleSlug && typeof item.Rating === 'number') {
            ratingMap.set(item.TitleSlug, Math.round(item.Rating));
        }
    }

    console.log(`Loaded ${ratingMap.size} ratings from JSON.`);

    // Fetch all LeetCode problems from database
    const lcProblems = await prisma.problem.findMany({
        where: { platform: 'LEETCODE' }
    });

    console.log(`Found ${lcProblems.length} LeetCode problems in the database.`);

    let updateCount = 0;
    
    // Process updates
    for (const problem of lcProblems) {
        const rating = ratingMap.get(problem.problemId); // problemId holds the titleSlug for LeetCode
        
        if (rating !== undefined && problem.rating !== rating) {
            await prisma.problem.update({
                where: { id: problem.id },
                data: { rating }
            });
            updateCount++;
            if (updateCount % 100 === 0) {
                console.log(`Updated ${updateCount} ratings...`);
            }
        }
    }

    console.log(`Finished! Successfully updated ${updateCount} problem ratings.`);
    await prisma.$disconnect();
}

applyRatings().catch(console.error);
