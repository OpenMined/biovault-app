#!/usr/bin/env bash
set -euo pipefail

checkout_commit() {
	local path="$1"
	local repo="$2"
	local sha="$3"

	rm -rf "$path"
	git init "$path"
	git -C "$path" remote add origin "$repo"
	git -C "$path" fetch --depth 1 origin "$sha"
	git -C "$path" checkout --detach FETCH_HEAD
}

bioscript_sha="$(git rev-parse HEAD:bioscript)"
exvitae_sha="$(git rev-parse HEAD:exvitae)"

checkout_commit bioscript https://github.com/OpenMined/bioscript.git "$bioscript_sha"

monty_sha="$(git -C bioscript rev-parse HEAD:monty)"
noodles_sha="$(git -C bioscript rev-parse HEAD:noodles)"

checkout_commit bioscript/monty https://github.com/madhavajay/monty.git "$monty_sha"
checkout_commit bioscript/noodles https://github.com/madhavajay/noodles.git "$noodles_sha"
checkout_commit exvitae https://github.com/madhavajay/exvitae.git "$exvitae_sha"
