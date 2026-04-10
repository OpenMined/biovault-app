require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ExpoMonty'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = package['author']
  s.homepage = package['homepage']
  s.platforms = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/pydantic/monty.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}"'
  }
  s.prepare_command = <<-CMD
    set -e
    sh ../scripts/build-rust-ios.sh
  CMD
  s.vendored_libraries = 'Artifacts/*.a'

  s.source_files = 'ExpoMontyFFI.h', 'ExpoMontyModule.swift'
  s.preserve_paths = '../rust/**/*', '../scripts/**/*', '../vendor/**/*', 'Artifacts/*.a'
end
