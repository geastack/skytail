param([string]$AngleDir = $env:GEA_XBOX_ANGLE_DIR)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-Location $PSScriptRoot
if (!$AngleDir -or !(Test-Path -LiteralPath $AngleDir -PathType Container)) {
  throw 'Pass -AngleDir or set GEA_XBOX_ANGLE_DIR to the directory that contains the UWP ANGLE DLLs.'
}
foreach ($library in @('libEGL.dll', 'libGLESv2.dll', 'd3dcompiler_47.dll')) {
  if (!(Test-Path -LiteralPath (Join-Path $AngleDir $library) -PathType Leaf)) { throw "ANGLE library is missing: $library" }
}
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -version '[18.0,19.0)' -products * -requires Microsoft.VisualStudio.ComponentGroup.UWP.VC.BuildTools -property installationPath
if (!$vs) { throw 'Install the Visual Studio 2026 C++/UWP Build Tools (standard multiline regex support is required).' }

$setup = 'call "' + $vs + '\VC\Auxiliary\Build\vcvarsall.bat" x64 uwp 10.0.26100.0 >nul && set'
& cmd.exe /s /c $setup | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }
}
if ($LASTEXITCODE) { throw 'Could not initialize the UWP compiler environment.' }
$cmake = "$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
$ninja = "$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe"
$clang = "$vs\VC\Tools\Llvm\x64\bin\clang-cl.exe"
& $cmake -S . -B build -G Ninja "-DCMAKE_MAKE_PROGRAM=$ninja" "-DCMAKE_CXX_COMPILER=$clang" -DCMAKE_BUILD_TYPE=Release -DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY
if ($LASTEXITCODE) { throw 'Native CMake configuration failed.' }
& $cmake --build build --parallel 6
if ($LASTEXITCODE) { throw 'Gea-generated C++ compilation failed.' }

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force Assets | Out-Null
$tiles = @{ Square150x150Logo = @(150,150); Square44x44Logo = @(44,44); Wide310x150Logo = @(310,150); StoreLogo = @(50,50); SplashScreen = @(620,300) }
$brush = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#009999'))
foreach ($name in $tiles.Keys) {
  $size = $tiles[$name]
  $text = if ($size[0] -ge 2 * $size[1]) { 'SKYTAIL' } else { 'S' }
  $image = New-Object System.Drawing.Bitmap($size[0], $size[1])
  $graphics = [Drawing.Graphics]::FromImage($image)
  try {
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#f7d9aa'))
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $format = New-Object Drawing.StringFormat
    $format.Alignment = [Drawing.StringAlignment]::Center
    $format.LineAlignment = [Drawing.StringAlignment]::Center
    $points = [Math]::Max(6, [int]($size[1] * 0.7))
    while ($points -gt 5) {
      $candidate = New-Object Drawing.Font('Arial', $points, [Drawing.FontStyle]::Bold)
      $measured = $graphics.MeasureString($text, $candidate)
      if ($measured.Width -le $size[0] * 0.86 -and $measured.Height -le $size[1] * 0.8) { $font = $candidate; break }
      $candidate.Dispose()
      $points -= 1
    }
    if (!$font) { $font = New-Object Drawing.Font('Arial', 6, [Drawing.FontStyle]::Bold) }
    $graphics.DrawString($text, $font, $brush, [Drawing.RectangleF]::new(0, 0, $size[0], $size[1]), $format)
    $image.Save((Join-Path $PSScriptRoot "Assets\$name.png"), [Drawing.Imaging.ImageFormat]::Png)
    $format.Dispose()
  } finally { if ($font) { $font.Dispose(); $font = $null }; $graphics.Dispose(); $image.Dispose() }
}
$brush.Dispose()
# A changed manifest can have an older timestamp than MSBuild's generated copy.
# Update its timestamp to force packaging to use the staged contents.
(Get-Item Package.appxmanifest).LastWriteTime = Get-Date
& "$vs\MSBuild\Current\Bin\MSBuild.exe" GeaAviatorThree.vcxproj /m:4 /nologo /verbosity:minimal /p:Configuration=Release /p:Platform=x64 "/p:AngleDir=$AngleDir" /p:AppxBundle=Never /p:UapAppxPackageBuildMode=SideloadOnly /p:AppxPackageSigningEnabled=false
if ($LASTEXITCODE) { throw 'UWP packaging failed.' }

# The machine certificate store permits signing from the administrative SSH session without an interactive user's login.
# Keep the private key nonexportable.
$certificate = Get-ChildItem Cert:\LocalMachine\My -CodeSigningCert | Where-Object {
  $_.Subject -eq 'CN=GeaDev' -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(1)
} | Sort-Object NotAfter -Descending | Select-Object -First 1
if (!$certificate) {
  $certificate = New-SelfSignedCertificate -Type Custom -Subject 'CN=GeaDev' -FriendlyName 'Gea Xbox development' `
    -KeyUsage DigitalSignature -KeyExportPolicy NonExportable -CertStoreLocation Cert:\LocalMachine\My `
    -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
}
$package = Get-ChildItem AppPackages -Recurse -File | Where-Object {
  $_.Extension -in @('.msix', '.appx') -and $_.Name -notlike 'Microsoft.*'
} | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$package) { throw 'MSBuild produced no application package.' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($package.FullName)
try {
  $entry = $archive.GetEntry('AppxManifest.xml')
  if (!$entry) { throw 'Packaged AppxManifest.xml is missing.' }
  $reader = New-Object IO.StreamReader($entry.Open())
  try { $packagedManifest = [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
  $expectedManifest = [xml](Get-Content Package.appxmanifest -Raw)
  foreach ($field in @('Name', 'Publisher', 'Version', 'ProcessorArchitecture')) {
    if ($packagedManifest.Package.Identity.$field -ne $expectedManifest.Package.Identity.$field) {
      throw "Packaged identity $field differs from the staged manifest. Refusing stale package."
    }
  }
} finally { $archive.Dispose() }

$signtool = "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
& $signtool sign /sm /fd SHA256 /sha1 $certificate.Thumbprint $package.FullName
if ($LASTEXITCODE) { throw 'Package signing failed.' }
New-Item -ItemType Directory -Force build\artifacts | Out-Null
Copy-Item $package.FullName build\artifacts\GeaSkytailXbox.msix -Force
Export-Certificate -Cert $certificate -FilePath build\artifacts\GeaDev.cer | Out-Null
$dependencies = Join-Path $package.Directory.FullName 'Dependencies\x64'
if (Test-Path $dependencies) { Copy-Item "$dependencies\*.appx" build\artifacts -Force }
Write-Host "Signed package: $PSScriptRoot\build\artifacts\GeaSkytailXbox.msix"
