import {afterAll, afterEach, beforeEach, describe, expect, it, jest, test} from '@jest/globals'
import { context } from '@actions/github';

const defaultTaskTypes = JSON.stringify(["feat","fix","docs","test","ci","refactor","perf","chore","revert"]);

const getInputReturnMap = new Map();

const mockSetFailed = jest.fn();

const repo = {
    owner: "testOwner",
    repo: "testRepo",
}
jest.unstable_mockModule('@actions/core', () => ({
    getInput: jest.fn().mockImplementation((name) => getInputReturnMap.get(name)),
    setFailed: mockSetFailed,
}));

const octokitMocks= {
    'listLabelsOnIssue': jest.fn(),
    'removeLabel': jest.fn(),
    'getLabel': jest.fn(),
    'createLabel': jest.fn(),
    'addLabels': jest.fn()
}


const octokit = {
    rest: {
        issues: {
            listLabelsOnIssue: octokitMocks.listLabelsOnIssue,
            removeLabel: octokitMocks.removeLabel,
            getLabel: octokitMocks.getLabel,
            createLabel: octokitMocks.createLabel,
            addLabels: octokitMocks.addLabels,
        }
    }
}

jest.unstable_mockModule('@actions/github', () => ({
    getOctokit: jest.fn().mockImplementation(() => octokit),
    context: context,
}));

const { setFailed } = await import('@actions/core');
const { visibleForTesting } = await import('./conventionalCommits.js');
const { checkConventionalCommits, checkTicketNumber, applyLabel } = visibleForTesting;

let logMock;

beforeEach(() => {
    getInputReturnMap.set('task_types', defaultTaskTypes);

    logMock = jest.spyOn(console, 'log');
    logMock.mockImplementation(() => {});
});

afterEach(() => {
    logMock.mockRestore();
    mockSetFailed.mockReset();
    for (let key in octokitMocks) {
        octokitMocks[key].mockReset();
    }
});

afterAll(() => {
    jest.resetAllMocks();
})

// Test cases from conventional commits examples (https://www.conventionalcommits.org/en/v1.0.0/)
describe('checkConventionalCommits', () => {

    test('Commit message with description and breaking change footer', async () => {
        context.payload = {
            "pull_request": {
                "title": "feat: allow provided config object to extend other configs",
                "body": "BREAKING CHANGE: `extends` key in config file is now used for extending other config files",
            }
        }

        const result = await checkConventionalCommits();

        expect(setFailed).not.toBeCalled();
        expect(result).toEqual({
            type: "feat",
            scope: "",
            breaking: true,
        });
    })

    test('Commit message with ! to draw attention to breaking change', async () => {
        context.payload = {
            "pull_request": {
                "title": "feat!: send an email to the customer when a product is shipped",
            }
        }

        const result = await checkConventionalCommits();

        expect(setFailed).not.toBeCalled();
        expect(result).toEqual({
            type: "feat",
            scope: "",
            breaking: true,
        });
    })

    test('Commit message with scope and ! to draw attention to breaking change', async () => {
        context.payload = {
            "pull_request": {
                "title": "feat(api)!: send an email to the customer when a product is shipped",
            }
        }

        const result = await checkConventionalCommits();

        expect(setFailed).not.toBeCalled();
        expect(result).toEqual({
            type: "feat",
            scope: "api",
            breaking: true,
        });
    })

    test('Commit message with both ! and BREAKING CHANGE footer', async () => {
        context.payload = {
            "pull_request": {
                "title": "chore!: drop support for Node 6",
                "body": "BREAKING CHANGE: use JavaScript features not available in Node 6."
            }
        }

        const result = await checkConventionalCommits();

        expect(setFailed).not.toBeCalled();
        expect(result).toEqual({
            type: "chore",
            scope: "",
            breaking: true,
        });
    })

    test('commit message with no body', async () => {
        context.payload = {
            "pull_request": {
                "title": "docs: correct spelling of CHANGELOG"
            }
        }

        const result = await checkConventionalCommits();

        expect(setFailed).not.toBeCalled();
        expect(result).toEqual({
            type: "docs",
            scope: "",
            breaking: false,
        });
    })

    test('Commit message with scope', async () => {
        context.payload = {
            "pull_request": {
                "title": "feat(lang): add Polish language"
            }
        }

        const result = await checkConventionalCommits();

        expect(setFailed).not.toBeCalled();
        expect(result).toEqual({
            type: "feat",
            scope: "lang",
            breaking: false,
        });
    })

    test('Commit message with multi-paragraph body and multiple footers', async () => {
        context.payload = {
            "pull_request": {
                "title": "fix: prevent racing of requests",
                "body": "Introduce a request id and a reference to latest request. Dismiss\n" +
                    "incoming responses other than from latest request.\n" +
                    "\n" +
                    "Remove timeouts which were used to mitigate the racing issue but are\n" +
                    "obsolete now.\n" +
                    "\n" +
                    "Reviewed-by: Z\n" +
                    "Refs: #123"
            }
        }

        const result = await checkConventionalCommits();

        expect(setFailed).not.toBeCalled();
        expect(result).toEqual({
            type: "fix",
            scope: "",
            breaking: false,
        });
    })

    test('Invalid commit message', async () => {
        context.payload = {
            "pull_request": {
                "title": "hit it with a hammer"
            }
        }

        await checkConventionalCommits();
        expect(setFailed).toBeCalledTimes(1);
        expect(setFailed.mock.lastCall.at(0).startsWith('Malformed pull request title')).toBeTruthy();
    })

    test('Missing task_types input', async () => {
        getInputReturnMap.set('task_types', null);

        await checkConventionalCommits();
        expect(setFailed).toBeCalledTimes(1);
        expect(setFailed.mock.lastCall.at(0).startsWith('Missing required input')).toBeTruthy();
    })

    test('Invalid task_types', async () => {
        getInputReturnMap.set('task_types', 'invalid JSON');

        await checkConventionalCommits();
        expect(setFailed).toBeCalledTimes(1);
        expect(setFailed.mock.lastCall.at(0).startsWith('Invalid task_types input')).toBeTruthy();
    })
})

