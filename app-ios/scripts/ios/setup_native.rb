# Agrega las partes nativas al proyecto que genera `npx cap add ios`.
# Corre en la nube (Codemagic / GitHub Actions, macOS). Es idempotente.
#   BUILD_NUMBER  → número de build (lo ponen Codemagic y GitHub solos)
#   APPLE_TEAM_ID → tu Team ID de Apple (10 caracteres)
require 'xcodeproj'
require 'fileutils'
require 'json'

ROOT   = File.expand_path('../..', __dir__)
IOS    = File.join(ROOT, 'ios', 'App')
NATIVE = File.join(ROOT, 'ios-native')
RES    = File.join(ROOT, 'resources')

cfg     = JSON.parse(File.read(File.join(ROOT, 'capacitor.config.json')))
APP_ID  = cfg['appId']
EXT_ID  = "#{APP_ID}.LiveActivity"
VERSION = JSON.parse(File.read(File.join(ROOT, 'package.json')))['version']
BUILD   = (ENV['BUILD_NUMBER'] || ENV['GITHUB_RUN_NUMBER'] || '1').to_s
TEAM    = ENV['APPLE_TEAM_ID']
EXT     = 'VeloLiveActivity'

abort 'Falta ios/App. Corré antes: npx cap add ios' unless File.directory?(IOS)

# 1. Copiar archivos Swift, entitlements y recursos
FileUtils.cp(Dir[File.join(NATIVE, 'App', '*')], File.join(IOS, 'App'))
FileUtils.mkdir_p(File.join(IOS, EXT))
FileUtils.cp(Dir[File.join(NATIVE, EXT, '*')], File.join(IOS, EXT))

icon = File.join(RES, 'icon-1024.png')
FileUtils.cp(icon, File.join(IOS, 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png')) if File.exist?(icon)
splash = File.join(RES, 'splash-2732.png')
if File.exist?(splash)
  dir = File.join(IOS, 'App', 'Assets.xcassets', 'Splash.imageset')
  %w[splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png].each { |n| FileUtils.cp(splash, File.join(dir, n)) if File.exist?(File.join(dir, n)) }
end

# 2. Storyboard → VeloViewController (registra el plugin local)
sb = File.join(IOS, 'App', 'Base.lproj', 'Main.storyboard')
xml = File.read(sb)
xml = xml.gsub('customClass="CAPBridgeViewController" customModule="Capacitor"', 'customClass="VeloViewController" customModule="App" customModuleProvider="target"')
File.write(sb, xml)

# 3. Info.plist de la app
plist_path = File.join(IOS, 'App', 'Info.plist')
pl = Xcodeproj::Plist.read_from_path(plist_path)
pl['CFBundleDisplayName'] = 'BOOST'
pl['NSBluetoothAlwaysUsageDescription'] = 'BOOST usa Bluetooth para conectar tu sensor en la barra y medir cada repetición.'
pl['NSSupportsLiveActivities'] = true
pl['UIBackgroundModes'] = %w[bluetooth-central audio]
pl['UIUserInterfaceStyle'] = 'Light'
pl['UISupportedInterfaceOrientations'] = ['UIInterfaceOrientationPortrait']
pl['ITSAppUsesNonExemptEncryption'] = false
# Ingreso con Google: el SDK vuelve a la app por el client ID invertido.
# Es público (va dentro de la app); la variable de entorno solo lo pisa.
gid = ENV['GOOGLE_IOS_CLIENT_ID'].to_s
gid = '227856547235-cedldjhue6st1ut57rcjp9bpttf2gt1b.apps.googleusercontent.com' if gid.empty?
unless gid.empty?
  scheme = gid.split('.').reverse.join('.')
  pl['CFBundleURLTypes'] = [{ 'CFBundleURLSchemes' => [scheme] }]
  pl['GIDClientID'] = gid
end
Xcodeproj::Plist.write_to_path(pl, plist_path)

# 4. Proyecto Xcode
proj = Xcodeproj::Project.open(File.join(IOS, 'App.xcodeproj'))
app  = proj.targets.find { |t| t.name == 'App' }
app_group = proj.main_group.children.find { |g| g.display_name == 'App' }

def ref_for(group, name)
  group.files.find { |f| f.path == name } || group.new_reference(name)
end

%w[VeloNativePlugin.swift VeloViewController.swift VeloActivityAttributes.swift].each do |f|
  app.source_build_phase.add_file_reference(ref_for(app_group, f), true)
end
ref_for(app_group, 'App.entitlements')
# Manifiesto de privacidad (Apple): va como recurso de la app.
app.resources_build_phase.add_file_reference(ref_for(app_group, 'PrivacyInfo.xcprivacy'), true) unless app.resources_build_phase.files_references.any? { |f| f.path == 'PrivacyInfo.xcprivacy' }

app.build_configurations.each do |c|
  s = c.build_settings
  s['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  s['MARKETING_VERSION'] = VERSION
  s['CURRENT_PROJECT_VERSION'] = BUILD
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['DEVELOPMENT_TEAM'] = TEAM if TEAM
end

# 5. Extensión Live Activity (Dynamic Island + pantalla bloqueada)
ext = proj.targets.find { |t| t.name == EXT }
ext ||= proj.new_target(:app_extension, EXT, :ios, '16.2', nil, :swift)
ext_group = proj.main_group.children.find { |g| g.display_name == EXT } || proj.main_group.new_group(EXT, EXT)

%w[VeloLiveActivityBundle.swift VeloLiveActivityWidget.swift].each do |f|
  ext.source_build_phase.add_file_reference(ref_for(ext_group, f), true)
end
ext.source_build_phase.add_file_reference(ref_for(app_group, 'VeloActivityAttributes.swift'), true)
ext.resources_build_phase.add_file_reference(ref_for(ext_group, 'logo.png'), true)
ref_for(ext_group, 'Info.plist')
ext.add_system_framework(%w[WidgetKit SwiftUI])

ext.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = EXT_ID
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = "#{EXT}/Info.plist"
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2'
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['MARKETING_VERSION'] = VERSION
  s['CURRENT_PROJECT_VERSION'] = BUILD
  s['SKIP_INSTALL'] = 'YES'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
  s['DEVELOPMENT_TEAM'] = TEAM if TEAM
end

app.add_dependency(ext) unless app.dependencies.any? { |d| d.target == ext }
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' }
unless embed
  embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
end
unless embed.files_references.include?(ext.product_reference)
  bf = embed.add_file_reference(ext.product_reference)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end
# Evita el error "Cycle inside App": el embed va justo después de Resources.
app.build_phases.delete(embed)
app.build_phases.insert(app.build_phases.index(app.resources_build_phase) + 1, embed)

proj.save
puts "Nativo listo · #{APP_ID} + #{EXT_ID} · v#{VERSION} (#{BUILD})"
