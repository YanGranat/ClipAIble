"""Build the pinned Piper TTS Web SDK from its TypeScript source."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unpack(archive, destination):
    destination.mkdir(parents=True)
    with tarfile.open(archive) as source:
        for member in source.getmembers():
            parts = Path(member.name).parts[1:]
            if not parts:
                continue
            if ".." in parts or Path(*parts).is_absolute():
                raise ValueError("Unsafe archive member")
            member.name = Path(*parts).as_posix()
            source.extract(member, destination, filter="data")


def main():
    if sys.version_info < (3, 12):
        raise SystemExit("Python 3.12 or newer is required")
    kit = Path(__file__).resolve().parent
    project = kit.parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path,
                        default=project / "temporary_files/piper-sdk-source-build")
    parser.add_argument("--output-dir", type=Path,
                        help="Copy the verified SDK dist files to this directory")
    options = parser.parse_args()
    node = shutil.which("node")
    if not node:
        raise SystemExit("Node.js 20 or newer is required")
    major = int(subprocess.check_output([node, "--version"], text=True).strip().lstrip("v").split(".")[0])
    if major < 20:
        raise SystemExit("Node.js 20 or newer is required")
    pins = json.loads((kit / "sources.json").read_text(encoding="utf-8"))
    for item in pins["archives"]:
        if checksum(kit / item["file"]) != item["sha256"]:
            raise SystemExit("Source archive checksum mismatch: " + item["file"])
    work = options.work_dir.resolve()
    if work.exists() and any(work.iterdir()):
        raise SystemExit("The work directory must be empty")
    work.mkdir(parents=True, exist_ok=True)
    source = work / "sdk"
    unpack(kit / "piper-tts-web-source.tar.gz", source)
    unpack(kit / "yarn-1.22.22.tgz", work / "yarn")
    config_path = source / "tsconfig.json"
    config = config_path.read_text(encoding="utf-8")
    old = '"lib": ["ES2020", "DOM", "DOM.Iterable","WebWorker"]'
    if config.count(old) != 1:
        raise SystemExit("Unexpected TypeScript library configuration")
    # Array.at is already used by the upstream implementation.
    config_path.write_text(config.replace(old, old.replace("ES2020", "ES2022")), encoding="utf-8")
    environment = os.environ.copy()
    environment.update({"YARN_CACHE_FOLDER": str(work / "yarn-cache"),
                        "NPM_CONFIG_CACHE": str(work / "npm-cache"),
                        "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0",
                        "SOURCE_DATE_EPOCH": "1712016000"})
    commands = [
        [node, str(work / "yarn/bin/yarn.js"), "install", "--frozen-lockfile", "--non-interactive", "--ignore-scripts"],
        [node, "node_modules/typescript/bin/tsc"],
        [node, "node_modules/vite/bin/vite.js", "build"],
    ]
    for command in commands:
        subprocess.run(command, cwd=source, env=environment, check=True)
    expected = json.loads((kit / "artifacts.json").read_text(encoding="utf-8"))
    actual = sorted(file.name for file in (source / "dist").iterdir() if file.is_file())
    if actual != sorted(item["file"] for item in expected):
        raise SystemExit("Unexpected SDK output file set")
    for item in expected:
        path = source / "dist" / item["file"]
        if checksum(path) != item["sha256"]:
            raise SystemExit("SDK output checksum mismatch: " + item["file"])
    if options.output_dir:
        options.output_dir.mkdir(parents=True, exist_ok=True)
        for item in expected:
            shutil.copyfile(source / "dist" / item["file"], options.output_dir / item["file"])
    print("Verified all SDK outputs against artifacts.json")


if __name__ == "__main__":
    main()