describe('checkTicketNumber', () => {
    it('should pass when no regex is preset', async () => {
        getInputReturnMap.set('ticket_key_regex', null);

        await checkTicketNumber();
        expect(setFailed).not.toBeCalled();
    })

    it('should fail when ticket number is missing or invalid', async () => {
        getInputReturnMap.set('ticket_key_regex', '\\d+');

        context.payload = {
            pull_request: { title: 'no number here' }
        };

        await checkTicketNumber();
        expect(setFailed).toHaveBeenCalledWith('Invalid or missing task number: \'\'. Must match: \\d+');
    })

    it('should pass when ticket number is present', async () => {
        getInputReturnMap.set('ticket_key_regex', '\\d+');

        context.payload = {
            pull_request: { title: 'number here: 1234' }
        };

        await checkTicketNumber();
        expect(setFailed).not.toBeCalled();
    })
});

describe('applyLabel', () => {
    it('should skip label addition if add_label is set to false', async () => {
        getInputReturnMap.set('add_label', 'false')

        await applyLabel( {});

        expect(setFailed).not.toHaveBeenCalled();
    });

    it('should fail if custom_labels input is invalid JSON', async () => {
        getInputReturnMap.set('add_label', 'true')
        getInputReturnMap.set('custom_labels', 'invalid JSON');

        await applyLabel({});

        expect(setFailed).toHaveBeenCalledWith('Invalid custom_labels input. Unable to parse JSON.');
    });

    it('should remove all existing labels and add new labels', async () => {
        getInputReturnMap.set('add_label', 'true');
        getInputReturnMap.set('custom_labels', '');

        // getInput.mockReturnValue('myToken');
        // context.repo = { owner: 'myOwner', repo: 'myRepo' };
        context.payload = {
            "pull_request": { number: 123 },
        }

        octokit.rest.issues.listLabelsOnIssue.mockResolvedValue({ data: [{ name: 'chore' }] });
        octokit.rest.issues.getLabel.mockRejectedValue(new Error());

        // const pr = { number: 123 };
        // const cc = { type: 'myType', breaking: false };
        // const customLabels = {};

        let commitDetail = {
            type: "feat",
            scope: "",
            breaking: false
        }

        await applyLabel(repo, commitDetail);

        expect(octokit.rest.issues.removeLabel).toHaveBeenCalledWith({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: 123,
            name: 'chore'
        });

        expect(octokit.rest.issues.createLabel).toHaveBeenCalledWith({
            owner: repo.owner,
            repo: repo.repo,
            name: commitDetail.type,
            color: expect.any(String)
        });

        expect(octokit.rest.issues.addLabels).toHaveBeenCalledWith({
            owner: repo.owner,
            repo: repo.repo,
            issue_number: 123,
            labels: [commitDetail.type]
        });
    });
});

