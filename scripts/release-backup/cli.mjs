import {
  ReleaseBackupError,
  createReleaseBackup,
  inspectSyntheticSource,
  restoreReleaseBackup,
  safeFailureResult,
  verifyReleaseBackup
} from "./core.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function confirmed(name) {
  return process.argv.includes(name);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const command = process.argv[2];

try {
  if (command === "inspect") {
    if (!confirmed("--confirm-synthetic")) throw new ReleaseBackupError("SYNTHETIC_CONFIRMATION_REQUIRED", "Stage 1 inspection requires --confirm-synthetic.");
    print(await inspectSyntheticSource({ database: argument("--database"), storageRoot: argument("--storage-root") }));
  } else if (command === "create") {
    const created = await createReleaseBackup({
      database: argument("--database"),
      storageRoot: argument("--storage-root"),
      output: argument("--output"),
      confirmSynthetic: confirmed("--confirm-synthetic"),
      sourceWasQuiesced: confirmed("--source-quiesced")
    });
    print({ created: true, backupMode: created.manifest.backupMode, backupId: created.manifest.backupId, databaseHashVerified: true, storageHashesVerified: true, sourceUnchanged: created.sourceUnchanged });
  } else if (command === "verify") {
    if (!confirmed("--confirm-synthetic")) throw new ReleaseBackupError("SYNTHETIC_CONFIRMATION_REQUIRED", "Stage 1 verification requires --confirm-synthetic.");
    print((await verifyReleaseBackup({ backupDirectory: argument("--backup") })).result);
  } else if (command === "restore-test") {
    const restored = await restoreReleaseBackup({ backupDirectory: argument("--backup"), target: argument("--target"), confirmSynthetic: confirmed("--confirm-synthetic") });
    print(restored.result);
  } else {
    throw new ReleaseBackupError("UNKNOWN_COMMAND", "Use inspect, create, verify, or restore-test.");
  }
} catch (error) {
  print(safeFailureResult(error));
  process.exitCode = 1;
}
