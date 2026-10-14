import {spawnSync} from "node:child_process";

const windows = process.platform === "win32";
const result = spawnSync(windows ? "py" : "python3", [...(windows ? ["-3"] : []), ...process.argv.slice(2)], {stdio: "inherit"});
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
