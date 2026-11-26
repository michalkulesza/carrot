Pod::Spec.new do |s|
  s.name           = 'ScreenCorners'
  s.version        = '1.0.0'
  s.summary        = 'Screen corner radius bridge'
  s.description    = 'Reads the physical screen corner radius through public UIKit corner APIs'
  s.license        = 'MIT'
  s.author         = 'Carrot'
  s.homepage       = 'https://carrot.xcxz.xyz'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
