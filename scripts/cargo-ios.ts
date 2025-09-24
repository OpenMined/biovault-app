import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const TARGETS: Record<string, string> = {
	ios: 'aarch64-apple-ios',
	'ios-sim': 'aarch64-apple-ios-sim',
	'ios-sim-x86': 'x86_64-apple-ios',
	universal: 'universal-apple-darwin', // Add universal target
}

function cargoBuild(target: string) {
	spawnSync('cargo', ['build', '--release', '--target', target], {
		stdio: 'inherit',
	})
}

function getTarget() {
	const args = process.argv.slice(2)
	const target = (args[0] ?? '').replace('--target=', '')

	if (target !== 'ios' && target !== 'ios-sim' && target !== 'universal') {
		console.error(
			`Invalid target ${target} found. Please specify --target='ios', --target='ios-sim', or --target='universal'`
		)
		process.exit(1)
	}

	return target
}

function main() {
	const targetKey = getTarget()
	const target = TARGETS[targetKey]
	if (!target) {
		console.error(`Target not found for key: ${targetKey}`)
		process.exit(1)
	}
	console.log(`Building ios for target ${target}`)

	process.chdir('biovault_rust_lib')

	if (targetKey === 'universal') {
		// Build all iOS targets and create universal library
		console.log('Building universal iOS library')
		Object.values(TARGETS).forEach(cargoBuild)

		console.log('Generating bindings for ios')
		spawnSync(
			'cbindgen',
			['--lang', 'c', '--crate', 'biovault_rust_lib', '--output', 'biovault_rust_lib.h'],
			{
				stdio: 'inherit',
			}
		)

		process.chdir('..')

		const destinationPath = path.join(process.cwd(), 'modules', 'expo-biovault', 'ios', 'rust')
		const rustHeadersPath = path.join(process.cwd(), 'biovault_rust_lib', 'biovault_rust_lib.h')

		if (!fs.existsSync(destinationPath)) {
			fs.mkdirSync(destinationPath, { recursive: true })
		}

		// Create universal library with lipo
		const deviceLib = path.join(
			process.cwd(),
			'biovault_rust_lib',
			'target',
			'aarch64-apple-ios',
			'release',
			'libbiovault_rust_lib.a'
		)
		const simLib = path.join(
			process.cwd(),
			'biovault_rust_lib',
			'target',
			'aarch64-apple-ios-sim',
			'release',
			'libbiovault_rust_lib.a'
		)
		const universalLib = path.join(destinationPath, 'libbiovault_rust_lib.a')

		console.log('Creating universal library with lipo')
		const lipoResult = spawnSync('lipo', ['-create', deviceLib, simLib, '-output', universalLib], {
			stdio: 'inherit',
		})

		if (lipoResult.status !== 0) {
			console.log('lipo failed, copying simulator library only')
			fs.copyFileSync(simLib, universalLib)
		}

		fs.copyFileSync(rustHeadersPath, path.join(destinationPath, 'biovault_rust_lib.h'))
	} else {
		// Build single target
		console.log('Building rust library for ios')
		cargoBuild(target)

		console.log('Generating bindings for ios')
		spawnSync(
			'cbindgen',
			['--lang', 'c', '--crate', 'biovault_rust_lib', '--output', 'biovault_rust_lib.h'],
			{
				stdio: 'inherit',
			}
		)

		process.chdir('..')

		const destinationPath = path.join(process.cwd(), 'modules', 'expo-biovault', 'ios', 'rust')
		const rustLibPath = path.join(
			process.cwd(),
			'biovault_rust_lib',
			'target',
			target,
			'release',
			'libbiovault_rust_lib.a'
		)
		const rustHeadersPath = path.join(process.cwd(), 'biovault_rust_lib', 'biovault_rust_lib.h')

		if (!fs.existsSync(destinationPath)) {
			fs.mkdirSync(destinationPath, { recursive: true })
		}
		fs.copyFileSync(rustLibPath, path.join(destinationPath, 'libbiovault_rust_lib.a'))
		fs.copyFileSync(rustHeadersPath, path.join(destinationPath, 'biovault_rust_lib.h'))
	}
}

main()
