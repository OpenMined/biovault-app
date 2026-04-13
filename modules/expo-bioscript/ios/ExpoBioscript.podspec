require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ExpoBioscript'
  s.version = package['version']
  s.summary = package['description']
  s.description = 'Expo native module wrapper for running the BioScript runtime inside biovault-app.'
  s.license = package['license']
  s.author = package['author']
  s.homepage = package['homepage']
  s.platforms = {
    :ios => '15.1'
  }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/OpenMined/biovault-app.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
  s.prepare_command = <<-CMD
    set -e
    sh ../scripts/build-rust-ios.sh
  CMD
  s.vendored_frameworks = 'Artifacts/BioscriptFFI.xcframework'

  s.source_files = 'ExpoBioscriptModule.swift'
  s.preserve_paths = '../../bioscript/rust/**/*', '../scripts/**/*', 'Artifacts/BioscriptFFI.xcframework', 'Artifacts/include/**/*'
end
