#!/usr/bin/env python3
"""Fail closed when ShipTeam's version projections or release artifacts drift."""

from __future__ import annotations

import argparse
import re
import sys
import tarfile
import zipfile
from email.parser import Parser
from pathlib import Path


SEMVER_RE = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")
EXACT_SEMVER_RE = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+\Z")


class VersionIntegrityError(ValueError):
    """Raised when a version source, projection, tag, or artifact is invalid."""


def _read_exact_version(path: Path, label: str) -> str:
    if not path.is_file():
        raise VersionIntegrityError(f"{label} not found: {path}")
    value = path.read_text(encoding="utf-8").strip()
    if not EXACT_SEMVER_RE.fullmatch(value):
        raise VersionIntegrityError(f"{label} must contain only X.Y.Z; got {value!r}")
    return value


def _unquote_yaml_scalar(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def configured_version_locations(config_path: Path) -> list[Path]:
    """Read versioning.locations file entries without requiring a YAML dependency."""
    if not config_path.is_file():
        raise VersionIntegrityError(f"version config not found: {config_path}")

    locations: list[Path] = []
    in_versioning = False
    in_locations = False
    for line in config_path.read_text(encoding="utf-8").splitlines():
        if line == "versioning:":
            in_versioning = True
            continue
        if in_versioning and line and not line.startswith(" "):
            break
        if in_versioning and line == "  locations:":
            in_locations = True
            continue
        if in_locations:
            match = re.fullmatch(r"    - file:\s*(.+)", line)
            if match:
                location = Path(_unquote_yaml_scalar(match.group(1)))
                if location.is_absolute() or ".." in location.parts:
                    raise VersionIntegrityError(
                        f"versioning.locations path must stay within the repository: {location}"
                    )
                locations.append(location)

    if not locations:
        raise VersionIntegrityError(f"versioning.locations has no file entries: {config_path}")
    if len(locations) != len(set(locations)):
        raise VersionIntegrityError("versioning.locations contains duplicate file entries")
    return locations


def configured_primary_source(config_path: Path) -> Path:
    """Read versioning.primary_source without requiring a YAML dependency."""
    if not config_path.is_file():
        raise VersionIntegrityError(f"version config not found: {config_path}")

    in_versioning = False
    for line in config_path.read_text(encoding="utf-8").splitlines():
        if line == "versioning:":
            in_versioning = True
            continue
        if in_versioning and line and not line.startswith(" "):
            break
        if in_versioning:
            match = re.fullmatch(r"  primary_source:\s*(.+)", line)
            if match:
                return Path(_unquote_yaml_scalar(match.group(1)))

    raise VersionIntegrityError(f"versioning.primary_source is not configured: {config_path}")


def _first_version(path: Path) -> str:
    if not path.is_file():
        raise VersionIntegrityError(f"configured version file not found: {path}")
    match = SEMVER_RE.search(path.read_text(encoding="utf-8"))
    if not match:
        raise VersionIntegrityError(f"configured version file contains no X.Y.Z value: {path}")
    return match.group(0)


def _hatch_uses_canonical_version(pyproject: Path) -> bool:
    if not pyproject.is_file():
        return False
    content = pyproject.read_text(encoding="utf-8")
    section = re.search(
        r"^\[tool\.hatch\.version\]\s*$\n(?P<body>.*?)(?=^\[|\Z)",
        content,
        re.MULTILINE | re.DOTALL,
    )
    if section is None:
        return False
    return bool(
        re.search(
            r'^path\s*=\s*["\']VERSION["\']\s*$',
            section.group("body"),
            re.MULTILINE,
        )
    )


def verify_repository(root: Path, expected: str | None = None) -> str:
    root = root.resolve()
    canonical = _read_exact_version(root / "VERSION", "canonical VERSION")
    if expected is not None and canonical != expected:
        raise VersionIntegrityError(
            f"canonical VERSION mismatch: expected {expected}, got {canonical}"
        )

    config_path = root / "config" / "framework.yaml"
    primary_source = configured_primary_source(config_path)
    if primary_source != Path("VERSION"):
        raise VersionIntegrityError(
            f"versioning.primary_source must be canonical VERSION; got {primary_source}"
        )

    locations = configured_version_locations(config_path)
    if Path("VERSION") not in locations:
        raise VersionIntegrityError("versioning.locations must include canonical VERSION")
    if Path("src/shipteam/__init__.py") not in locations:
        raise VersionIntegrityError(
            "versioning.locations must include runtime src/shipteam/__init__.py"
        )

    errors: list[str] = []
    for relative_path in locations:
        projection = (root / relative_path).resolve()
        try:
            projection.relative_to(root)
        except ValueError:
            errors.append(f"{relative_path}: resolves outside repository")
            continue
        actual = _first_version(projection)
        if actual != canonical:
            errors.append(f"{relative_path}: expected {canonical}, got {actual}")

    pyproject = root / "pyproject.toml"
    if not _hatch_uses_canonical_version(pyproject):
        errors.append("pyproject.toml: [tool.hatch.version] path must be VERSION")

    if errors:
        raise VersionIntegrityError("version integrity failed:\n- " + "\n- ".join(errors))
    return canonical


def _metadata_version(raw_metadata: str, artifact: Path) -> str:
    version = Parser().parsestr(raw_metadata).get("Version")
    if version is None or not EXACT_SEMVER_RE.fullmatch(version):
        raise VersionIntegrityError(
            f"{artifact.name}: package metadata has invalid Version {version!r}"
        )
    return version


def _wheel_version(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        metadata_names = [
            name for name in archive.namelist() if name.endswith(".dist-info/METADATA")
        ]
        if len(metadata_names) != 1:
            raise VersionIntegrityError(
                f"{path.name}: expected one .dist-info/METADATA, found {len(metadata_names)}"
            )
        raw = archive.read(metadata_names[0]).decode("utf-8")
    return _metadata_version(raw, path)


def _sdist_version(path: Path) -> str:
    with tarfile.open(path, mode="r:gz") as archive:
        metadata_members = [
            member
            for member in archive.getmembers()
            if member.isfile() and Path(member.name).name == "PKG-INFO"
        ]
        if len(metadata_members) != 1:
            raise VersionIntegrityError(
                f"{path.name}: expected one PKG-INFO, found {len(metadata_members)}"
            )
        extracted = archive.extractfile(metadata_members[0])
        if extracted is None:
            raise VersionIntegrityError(f"{path.name}: could not read PKG-INFO")
        raw = extracted.read().decode("utf-8")
    return _metadata_version(raw, path)


def verify_artifacts(dist_dir: Path, expected: str) -> list[Path]:
    if not dist_dir.is_dir():
        raise VersionIntegrityError(f"artifact directory not found: {dist_dir}")

    wheels = sorted(dist_dir.glob("*.whl"))
    sdists = sorted(dist_dir.glob("*.tar.gz"))
    if len(wheels) != 1 or len(sdists) != 1:
        raise VersionIntegrityError(
            "release must contain exactly one wheel and one sdist; "
            f"found {len(wheels)} wheel(s) and {len(sdists)} sdist(s)"
        )

    versions = [(wheels[0], _wheel_version(wheels[0])), (sdists[0], _sdist_version(sdists[0]))]
    mismatches = [
        f"{path.name}: expected {expected}, got {actual}"
        for path, actual in versions
        if actual != expected
    ]
    if mismatches:
        raise VersionIntegrityError("artifact version mismatch:\n- " + "\n- ".join(mismatches))
    return [path for path, _ in versions]


def verify_tag(tag: str, expected: str) -> None:
    if tag != f"v{expected}":
        raise VersionIntegrityError(f"release tag mismatch: expected v{expected}, got {tag!r}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--expected", help="Expected canonical X.Y.Z value")
    parser.add_argument("--tag", help="Expected release tag in vX.Y.Z form")
    parser.add_argument("--artifacts", type=Path, help="Directory containing one wheel and sdist")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        version = verify_repository(args.root, args.expected)
        if args.tag is not None:
            verify_tag(args.tag, version)
        artifacts: list[Path] = []
        if args.artifacts is not None:
            artifacts = verify_artifacts(args.artifacts, version)
    except (
        OSError,
        UnicodeError,
        VersionIntegrityError,
        tarfile.TarError,
        zipfile.BadZipFile,
    ) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"PASS repository version integrity: {version}")
    if args.tag is not None:
        print(f"PASS release tag: {args.tag}")
    for artifact in artifacts:
        print(f"PASS artifact version: {artifact.name} ({version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
