import { CLEANUP_PHRASE, PREPARE_PHRASE, RESET_PHRASE, build, cleanup, health, inspect, prepare, reset, restart, smoke, start, status, stop } from "./core.mjs";

const command = process.argv[2] ?? "inspect";
const confirmation = process.env.STAGING_CONFIRMATION ?? "";
let result;
if (command === "inspect") result = await inspect();
else if (command === "status") result = await status();
else if (command === "prepare") result = await prepare({ confirmation });
else if (command === "start") result = await start();
else if (command === "build") result = await build();
else if (command === "stop") result = await stop();
else if (command === "restart") result = await restart();
else if (command === "health") result = await health();
else if (command === "reset-synthetic") result = await reset({ confirmation });
else if (command === "smoke") result = await smoke();
else if (command === "cleanup") result = await cleanup({ confirmation });
else throw new Error(`Unknown staging command: ${command}`);
console.log(JSON.stringify(result, null, 2));

if (command === "prepare" && confirmation !== PREPARE_PHRASE) process.exitCode = 1;
if (command === "reset-synthetic" && confirmation !== RESET_PHRASE) process.exitCode = 1;
if (command === "cleanup" && confirmation !== CLEANUP_PHRASE) process.exitCode = 1;
