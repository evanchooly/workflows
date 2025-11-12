# Duplicate Issue Script Tests

This directory contains tests for the GitHub Actions duplicate-issue script.

## Running Tests

```bash
node tests/duplicate-issue.test.js
```

## Test Coverage

The test suite covers:

1. **parseSemver** - Parsing semantic version strings
   - Full versions (1.2.3)
   - Version with v prefix (v1.2.3)
   - Partial versions (1.2, 1)
   - Invalid versions

2. **formatMilestone** - Formatting milestone names from version components

3. **milestoneMatchesVersion** - Version matching logic
   - Exact matches
   - Partial matches (major, major.minor)
   - Mismatch detection

4. **findLatestMilestone** - Finding the latest milestone for a version
   - Open milestones only
   - All milestones (open and closed)
   - Version prefix matching

5. **determineNextVersion** - Calculating next milestone version
   - Incrementing patch version from existing milestones
   - Creating new x.0.0 versions
   - Handling specific minor versions

6. **parseComment** - Parsing /duplicate commands from comments

## Script Behavior

### Version Matching Rules

1. **Exact Match**: If a specification exactly matches an open milestone name, use it
2. **Version Prefix**: If specification is a version (1, 1.2, 1.2.3), find the latest open milestone matching that prefix
3. **Create New**: If no open milestone found, create one based on:
   - Latest closed milestone for that version (increment patch)
   - Or x.0.0 if no milestones exist for that version

### Examples

Given milestones:
- 1.0.0 (closed)
- 1.0.1 (closed)
- 1.1.0 (open)
- 1.1.1 (open)
- 2.0.0 (open)

Commands:
- `/duplicate 1` → Uses 1.1.1 (latest open for v1)
- `/duplicate 1.0` → Creates 1.0.2 (no open 1.0.x, increments from 1.0.1)
- `/duplicate 1.1` → Uses 1.1.1 (latest open for v1.1)
- `/duplicate 2` → Uses 2.0.0 (latest open for v2)
- `/duplicate 3` → Creates 3.0.0 (no milestones for v3)
- `/duplicate 1.1.1` → Uses 1.1.1 (exact match)
