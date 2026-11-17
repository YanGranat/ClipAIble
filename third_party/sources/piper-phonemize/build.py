"""Build the packaged phonemizer on Windows with pinned source and toolchains.

Run from the repository root with Python 3.12 or newer:
    python third_party/sources/piper-phonemize/build.py

The three outputs are written below temporary_files/piper-source-build/output.
Use --output-dir lib/piper-wasm to replace the packaged runtime files.
"""

from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile


KIT = Path(__file__).resolve().parent
PROJECT = KIT.parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_file(path, expected):
    if digest(path) != expected:
        raise RuntimeError(f"Checksum mismatch: {path.name}")
    return path


def download(url, path, expected):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=180) as response, path.open("wb") as out:
            shutil.copyfileobj(response, out)
    return checked_file(path, expected)


def extract(archive, destination):
    if destination.exists():
        return
    destination.mkdir(parents=True)
    with tarfile.open(archive) as source:
        links = []
        for member in source.getmembers():
            parts = Path(member.name).parts[1:]
            if not parts:
                continue
            if ".." in parts or Path(*parts).is_absolute():
                raise RuntimeError("Unsafe source archive path")
            member.name = Path(*parts).as_posix()
            if member.issym() or member.islnk():
                links.append(member)
            else:
                source.extract(member, destination, filter="data")
        for member in links:
            target = destination / member.name
            original = (target.parent / member.linkname).resolve()
            if not original.is_relative_to(destination.resolve()):
                raise RuntimeError("Unsafe source archive link")
            shutil.copyfile(original, target)


def unzip(archive, destination):
    if destination.exists():
        return
    with zipfile.ZipFile(archive) as source:
        for name in source.namelist():
            if not (destination / name).resolve().is_relative_to(destination.resolve()):
                raise RuntimeError("Unsafe tool archive path")
        source.extractall(destination)


