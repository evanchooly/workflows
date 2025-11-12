/**
 * GitHub Action script to duplicate issues across multiple milestones
 * Triggered by issue comments starting with "/duplicate"
 * Supports version-based matching and automatic milestone creation
 */

module.exports = async ({github, context, core}) => {
    const comment = context.payload.comment.body;
    const issueNumber = context.payload.issue.number;
    const commenterLogin = context.payload.comment.user.login;

    console.log(`Processing comment from ${commenterLogin}: "${comment}"`);

    try {
        // Parse the comment to extract version/milestone specifications
        const specifications = parseComment(comment);
        if (!specifications) {
            await postErrorComment(github, context, issueNumber,
                '❌ Invalid format. Please use: `/duplicate version1,version2,milestone`\n\nExamples:\n- `/duplicate 2,3,4` (finds/creates latest milestones for major versions)\n- `/duplicate 2.1,3.0` (finds/creates latest milestones for minor versions)\n- `/duplicate v2.0.0` (exact milestone match or creates if not found)');
            return;
        }

        if (specifications.length === 0) {
            await postErrorComment(github, context, issueNumber,
                '❌ No versions or milestones specified. Please provide at least one.');
            return;
        }

        console.log(`Duplicating issue #${issueNumber} for: ${specifications.join(', ')}`);

        // Get original issue
        const originalIssue = await getOriginalIssue(github, context, issueNumber);
        console.log(`Original issue: "${originalIssue.title}"`);

        // Get all milestones (both open and closed)
        const allMilestones = await getAllMilestones(github, context);
        console.log(`Found ${allMilestones.length} total milestones`);

        // Resolve specifications to actual milestone names
        const resolvedMilestones = await resolveSpecifications(
            github,
            context,
            specifications,
            allMilestones
        );

        // Create duplicate issues
        const results = await createDuplicateIssues(
            github,
            context,
            originalIssue,
            resolvedMilestones,
            issueNumber
        );

        // Post summary comment
        await postSummaryComment(github, context, issueNumber, results, commenterLogin, comment);

        console.log('Done! Posted summary comment.');
    } catch (error) {
        console.error('Error:', error);
        await postErrorComment(github, context, issueNumber,
            `❌ An error occurred while duplicating the issue: ${error.message}`);
    }
};

/**
 * Parse the comment to extract version/milestone specifications
 */
function parseComment(comment) {
    const duplicateMatch = comment.match(/^\/duplicate\s+(.+)$/m);
    if (!duplicateMatch) {
        return null;
    }

    const specificationsStr = duplicateMatch[1].trim();
    return specificationsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Parse a semver version string (supports v1.2.3 or 1.2.3 format)
 */
function parseSemver(version) {
    const match = version.match(/^v?(\d+)(?:\.(\d+)(?:\.(\d+))?)?$/);
    if (!match) {
        return null;
    }

    return {
        major: parseInt(match[1], 10),
        minor: match[2] !== undefined ? parseInt(match[2], 10) : null,
        patch: match[3] !== undefined ? parseInt(match[3], 10) : null,
        original: version
    };
}

/**
 * Format a milestone name from version components
 */
function formatMilestone(major, minor, patch) {
    return `${major}.${minor}.${patch}`;
}

/**
 * Check if a milestone matches a version prefix
 */
function milestoneMatchesVersion(milestone, versionSpec) {
    const milestoneParsed = parseSemver(milestone.title);
    if (!milestoneParsed) {
        return false;
    }

    const specParsed = parseSemver(versionSpec);
    if (!specParsed) {
        return false;
    }

    // Major version must always match
    if (milestoneParsed.major !== specParsed.major) {
        return false;
    }

    // If minor is specified, it must match
    if (specParsed.minor !== null && milestoneParsed.minor !== specParsed.minor) {
        return false;
    }

    // If patch is specified, it must match exactly
    if (specParsed.patch !== null && milestoneParsed.patch !== specParsed.patch) {
        return false;
    }

    return true;
}

/**
 * Find the latest milestone for a given version specification
 */
function findLatestMilestone(milestones, versionSpec, openOnly = true) {
    const candidates = milestones.filter(m => {
        if (openOnly && m.state !== 'open') {
            return false;
        }
        return milestoneMatchesVersion(m, versionSpec);
    });

    if (candidates.length === 0) {
        return null;
    }

    // Sort by semver (descending)
    candidates.sort((a, b) => {
        const aParsed = parseSemver(a.title);
        const bParsed = parseSemver(b.title);

        if (aParsed.major !== bParsed.major) {
            return bParsed.major - aParsed.major;
        }
        if (aParsed.minor !== bParsed.minor) {
            return (bParsed.minor || 0) - (aParsed.minor || 0);
        }
        return (bParsed.patch || 0) - (aParsed.patch || 0);
    });

    return candidates[0];
}

/**
 * Determine the next milestone version based on the latest closed milestone
 */
function determineNextVersion(milestones, versionSpec) {
    const specParsed = parseSemver(versionSpec);
    if (!specParsed) {
        return null;
    }

    // Find the latest milestone (any state) for this version
    const latest = findLatestMilestone(milestones, versionSpec, false);

    if (latest) {
        const latestParsed = parseSemver(latest.title);
        // Increment patch version
        return formatMilestone(
            latestParsed.major,
            latestParsed.minor || 0,
            (latestParsed.patch || 0) + 1
        );
    }

    // No existing milestones for this version spec
    // If minor and/or patch specified, use them; otherwise default to 0
    return formatMilestone(
        specParsed.major,
        specParsed.minor !== null ? specParsed.minor : 0,
        specParsed.patch !== null ? specParsed.patch : 0
    );
}

/**
 * Get the original issue details
 */
async function getOriginalIssue(github, context, issueNumber) {
    const { data: originalIssue } = await github.rest.issues.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNumber
    });
    return originalIssue;
}

