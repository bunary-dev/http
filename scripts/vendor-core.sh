#!/usr/bin/env bash
# Vendors @bunary/core at a pinned tag into vendor/ as a tarball produced by
# `bun pm pack`, for use as a file: devDependency (and the runtime shape of
# the optional peerDependency) without either package being on npm.
#
# Usage: scripts/vendor-core.sh [tag]
#   tag defaults to v1.0.0-rc.1

set -euo pipefail

TAG="${1:-v1.0.0-rc.1}"
REPO_URL="https://github.com/bunary-dev/core"
PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${PACKAGE_ROOT}/vendor"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

echo "Cloning ${REPO_URL} at ${TAG}..."
git clone --depth 1 --branch "${TAG}" "${REPO_URL}" "${WORKDIR}/core"

echo "Installing and building @bunary/core..."
(cd "${WORKDIR}/core" && bun install && bun run build)

mkdir -p "${VENDOR_DIR}"

echo "Packing tarball into ${VENDOR_DIR}..."
TARBALL_PATH="$(cd "${WORKDIR}/core" && bun pm pack --destination "${VENDOR_DIR}" --quiet)"

echo "Vendored tarball: ${TARBALL_PATH}"
