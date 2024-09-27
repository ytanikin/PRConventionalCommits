const { getInput, setFailed } = require('@actions/core');
const { getOctokit, context } = require('@actions/github');
const toConventionalChangelogFormat = require('conventional-commits-parser');

jest.mock('@actions/core');
jest.mock('@actions/github');

const myModule = require('./index');

beforeEach(() => {
    jest.resetAllMocks();
});
let logMock;
beforeEach(() => {
    logMock = jest.spyOn(console, 'log');
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

    xit('should succeed when a valid task type is provided and breaking change', async () => {
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
