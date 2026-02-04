import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getInput, setFailed } from '@actions/core';
import { getOctokit, context } from '@actions/github';

vi.mock('@actions/core');
vi.mock('@actions/github');

// Dynamic import for the module under test (after mocks are set up)
const myModule = await import('./index.js');

beforeEach(() => {
    vi.resetAllMocks();
});

let logMock;
beforeEach(() => {
    logMock = vi.spyOn(console, 'log');
    logMock.mockImplementation(() => {});
});

afterEach(() => {
    logMock.mockRestore();
});

describe('checkConventionalCommits', () => {

    it('should succeed when a valid task type is provided', async () => {
        getInput.mockReturnValue(JSON.stringify(['feat', 'fix']));
        context.payload = {
            pull_request: { title: 'feat(login): add new login feature' }
        };

        const commitDetail = await myModule.checkConventionalCommits();

        expect(setFailed).not.toHaveBeenCalled();
        expect(commitDetail).toEqual({
            type: 'feat',
            scope: 'login',
            breaking: false
        });
    });

    it('should succeed when a valid task type is provided and breaking change', async () => {
        getInput.mockReturnValue(JSON.stringify(['feat', 'fix']));
        context.payload = {
            pull_request: { title: 'feat(login)!: add new login feature' }
        };

        const commitDetail = await myModule.checkConventionalCommits();

        expect(setFailed).not.toHaveBeenCalled();
        expect(commitDetail).toEqual({
            type: 'feat',
            scope: 'login',
            breaking: true
        });
    });

    it('should fail when task_types input is missing', async () => {
        getInput.mockReturnValue('');
        await myModule.checkConventionalCommits();
        expect(setFailed).toHaveBeenCalledWith('Missing required input: task_types');
    });

    it('should fail when task_types input is invalid JSON', async () => {
        getInput.mockReturnValue('invalid JSON');
        await myModule.checkConventionalCommits();
        expect(setFailed).toHaveBeenCalledWith('Invalid task_types input. Expecting a JSON array.');
    });
});

describe('checkTicketNumber', () => {
    it('should fail when ticket number is missing or invalid', async () => {
        getInput.mockReturnValue('\\d+');
        context.payload = {
            pull_request: { title: 'no number here' }
        };
        await myModule.checkTicketNumber();
        expect(setFailed).toHaveBeenCalledWith('Invalid or missing task number: \'\'. Must match: \\d+');
    });
});

describe('applyLabel', () => {
    beforeEach(() => {
        // Mock the context.repo getter to provide owner and repo values
        vi.spyOn(context, 'repo', 'get').mockReturnValue({
            owner: 'mockOwner',
            repo: 'mockRepo',
        });
    });

    it('should skip label addition if add_label is set to false', async () => {
        getInput.mockReturnValue('false');
        await myModule.applyLabel({}, {});
        expect(setFailed).not.toHaveBeenCalled();
    });

    it('should fail if custom_labels input is invalid JSON', async () => {
        getInput.mockReturnValueOnce('true').mockReturnValueOnce('invalid JSON');
        await myModule.applyLabel({}, {});
        expect(setFailed).toHaveBeenCalledWith('Invalid custom_labels input. Unable to parse JSON.');
    });

    it('should remove existing labels that are in the managed list but not in the new labels', async () => {
        const mockOctokit = {
            rest: {
                issues: {
                    listLabelsOnIssue: vi.fn().mockResolvedValue({
                        data: [
                            { name: 'feat' },
                            { name: 'fix' },
                            { name: 'breaking change' },
                        ],
                    }),
                    removeLabel: vi.fn().mockResolvedValue({}),
                    addLabels: vi.fn().mockResolvedValue({}),
                },
            },
        };
        getInput.mockImplementation((inputName) => {
            if (inputName === 'task_types') {
                return JSON.stringify(['feat', 'fix']);
            }
            if (inputName === 'token') {
                return 'token';
            }
            return undefined;
        });

        getOctokit.mockReturnValue(mockOctokit);
        const pr = {
            number: 123,
        };
        const commitDetail = {
            type: 'fix',
            breaking: false,
        };
        const customLabels = {};

        getInput.mockReturnValueOnce(JSON.stringify(['feat', 'fix'])); // task_types
        getOctokit.mockReturnValue(mockOctokit);

        // Directly call the updateLabels function
        await myModule.updateLabels(pr, commitDetail, customLabels);

        // Assert removeLabel was called for 'feat' and 'breaking change'
        expect(mockOctokit.rest.issues.removeLabel).toHaveBeenCalledWith({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: pr.number,
            name: 'feat',
        });
        expect(mockOctokit.rest.issues.removeLabel).toHaveBeenCalledWith({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: pr.number,
            name: 'breaking change',
        });
    });
});

describe('generateColor', () => {
    it('should return a string', () => {
        expect(typeof myModule.generateColor('test')).toBe('string');
    });

    it('should generate different colors for different inputs', () => {
        const color1 = myModule.generateColor('test1');
        const color2 = myModule.generateColor('test2');
        expect(color1).not.toEqual(color2);
    });

});
