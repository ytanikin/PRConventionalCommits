import { setFailed } from '@actions/core';
import run from "./conventionalCommits.js";

run().catch(err => setFailed(err.message));
