/**
 * Test suite for duplicate-issue.js script
 * Run with: node tests/duplicate-issue.test.js
 */

const script = require('../.github/scripts/duplicate-issue.js');

// Test framework (simple assertions)
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        testsPassed++;
        console.log(`✓ ${message}`);
    } else {
        testsFailed++;
        console.error(`✗ ${message}`);
    }
}

function assertEquals(actual, expected, message) {
    const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
    if (isEqual) {
        testsPassed++;
        console.log(`✓ ${message}`);
    } else {
        testsFailed++;
        console.error(`✗ ${message}`);
        console.error(`  Expected: ${JSON.stringify(expected)}`);
        console.error(`  Actual:   ${JSON.stringify(actual)}`);
    }
}

function assertNull(value, message) {
    if (value === null) {
        testsPassed++;
        console.log(`✓ ${message}`);
    } else {
        testsFailed++;
        console.error(`✗ ${message}`);
        console.error(`  Expected: null`);
        console.error(`  Actual:   ${JSON.stringify(value)}`);
    }
}

console.log('=== Testing parseSemver ===\n');

// Test parseSemver with various formats
assertEquals(
    script.parseSemver('1.2.3'),
    { major: 1, minor: 2, patch: 3, original: '1.2.3' },
    'parseSemver with full version'
);

assertEquals(
    script.parseSemver('v1.2.3'),
    { major: 1, minor: 2, patch: 3, original: 'v1.2.3' },
    'parseSemver with v prefix'
);

assertEquals(
    script.parseSemver('2.1'),
    { major: 2, minor: 1, patch: null, original: '2.1' },
    'parseSemver with major.minor only'
);

assertEquals(
    script.parseSemver('3'),
    { major: 3, minor: null, patch: null, original: '3' },
    'parseSemver with major only'
);

assertNull(
    script.parseSemver('invalid'),
    'parseSemver with invalid version returns null'
);

assertNull(
    script.parseSemver('v1.2.3.4'),
    'parseSemver with too many components returns null'
);

console.log('\n=== Testing formatMilestone ===\n');

assertEquals(
    script.formatMilestone(1, 2, 3),
    '1.2.3',
    'formatMilestone with all components'
);

assertEquals(
    script.formatMilestone(2, 0, 0),
    '2.0.0',
    'formatMilestone with zeros'
);

console.log('\n=== Testing milestoneMatchesVersion ===\n');

// Create mock milestone objects
const milestone_1_2_3 = { title: '1.2.3', state: 'open' };
const milestone_1_2_5 = { title: '1.2.5', state: 'open' };
const milestone_1_3_0 = { title: '1.3.0', state: 'open' };
const milestone_2_0_0 = { title: '2.0.0', state: 'open' };

assert(
    script.milestoneMatchesVersion(milestone_1_2_3, '1'),
    'milestone 1.2.3 matches version 1'
);

assert(
    script.milestoneMatchesVersion(milestone_1_2_3, '1.2'),
    'milestone 1.2.3 matches version 1.2'
);

assert(
    script.milestoneMatchesVersion(milestone_1_2_3, '1.2.3'),
    'milestone 1.2.3 matches version 1.2.3 exactly'
);

assert(
    !script.milestoneMatchesVersion(milestone_1_2_3, '2'),
    'milestone 1.2.3 does not match version 2'
);

assert(
    !script.milestoneMatchesVersion(milestone_1_2_3, '1.3'),
    'milestone 1.2.3 does not match version 1.3'
);

assert(
    !script.milestoneMatchesVersion(milestone_1_2_3, '1.2.5'),
    'milestone 1.2.3 does not match version 1.2.5 (exact patch mismatch)'
);

console.log('\n=== Testing findLatestMilestone ===\n');

