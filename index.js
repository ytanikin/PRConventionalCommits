const { getInput, setFailed } = require('@actions/core');
const { getOctokit, context } = require('@actions/github');
const { toConventionalChangelogFormat } = require('@conventional-commits/parser')


/**
 * Main function to run the whole process.
 */
async function run() {
    const commitDetail = await checkConventionalCommits();
    await checkTicketNumber(commitDetail);
    const pr = context.payload.pull_request;
    await applyLabel(pr, commitDetail);
}


/**
 * Check the conventional commits of the task.
 * Parse the title of the pull request and validate against the task type list.
 * @returns {Promise<Object>} An object with details of the commit: type, scope and whether it's a breaking change.
 */
async function checkConventionalCommits() {
    let taskTypesInput = getInput('task_types');
    if (!taskTypesInput) {
        setFailed('Missing required input: task_types');
        return;
    }
    let taskTypeList;
    try {
        taskTypeList = JSON.parse(taskTypesInput);
    } catch (err) {
        setFailed('Invalid task_types input. Expecting a JSON array.');
        return;
    }
    const notableChange = /^([a-z0-9]+)(\(.+\))?(!)(:)(\s)(.)+$/;

    const pr = context.payload.pull_request;
    const titleAst = toConventionalChangelogFormat(pr.title);
    const cc = {
        type: titleAst.type ? titleAst.type : '',
        scope: titleAst.scope ? titleAst.scope : '',
        breaking: titleAst.notes && titleAst.notes.some(note => note.title === 'BREAKING CHANGE') || notableChange.test(pr.title),
    };
    if (!cc.type || !taskTypeList.includes(cc.type)) {
        setFailed(`Invalid or missing task type: '${cc.type}'. Must be one of: ${taskTypeList.join(', ')}`);
        return;
    }
    return cc;
}

/**
 * Check the ticket number based on the PR title and a provided regex.
 */
async function checkTicketNumber() {
    const ticketKeyRegex = getInput('ticket_key_regex');
    if (ticketKeyRegex) {
        const pr = context.payload.pull_request;
        const taskNumberMatch = pr.title.match(new RegExp(ticketKeyRegex));
        const taskNumber = taskNumberMatch ? taskNumberMatch[0] : '';
        if (!taskNumber) {
            setFailed(`Invalid or missing task number: '${taskNumber}'. Must match: ${ticketKeyRegex}`);
        }
    }
}
/**
 * Apply labels to the pull request based on the details of the commit and any custom labels provided.
 * @param {Object} pr The pull request object.
 * @param {Object} commitDetail The object with details of the commit.
 */
async function applyLabel(pr, commitDetail) {
    const addLabel = getInput('add_label');
    if (addLabel !== undefined && addLabel.toLowerCase() === 'false') {
        console.log('Skipping label addition as add_label is set to false.');
        return;
    }
    const customLabelsInput = getInput('custom_labels');
    let customLabels = {};
    if (customLabelsInput) {
        try {
            customLabels = JSON.parse(customLabelsInput);
            // Validate that customLabels is an object and all its keys and values are strings
            if (typeof customLabels !== 'object' || Array.isArray(customLabels) || Object.entries(customLabels).some(([k, v]) => typeof k !== 'string' || typeof v !== 'string')) {
                setFailed('Invalid custom_labels input. Expecting a JSON object with string keys and values.');
                return;
            }
        } catch (err) {
            setFailed('Invalid custom_labels input. Unable to parse JSON.');
            return;
        }
    }
    await updateLabels(pr, commitDetail, customLabels);
}

/**
 * Update labels on the pull request.
 */
async function updateLabels(pr, cc, customLabels) {
    const token = getInput('token');
    const octokit = getOctokit(token);
    const currentLabels = await octokit.rest.issues.listLabelsOnIssue({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pr.number
    });

    const labelNames = currentLabels.data.map(label => label.name);
    let newLabels = [customLabels[cc.type] ? customLabels[cc.type] : cc.type];

    const breakingChange = 'breaking change';
    if (cc.breaking) {
        newLabels.push(customLabels[breakingChange] ? customLabels[breakingChange] : breakingChange);
    }

    let needToUpdate = newLabels.some(label => !labelNames.includes(label));

    if (needToUpdate) {
        // remove all existing labels
        for (let label of currentLabels.data) {
            await octokit.rest.issues.removeLabel({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: pr.number,
                name: label.name
            });
        }

        // ensure new labels exist with the desired color
        for (let label of newLabels) {
            let currentLabel;
            try {
                currentLabel = await octokit.rest.issues.getLabel({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    name: label
                });
            } catch (err) {
                currentLabel = null;
            }

            let color = generateColor(label);
            if (!currentLabel || currentLabel.data.color === '#ffffff') {
                await octokit.rest.issues.createLabel({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    name: label,
                    color: color
                });
            }
        }

        // add new labels
        await octokit.rest.issues.addLabels({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: pr.number,
            labels: newLabels,
        });
    }
}

/**
 * Generates a color based on the string input.
 */
function generateColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    let color = '';
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }

    return color;
}

run().catch(err => setFailed(err.message));

module.exports = {
    run,
    checkConventionalCommits,
    checkTicketNumber,
    applyLabel,
    updateLabels,
    generateColor
};