def run(command, work, env, label):
    print(label, flush=True)
    result = subprocess.run([str(x) for x in command], cwd=work, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (work / (label + ".log")).write_bytes(result.stdout)
    if result.returncode:
        print(result.stdout.decode("utf-8", errors="replace")[-6000:])
        raise RuntimeError(f"{label} failed ({result.returncode})")


def patch_dictionary(source):
    file = source / "src/libespeak-ng/compiledict.c"
    text = file.read_text(encoding="utf-8")
    replacements = [
        ("int group3_ix;\n} RGROUP;", "int group3_ix;\n\tint source_order;\n} RGROUP;"),
        ("return (uintptr_t)a->start - (uintptr_t)b->start;",
         "return (a->source_order > b->source_order) - (a->source_order < b->source_order);"),
        ("rgroup[n_rgroups].group3_ix = ctx->group3_ix;",
         "rgroup[n_rgroups].group3_ix = ctx->group3_ix;\n\t\t\t\trgroup[n_rgroups].source_order = n_rgroups;"),
    ]
    for before, after in replacements:
        if text.count(before) != 1:
            raise RuntimeError("Unsupported dictionary compiler source")
        text = text.replace(before, after)
    file.write_text(text, encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, default=PROJECT / "temporary_files/piper-source-build")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--emsdk", type=Path, help="Mutable Emscripten 3.1.47 embedded installation; wchar.h is patched")
    parser.add_argument("--compiler-dir", type=Path, help="Existing LLVM-MinGW 20240619 bin directory")
    parser.add_argument("--cmake", type=Path)
    parser.add_argument("--ninja", type=Path)
    args = parser.parse_args()
    if sys.version_info < (3, 12):
        raise RuntimeError("Python 3.12 or newer is required")
    if sys.platform != "win32":
        raise RuntimeError("This recipe uses the Windows x64 toolchains")
    work = args.work_dir.resolve()
    if work.exists() and any(work.iterdir()):
        raise RuntimeError("Use an empty work directory")
    work.mkdir(parents=True, exist_ok=True)
    output = (args.output_dir or work / "output").resolve()
    sources = json.loads((KIT / "sources.json").read_text(encoding="utf-8"))
    tools = json.loads((KIT / "toolchains.json").read_text(encoding="utf-8"))
    for item in sources:
        extract(checked_file(KIT / (item["name"] + ".tar.gz"), item["sha256"]),
                work / "src" / item["name"])
    for name in ["espeak-host", "espeak-wasm"]:
        patch_dictionary(work / "src" / name)
    env = os.environ.copy()
    env["SOURCE_DATE_EPOCH"] = "1712016000"
    env["PYTHONIOENCODING"] = "utf-8"
    env["EMSDK_KEEP_DOWNLOADS"] = "1"
    sdk = args.emsdk.resolve() if args.emsdk else work / "src/emsdk"
    if not args.emsdk:
        run([sys.executable, sdk / "emsdk.py", "install", "3.1.47"], work, env, "sdk-install")
    for name, expected in tools["emsdk"]["archives"].items():
        checked_file(sdk / "downloads" / name, expected)
    for name, expected in tools["emsdk"]["executables"].items():
        checked_file(sdk / name, expected)
    if not args.emsdk:
        run([sys.executable, sdk / "emsdk.py", "activate", "3.1.47", "--embedded"], work, env, "sdk-activate")
    if args.compiler_dir:
        compiler = args.compiler_dir.resolve()
    else:
        item = tools["llvm-mingw"]
        archive = download(item["url"], work / "downloads/llvm-mingw.zip", item["sha256"])
        unzip(archive, work / "tools")
        compiler = work / "tools/llvm-mingw-20240619-ucrt-x86_64/bin"
    local_tools = {}
    for name in ["cmake", "ninja"]:
        existing = getattr(args, name)
        if existing:
            local_tools[name] = existing.resolve()
        else:
            item = tools[name]
            wheel = download(item["url"], work / "downloads" / item["filename"], item["sha256"])
            run([sys.executable, "-m", "pip", "install", "--no-index", "--no-deps", "--no-cache-dir",
                 "--target", work / "python-tools", wheel], work, env, "install-" + name)
            subdir = "cmake/data/bin" if name == "cmake" else "ninja/data/bin"
            local_tools[name] = work / "python-tools" / subdir / (name + ".exe")
    cmake, ninja = local_tools["cmake"], local_tools["ninja"]
    checked_file(cmake, tools["cmake"]["executableSha256"])
    checked_file(ninja, tools["ninja"]["executableSha256"])
    checked_file(compiler / "x86_64-w64-mingw32-clang.exe", tools["llvm-mingw"]["compilerSha256"])
    checked_file(compiler / "x86_64-w64-mingw32-clang++.exe", tools["llvm-mingw"]["compilerCxxSha256"])
    env["PATH"] = str(compiler) + ";" + str(ninja.parent) + ";" + env["PATH"]
    native = work / "native"
    host = work / "host"
    flags = ["-DBUILD_ESPEAK_NG_TESTS=OFF", "-DBUILD_SHARED_LIBS=OFF", "-DUSE_ASYNC=OFF",
             "-DHAVE_MBROLA=ON", "-DUSE_MBROLA=ON", "-DUSE_LIBSONIC=OFF", "-DUSE_LIBPCAUDIO=OFF",
             "-DUSE_KLATT=OFF", "-DUSE_SPEECHPLAYER=OFF"]
    run([cmake, "-S", (work / "src/espeak-host").as_posix(), "-B", native.as_posix(), "-G", "Ninja",
         "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_MAKE_PROGRAM=" + ninja.as_posix(),
         "-DCMAKE_C_COMPILER=" + (compiler / "x86_64-w64-mingw32-clang.exe").as_posix(),
         "-DCMAKE_CXX_COMPILER=" + (compiler / "x86_64-w64-mingw32-clang++.exe").as_posix(),
         "-DCMAKE_INSTALL_PREFIX=" + host.as_posix(),
         "-DFETCHCONTENT_SOURCE_DIR_SONIC-GIT=" + (work / "src/sonic").as_posix(), *flags], work, env, "native-configure")
    run([cmake, "--build", native, "--parallel", "2"], work, env, "native-build")
    run([cmake, "--install", native], work, env, "native-install")
    data = work / "preload/espeak-ng-data"
    shutil.copytree(host / "share/espeak-ng-data", data)
    manifest = data / "phondata-manifest"
    manifest.write_text(manifest.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
    header = sdk / "upstream/emscripten/cache/sysroot/include/wchar.h"
    text = header.read_text(encoding="utf-8")
    pattern = r"(?m)^int\s+(iswalnum|iswalpha|iswblank|iswcntrl|iswgraph|iswlower|iswprint|iswpunct|iswspace|iswupper|iswxdigit)\s*\(wint_t\)"
    changed, count = re.subn(pattern, lambda match: "//" + match.group(), text)
    if count not in [0, 11]:
        raise RuntimeError("Unsupported Emscripten wchar declarations")
    if count:
        header.write_text(changed, encoding="utf-8", newline="\n")
    env.update(EMSDK=sdk.as_posix(), EM_CONFIG=(sdk / ".emscripten").as_posix(),
               EM_CACHE=(sdk / "upstream/emscripten/cache").as_posix(),
               EMSDK_NODE=(sdk / "node/16.20.0_64bit/bin/node.exe").as_posix(),
               EMSDK_PYTHON=(sdk / "python/3.9.2-nuget_64bit/python.exe").as_posix())
    env["PATH"] = str(sdk / "upstream/emscripten") + ";" + env["PATH"]
    wasm = work / "wasm"
    run([cmake, "-S", KIT.as_posix(), "-B", wasm.as_posix(), "-G", "Ninja",
         "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_MAKE_PROGRAM=" + ninja.as_posix(),
         "-DCMAKE_TOOLCHAIN_FILE=" + (sdk / "upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake").as_posix(),
         "-DPIPER_SOURCE=" + (work / "src/phonemize").as_posix(),
         "-DESPEAK_SOURCE=" + (work / "src/espeak-wasm").as_posix(),
         "-DSONIC_SOURCE=" + (work / "src/sonic").as_posix(),
         "-DESPEAK_DATA=" + data.as_posix()], work, env, "wasm-configure")
    run([cmake, "--build", wasm, "--target", "piper_phonemize", "--parallel", "2"], work, env, "wasm-build")
    output.mkdir(parents=True, exist_ok=True)
    for item in json.loads((KIT / "artifacts.json").read_text(encoding="utf-8")):
        built = checked_file(wasm / item["file"], item["sha256"])
        shutil.copyfile(built, output / item["file"])
    print(f"Phonemizer built: {output}")


if __name__ == "__main__":
    main()
