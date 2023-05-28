const core = require('@actions/core');
const github = require('@actions/github');
const { parser } = require('@conventional-commits/parser');

async function run() {
    let taskTypes = core.getInput('task_types') || 'feat|fix|docs|test|ci|refactor|perf|chore|revert';
    taskTypes = taskTypes.split('|');
    const token = core.getInput('token');
    const octokit = github.getOctokit(token);
    const jiraKeyRegex = core.getInput('jira_key_regex');

    const { pull_request: pr } = github.context.payload;

    // Extract the task type and task number from the PR title
    const [_, taskType, taskNumber] = pr.title.match(/(\w+)(:\s\w+-\d+)?/) || [];

    if (!taskType || !taskTypes.includes(taskType)) {
        core.setFailed(`Invalid or missing task type: '${taskType}'. Must be one of: ${taskTypes.join(', ')}`);
        return;
    }

    if (jiraKeyRegex) {
        if (!taskNumber || !new RegExp(jiraKeyRegex).test(taskNumber)) {
            core.setFailed(`Invalid or missing JIRA issue key: '${taskNumber}'. Must match: ${jiraKeyRegex}`);
            return;
        }
    }

    // Add a label to the PR based on the task type
    await octokit.rest.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pr.number,
        labels: [taskType],
    });
}

run().catch(err => core.setFailed(err.message));