const testMilestones = [
    { title: '1.0.0', state: 'closed', number: 1 },
    { title: '1.0.1', state: 'closed', number: 2 },
    { title: '1.1.0', state: 'open', number: 3 },
    { title: '1.1.1', state: 'open', number: 4 },
    { title: '1.2.0', state: 'open', number: 5 },
    { title: '2.0.0', state: 'open', number: 6 },
    { title: '2.0.1', state: 'closed', number: 7 },
    { title: '2.1.0', state: 'open', number: 8 },
    { title: '3.0.0', state: 'closed', number: 9 },
];

let result = script.findLatestMilestone(testMilestones, '1', true);
assertEquals(
    result ? result.title : null,
    '1.2.0',
    'findLatestMilestone for version 1 (open only) returns 1.2.0'
);

result = script.findLatestMilestone(testMilestones, '1.1', true);
assertEquals(
    result ? result.title : null,
    '1.1.1',
    'findLatestMilestone for version 1.1 (open only) returns 1.1.1'
);

result = script.findLatestMilestone(testMilestones, '2', true);
assertEquals(
    result ? result.title : null,
    '2.1.0',
    'findLatestMilestone for version 2 (open only) returns 2.1.0'
);

result = script.findLatestMilestone(testMilestones, '3', true);
assertNull(
    result,
    'findLatestMilestone for version 3 (open only) returns null'
);

result = script.findLatestMilestone(testMilestones, '3', false);
assertEquals(
    result ? result.title : null,
    '3.0.0',
    'findLatestMilestone for version 3 (any state) returns 3.0.0'
);

result = script.findLatestMilestone(testMilestones, '1', false);
assertEquals(
    result ? result.title : null,
    '1.2.0',
    'findLatestMilestone for version 1 (any state) returns 1.2.0 (latest overall)'
);

console.log('\n=== Testing determineNextVersion ===\n');

assertEquals(
    script.determineNextVersion(testMilestones, '1'),
    '1.2.1',
    'determineNextVersion for version 1 returns 1.2.1 (increments latest)'
);

assertEquals(
    script.determineNextVersion(testMilestones, '2'),
    '2.1.1',
    'determineNextVersion for version 2 returns 2.1.1 (increments latest)'
);

assertEquals(
    script.determineNextVersion(testMilestones, '3'),
    '3.0.1',
    'determineNextVersion for version 3 returns 3.0.1 (increments closed milestone)'
);

assertEquals(
    script.determineNextVersion(testMilestones, '4'),
    '4.0.0',
    'determineNextVersion for version 4 (no existing) returns 4.0.0'
);

assertEquals(
    script.determineNextVersion(testMilestones, '1.1'),
    '1.1.2',
    'determineNextVersion for version 1.1 returns 1.1.2'
);

// Test with no matching milestones for a specific minor version
const testMilestones2 = [
    { title: '1.0.0', state: 'closed', number: 1 },
    { title: '1.2.0', state: 'open', number: 2 },
];

assertEquals(
    script.determineNextVersion(testMilestones2, '1.1'),
    '1.1.0',
    'determineNextVersion for version 1.1 (no existing) returns 1.1.0'
);

console.log('\n=== Testing parseComment ===\n');

assertEquals(
    script.parseComment('/duplicate 1,2,3'),
    ['1', '2', '3'],
    'parseComment with simple versions'
);

assertEquals(
    script.parseComment('/duplicate 1.2.3,2.0.0,v3.1.0'),
    ['1.2.3', '2.0.0', 'v3.1.0'],
    'parseComment with full semver versions'
);

assertEquals(
    script.parseComment('/duplicate  1  , 2 ,  3  '),
    ['1', '2', '3'],
    'parseComment handles whitespace correctly'
);

assertEquals(
    script.parseComment('/duplicate 2'),
    ['2'],
    'parseComment with single version'
);

assertNull(
    script.parseComment('duplicate 1,2,3'),
    'parseComment without slash returns null'
);

assertNull(
    script.parseComment('/duplicated 1,2,3'),
    'parseComment with wrong command returns null'
);

assertEquals(
    script.parseComment('Some text\n/duplicate 1,2\nMore text'),
    ['1', '2'],
    'parseComment works in multiline comment'
);

console.log('\n=== Test Summary ===\n');
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);

if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
}
