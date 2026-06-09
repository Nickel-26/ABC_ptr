const prisma = require('../src/db');
const leetcode = require('../src/services/leetcode');

async function syncAllLeetCodeProblems() {
    console.log('Starting LeetCode problem metadata sync...');
    
    const limit = 100;
    let skip = 0;
    let totalFetched = 0;
    let totalLength = 1;

    try {
        while (skip < totalLength) {
            console.log(`Fetching batch: skip ${skip}, limit ${limit}`);
            const data = await leetcode.getProblemsetQuestions({ limit, skip });
            
            if (!data || !data.questions) {
                console.error('Invalid data received from LeetCode. Aborting.');
                break;
            }

            totalLength = data.totalLength;
            const questions = data.questions;

            for (const q of questions) {
                const problemId = q.titleSlug;
                const platform = 'LEETCODE';

                // Upsert problem
                const problem = await prisma.problem.upsert({
                    where: { platform_problemId: { platform, problemId } },
                    update: {
                        name: q.title,
                        difficulty: q.difficulty,
                        url: `https://leetcode.com/problems/${q.titleSlug}/`
                    },
                    create: {
                        platform,
                        problemId,
                        name: q.title,
                        difficulty: q.difficulty,
                        url: `https://leetcode.com/problems/${q.titleSlug}/`
                    }
                });

                // Upsert tags
                if (q.topicTags && q.topicTags.length > 0) {
                    for (const t of q.topicTags) {
                        let tag = await prisma.tag.findUnique({ where: { name: t.name } });
                        if (!tag) {
                            tag = await prisma.tag.create({ data: { name: t.name } });
                        }

                        // Link problem to tag
                        await prisma.problemTag.upsert({
                            where: {
                                problemId_tagId: {
                                    problemId: problem.id,
                                    tagId: tag.id
                                }
                            },
                            update: {},
                            create: {
                                problemId: problem.id,
                                tagId: tag.id
                            }
                        });
                    }
                }
            }

            totalFetched += questions.length;
            skip += limit;

            // Small delay to prevent rate-limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`Successfully synced ${totalFetched} LeetCode problems.`);
    } catch (error) {
        console.error('Error during LeetCode sync:', error);
    } finally {
        await prisma.$disconnect();
    }
}

syncAllLeetCodeProblems();
