param([switch]$NoShortcut, [string[]]$CMakeArgs = @())
# Builds Skytail.exe (Win32 + threejs-rendozer on DX12) from the tree staged
# by windows/build-windows.mjs, then puts a "Skytail" shortcut on the desktop.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$windows = $PSScriptRoot
$root = Split-Path $windows -Parent
Set-Location $root

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Install the Visual Studio C++ Build Tools.' }
$setup = 'call "' + $vs + '\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul && set'
& cmd.exe /s /c $setup | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }
}
if ($LASTEXITCODE) { throw 'Could not initialize the x64 compiler environment.' }
$cmake = "$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
$ninja = "$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe"
$clang = ("$vs\VC\Tools\Llvm\x64\bin\clang-cl.exe") -replace '\\', '/'
$common = @('-G', 'Ninja', "-DCMAKE_MAKE_PROGRAM=$ninja", "-DCMAKE_C_COMPILER=$clang", "-DCMAKE_CXX_COMPILER=$clang",
  '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL', '-DCMAKE_POLICY_DEFAULT_CMP0091=NEW')

# glslang + SPIRV-Cross, once.
$toolchain = Join-Path $root 'toolchain'
if (!(Test-Path (Join-Path $toolchain 'lib\spirv-cross-hlsl.lib'))) {
  & $cmake -S vendor/glslang -B build/glslang @common "-DCMAKE_INSTALL_PREFIX=$toolchain" `
    -DENABLE_OPT=OFF -DGLSLANG_TESTS=OFF -DENABLE_GLSLANG_BINARIES=OFF -DENABLE_HLSL=OFF -DBUILD_SHARED_LIBS=OFF
  if ($LASTEXITCODE) { throw 'glslang configuration failed.' }
  & $cmake --build build/glslang --target install
  if ($LASTEXITCODE) { throw 'glslang build failed.' }
  & $cmake -S vendor/SPIRV-Cross -B build/spirv-cross @common "-DCMAKE_INSTALL_PREFIX=$toolchain" `
    -DSPIRV_CROSS_CLI=OFF -DSPIRV_CROSS_ENABLE_TESTS=OFF -DSPIRV_CROSS_ENABLE_MSL=OFF -DSPIRV_CROSS_ENABLE_CPP=OFF `
    -DSPIRV_CROSS_ENABLE_C_API=OFF -DSPIRV_CROSS_ENABLE_REFLECT=OFF -DSPIRV_CROSS_ENABLE_UTIL=OFF
  if ($LASTEXITCODE) { throw 'SPIRV-Cross configuration failed.' }
  & $cmake --build build/spirv-cross --target install
  if ($LASTEXITCODE) { throw 'SPIRV-Cross build failed.' }
}

# Window icon.
$icon = Join-Path $windows 'skytail.ico'
if (!(Test-Path $icon)) {
  Add-Type -AssemblyName System.Drawing
  $bitmap = New-Object Drawing.Bitmap(64, 64)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#f7d9aa'))
  $font = New-Object Drawing.Font('Arial', 38, [Drawing.FontStyle]::Bold)
  $format = New-Object Drawing.StringFormat
  $format.Alignment = [Drawing.StringAlignment]::Center
  $format.LineAlignment = [Drawing.StringAlignment]::Center
  $brush = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#009999'))
  $graphics.DrawString('S', $font, $brush, [Drawing.RectangleF]::new(0, 2, 64, 64), $format)
  $stream = [IO.File]::Create($icon)
  [Drawing.Icon]::FromHandle($bitmap.GetHicon()).Save($stream)
  $stream.Dispose(); $brush.Dispose(); $format.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

& $cmake -S windows -B build/skytail @common @CMakeArgs
if ($LASTEXITCODE) { throw 'Skytail CMake configuration failed.' }
& $cmake --build build/skytail --parallel 8
if ($LASTEXITCODE) { throw 'Skytail build failed.' }

# Runtime layout next to Skytail.exe.
$out = Join-Path $root 'build\skytail\Skytail'
New-Item -ItemType Directory -Force (Join-Path $out 'd3d12') | Out-Null
Copy-Item rendozer\data\d3d12\D3D12Core.dll (Join-Path $out 'd3d12') -Force
Copy-Item rendozer\data\dxc\dxcompiler.dll, rendozer\data\dxc\dxil.dll $out -Force
if (Test-Path app\Sounds) { Copy-Item app\Sounds $out -Recurse -Force }
if (Test-Path "$out\Skytail.exe") { Write-Host "Built $out\Skytail.exe" } else { Write-Host "Built $out (no staged game: GeaRendozerGLES only)" }

if (!$NoShortcut) {
  $shell = New-Object -ComObject WScript.Shell
  $desktops = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory')) |
    Where-Object { $_ } | Select-Object -Unique
  foreach ($desktop in $desktops) {
    $link = $shell.CreateShortcut((Join-Path $desktop 'Skytail.lnk'))
    $link.TargetPath = Join-Path $out 'Skytail.exe'
    $link.WorkingDirectory = $out
    $link.IconLocation = (Join-Path $out 'Skytail.exe') + ',0'
    $link.Description = 'Skytail (three.js on rendozer / DX12)'
    try { $link.Save(); Write-Host "Shortcut: $desktop\Skytail.lnk" } catch { Write-Warning "Could not write $desktop\Skytail.lnk: $_" }
  }
}
