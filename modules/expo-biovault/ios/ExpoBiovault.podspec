Pod::Spec.new do |s|
  s.name           = 'ExpoBiovault'
  s.version        = '0.7.6'
  s.summary        = 'Expo module for BioVault native genome parsing.'
  s.description    = 'BioVault native Expo module backed by Rust for genome file parsing.'
  s.author         = 'OpenMined'
  s.homepage       = 'https://github.com/OpenMined/biovault-app'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: 'https://github.com/OpenMined/biovault-app.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
  s.prepare_command = <<-CMD
    set -e
    sh ../scripts/build-rust-ios.sh
  CMD

  s.source_files = "ExpoBiovaultModule.swift", "rust/expo_biovault_ffi.h"
  s.public_header_files = "rust/expo_biovault_ffi.h"
  s.header_mappings_dir = "rust"
  s.vendored_libraries = 'rust/*.a'
  s.preserve_paths = 'rust/**/*', '../scripts/**/*'
end