/**
 * Get all milestones (both open and closed)
 */
async function getAllMilestones(github, context) {
    const openMilestones = await github.paginate(github.rest.issues.listMilestones, {
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'open'
    });

    const closedMilestones = await github.paginate(github.rest.issues.listMilestones, {
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'closed'
    });

    return [...openMilestones, ...closedMilestones];
}

/**
 * Resolve version specifications to actual milestone objects
 */
async function resolveSpecifications(github, context, specifications, allMilestones) {
    const resolved = [];

    for (const spec of specifications) {
        console.log(`\nResolving specification: "${spec}"`);

        // Check for exact match first
        const exactMatch = allMilestones.find(m => m.title === spec);
        if (exactMatch) {
            if (exactMatch.state === 'open') {
                console.log(`  ✓ Exact match found (open): ${exactMatch.title}`);
                resolved.push({
                    name: exactMatch.title,
                    id: exactMatch.number,
                    created: false
                });
                continue;
            } else {
                console.log(`  ! Exact match found but closed: ${exactMatch.title}`);
                // Continue to version matching logic
            }
        }

        // Try version-based matching
        const latestOpen = findLatestMilestone(allMilestones, spec, true);
        if (latestOpen) {
            console.log(`  ✓ Found latest open milestone: ${latestOpen.title}`);
            resolved.push({
                name: latestOpen.title,
                id: latestOpen.number,
                created: false
            });
            continue;
        }

        // No open milestone, need to create one
        console.log(`  ! No open milestone found, creating new one...`);
        const newVersion = determineNextVersion(allMilestones, spec);
        if (!newVersion) {
            console.log(`  ✗ Invalid version specification: ${spec}`);
            resolved.push({
                name: spec,
                error: `Invalid version specification: ${spec}`
            });
            continue;
        }

        try {
            const { data: newMilestone } = await github.rest.issues.createMilestone({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: newVersion,
                state: 'open'
            });

            console.log(`  ✓ Created new milestone: ${newVersion} (ID: ${newMilestone.number})`);
            resolved.push({
                name: newVersion,
                id: newMilestone.number,
                created: true
            });

            // Add to allMilestones for future resolutions in this run
            allMilestones.push(newMilestone);
        } catch (error) {
            console.log(`  ✗ Failed to create milestone: ${error.message}`);
            resolved.push({
                name: newVersion,
                error: `Failed to create milestone: ${error.message}`
            });
        }
    }

    return resolved;
}

/**
 * Create duplicate issues for each resolved milestone
 */
async function createDuplicateIssues(github, context, originalIssue, resolvedMilestones, issueNumber) {
    const results = [];

    for (const milestone of resolvedMilestones) {
        // Check if resolution had an error
        if (milestone.error) {
            console.log(`⚠️  Skipping due to error: ${milestone.error}`);
            results.push(`❌ ${milestone.error}`);
            continue;
        }

        const newIssueBody = createNewIssueBody(originalIssue, milestone.name, issueNumber);

        try {
            const { data: newIssue } = await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: originalIssue.title,
                body: newIssueBody,
                milestone: milestone.id,
                labels: [ "forward-port" ].concat(originalIssue.labels.map(label => label.name)),
                assignees: originalIssue.assignees.map(assignee => assignee.login)
            });

            const createdTag = milestone.created ? ' (milestone created)' : '';
            console.log(`✓ Created issue #${newIssue.number} for milestone "${milestone.name}"${createdTag}`);
            results.push(`✅ [#${newIssue.number}](${newIssue.html_url}) created for milestone "${milestone.name}"${createdTag}`);
        } catch (error) {
            console.log(`❌ Failed to create issue for milestone "${milestone.name}": ${error.message}`);
            results.push(`❌ Failed to create issue for milestone "${milestone.name}": ${error.message}`);
        }
    }

    return results;
}

/**
 * Create the body text for a new duplicate issue
 */
function createNewIssueBody(originalIssue, milestoneName, issueNumber) {
    return `Duplicate of #${issueNumber} for milestone ${milestoneName}

---

${originalIssue.body || ''}`;
}

/**
 * Post an error comment
 */
async function postErrorComment(github, context, issueNumber, message) {
    await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNumber,
        body: message
    });
}

/**
 * Post the summary comment with results
 */
async function postSummaryComment(github, context, issueNumber, results, commenterLogin, originalComment) {
    const summaryComment = `## Issue Duplication Results

Processed by @${commenterLogin}

${results.join('\n')}

---
*Triggered by comment: \`${originalComment.split('\n')[0]}\`*`;

    await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNumber,
        body: summaryComment
    });
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports.parseSemver = parseSemver;
    module.exports.formatMilestone = formatMilestone;
    module.exports.milestoneMatchesVersion = milestoneMatchesVersion;
    module.exports.findLatestMilestone = findLatestMilestone;
    module.exports.determineNextVersion = determineNextVersion;
    module.exports.parseComment = parseComment;
}